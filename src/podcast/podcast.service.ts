import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
  CreatePodcastDto,
  PodcastCallbackPayload,
  UsageInfo,
} from './dto/podcast-tts.dto';
import {
  PodcastProtocol,
  EventType,
  MsgType,
  PodcastRoundStartPayload,
  PodcastRoundEndPayload,
  PodcastEndPayload,
} from './podcast-protocol.util';
import { MinioService } from '../minio/minio.service';
import { CallbackService } from './callback.service';
import { SubtitleManager, generateSRT } from './subtitle.util';

interface RoundAudio {
  roundId: number;
  speaker: string;
  audioUrl: string;
}

interface TaskContext {
  taskId: string;
  inputId: string; // 用户提供的输入ID，用于文件路径
  sessionId: string;
  callbackUrl: string;
  audioFormat: string;
  audioChunks: Buffer[];
  roundAudioChunks: Buffer[]; // 当前轮的音频数据
  roundAudios: RoundAudio[]; // 已保存的分轮音频
  totalDuration: number;
  currentRound: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  // 用于完整协议流程
  connectionStarted: boolean;
  sessionStarted: boolean;
  // 重试机制相关
  retryCount: number;
  maxRetries: number;
  lastFinishedRoundId: number;
  isPodcastRoundEnd: boolean;
  // 字幕相关
  subtitleManager: SubtitleManager;
  currentSpeaker: string;
  // 使用量相关（与字幕无关的任务级元数据）
  usageInfo?: UsageInfo;
  // 调试模式：true 时保存到本地而非 MinIO
  debugMode: boolean;
}

/**
 * StartSession 请求 Payload 接口
 */
interface StartSessionPayload extends Record<string, unknown> {
  action: number;
  input_id?: string;
  input_text?: string;
  prompt_text?: string;
  nlp_texts?: unknown[];
  input_info?: unknown;
  audio_config?: unknown;
  speaker_info?: unknown;
  use_head_music?: boolean;
  use_tail_music?: boolean;
  aigc_watermark?: boolean;
  aigc_metadata?: unknown;
  retry_info?: {
    retry_task_id: string;
    last_finished_round_id: number;
  };
}

@Injectable()
export class PodcastService {
  private readonly logger = new Logger(PodcastService.name);
  private readonly wsUrl =
    'wss://openspeech.bytedance.com/api/v3/sami/podcasttts';
  private readonly resourceId = 'volc.service_type.10050';
  private readonly appKey = 'aGjiRDfUWi';

  // 存储正在处理的任务
  private tasks: Map<string, TaskContext> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly minioService: MinioService,
    private readonly callbackService: CallbackService,
  ) {}

  /**
   * 创建播客生成任务
   */
  createPodcast(dto: CreatePodcastDto): { task_id: string; message: string } {
    const taskId = uuidv4();
    const sessionId = PodcastProtocol.generateSessionId();

    const taskContext: TaskContext = {
      taskId,
      inputId: dto.input_id || 'unknown',
      sessionId,
      callbackUrl: dto.callback_url,
      audioFormat: dto.audio_config?.format || 'mp3',
      audioChunks: [],
      roundAudioChunks: [],
      roundAudios: [],
      totalDuration: 0,
      currentRound: 0,
      status: 'pending',
      connectionStarted: false,
      sessionStarted: false,
      // 重试机制
      retryCount: 0,
      maxRetries: 5,
      lastFinishedRoundId: -1,
      isPodcastRoundEnd: true,
      // 字幕
      subtitleManager: new SubtitleManager(),
      currentSpeaker: '',
      // 调试模式
      debugMode: dto.debug_mode || false,
    };

    this.tasks.set(taskId, taskContext);

    // 异步启动 WebSocket 连接和处理
    void this.startPodcastGeneration(taskId, sessionId, dto).catch(
      (error: unknown) => {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Task ${taskId} failed: ${errMsg}`);
        void this.handleTaskError(taskId, errMsg);
      },
    );

    return {
      task_id: taskId,
      message: '播客生成任务已创建，生成完成后将通过回调通知',
    };
  }

  /**
   * 启动播客生成（带重试机制）
   */
  private async startPodcastGeneration(
    taskId: string,
    sessionId: string,
    dto: CreatePodcastDto,
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    while (task.retryCount < task.maxRetries) {
      try {
        await this.executeWebSocketSession(taskId, sessionId, dto);

        // 如果成功完成（isPodcastRoundEnd 为 true），跳出重试循环
        if (task.isPodcastRoundEnd && task.status === 'completed') {
          return;
        }

        // 如果未完成但连接关闭，准备重试
        if (!task.isPodcastRoundEnd) {
          task.retryCount++;
          this.logger.warn(
            `Task ${taskId} incomplete, retrying (${task.retryCount}/${task.maxRetries})`,
          );
          await this.delay(1000); // 重试前等待1秒
        } else {
          return; // 正常完成
        }
      } catch (error) {
        task.retryCount++;
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Task ${taskId} error, retry ${task.retryCount}/${task.maxRetries}: ${errMsg}`,
        );

        if (task.retryCount >= task.maxRetries) {
          throw error;
        }
        await this.delay(1000);
      }
    }

    throw new Error(`Task ${taskId} failed after ${task.maxRetries} retries`);
  }

  /**
   * 执行单次 WebSocket 会话
   */
  private async executeWebSocketSession(
    taskId: string,
    sessionId: string,
    dto: CreatePodcastDto,
  ): Promise<void> {
    const appId = this.configService.get<string>('VOLC_APP_ID');
    const accessKey = this.configService.get<string>('VOLC_ACCESS_KEY');

    if (!appId || !accessKey) {
      throw new Error(
        'Missing VOLC_APP_ID or VOLC_ACCESS_KEY environment variables',
      );
    }

    return new Promise((resolve, reject) => {
      const connectId = uuidv4();
      const ws = new WebSocket(this.wsUrl, {
        headers: {
          'X-Api-App-Id': appId,
          'X-Api-Access-Key': accessKey,
          'X-Api-Resource-Id': this.resourceId,
          'X-Api-App-Key': this.appKey,
          'X-Api-Connect-Id': connectId,
        },
        // 重要：跳过 UTF8 验证，避免二进制音频数据导致连接异常
        skipUTF8Validation: true,
      });

      const task = this.tasks.get(taskId);
      if (!task) {
        reject(new Error('Task not found'));
        return;
      }

      ws.on('open', () => {
        this.logger.log(`WebSocket connected for task: ${taskId}`);
        task.status = 'processing';

        // 第一步: 发送 StartConnection
        const startConnFrame = PodcastProtocol.buildStartConnectionFrame();
        ws.send(startConnFrame);
        this.logger.debug(`StartConnection sent for task: ${taskId}`);
      });

      ws.on('message', (data: Buffer) => {
        this.handleMessage(taskId, sessionId, ws, data, dto).catch(
          (error: unknown) => {
            this.logger.error(
              `Error handling message for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          },
        );
      });

      ws.on('error', (error: Error) => {
        this.logger.error(
          `WebSocket error for task ${taskId}: ${error.message}`,
        );
        // 打印完整错误堆栈用于调试
        this.logger.error(`WebSocket error stack: ${error.stack}`);
        reject(error);
      });

      ws.on('close', (code, reason) => {
        const reasonStr = reason.toString() || 'No reason provided';
        this.logger.log(
          `WebSocket closed for task ${taskId}: code=${code}, reason=${reasonStr}`,
        );
        // 根据关闭码判断是否为异常关闭
        // 1000: 正常关闭, 1001: 离开, 1006: 异常关闭(无close frame)
        if (code === 1006) {
          this.logger.warn(
            `Task ${taskId}: Abnormal closure (1006) - 可能是认证失败、协议错误或网络问题`,
          );
        } else if (code === 1002) {
          this.logger.warn(
            `Task ${taskId}: Protocol error (1002) - 消息格式可能不正确`,
          );
        }
        resolve();
      });
    });
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 处理 WebSocket 消息
   */
  private async handleMessage(
    taskId: string,
    sessionId: string,
    ws: WebSocket,
    data: Buffer,
    dto: CreatePodcastDto,
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task not found: ${taskId}`);
      return;
    }

    const frame = PodcastProtocol.parseResponseFrame(data);
    const eventName = frame.eventType
      ? PodcastProtocol.getEventName(frame.eventType)
      : 'Unknown';

    this.logger.debug(`Received event: ${eventName} for task: ${taskId}`);

    // 检查错误帧
    if (frame.messageType === (MsgType.ERROR as number) || frame.errorCode) {
      // 解析详细错误信息
      let errorDetail = '';
      if (frame.payload) {
        if (Buffer.isBuffer(frame.payload)) {
          errorDetail = frame.payload.toString('utf-8');
        } else if (typeof frame.payload === 'object') {
          errorDetail = JSON.stringify(frame.payload);
        }
      }
      const errorMsg = `Error code: ${frame.errorCode || 'unknown'}, msgType: ${frame.messageType}, detail: ${errorDetail}`;
      this.logger.error(`[Task ${taskId}] Error frame received - ${errorMsg}`);
      this.logger.error(
        `[Task ${taskId}] 可能原因: 1)认证失败 2)协议顺序错误(Round error) 3)参数格式不正确`,
      );
      void this.handleTaskError(taskId, errorMsg);
      ws.close();
      return;
    }

    switch (frame.eventType) {
      case EventType.CONNECTION_STARTED: {
        this.logger.log(`Connection started for task: ${taskId}`);
        task.connectionStarted = true;
        // 第二步: 发送 StartSession
        const payload = this.buildPayload(dto, task);
        const startSessionFrame = PodcastProtocol.buildStartSessionFrame(
          sessionId,
          payload,
        );
        ws.send(startSessionFrame);
        this.logger.debug(`StartSession sent for task: ${taskId}`);
        break;
      }

      case EventType.SESSION_STARTED: {
        this.logger.log(`Session started for task: ${taskId}`);
        task.sessionStarted = true;
        // 第三步: 发送 FinishSession（告知服务端可以开始处理）
        const finishSessionFrame =
          PodcastProtocol.buildFinishSessionFrame(sessionId);
        ws.send(finishSessionFrame);
        this.logger.debug(`FinishSession sent for task: ${taskId}`);
        break;
      }

      case EventType.PODCAST_ROUND_START: {
        const roundStartPayload =
          frame.payload as unknown as PodcastRoundStartPayload;
        task.currentRound = roundStartPayload?.round_id ?? task.currentRound;
        task.isPodcastRoundEnd = false;
        task.currentSpeaker = String(
          roundStartPayload?.speaker || roundStartPayload?.round_type || '',
        );
        // 保存当前 Round 的文本（用于错误诊断）
        (task as TaskContext & { currentRoundText?: string }).currentRoundText =
          roundStartPayload?.text || '';

        // 重置当前轮的音频数据（确保每轮音频独立）
        task.roundAudioChunks = [];

        // 添加字幕条目（只为有文本的轮次创建）
        if (roundStartPayload?.text) {
          task.subtitleManager.addSubtitleEntry(
            task.currentSpeaker,
            roundStartPayload.text,
            task.currentRound,
          );
        }

        // 记录 Round 开始信息（包含文本预览，用于调试 TTS 失败）
        const textPreview = roundStartPayload?.text
          ? roundStartPayload.text.substring(0, 50) +
            (roundStartPayload.text.length > 50 ? '...' : '')
          : '[无文本]';
        this.logger.debug(
          `Round ${task.currentRound} started, speaker: ${task.currentSpeaker}, text: ${textPreview}`,
        );
        break;
      }

      case EventType.PODCAST_ROUND_RESPONSE:
        // 音频数据
        if (Buffer.isBuffer(frame.payload)) {
          task.audioChunks.push(frame.payload);
          task.roundAudioChunks.push(frame.payload);
        }
        break;

      case EventType.PODCAST_ROUND_END: {
        const roundEndPayload =
          frame.payload as unknown as PodcastRoundEndPayload;

        // 捕获当前轮次信息（避免异步竞态问题）
        const currentRoundId = task.currentRound;
        const currentSpeaker = task.currentSpeaker;
        const currentAudioChunks = [...task.roundAudioChunks]; // 复制数组

        // 立即清空当前轮音频数据（在下一轮开始前）
        task.roundAudioChunks = [];

        if (roundEndPayload?.is_error) {
          // 获取当前 Round 的文本用于诊断
          const currentText =
            (task as TaskContext & { currentRoundText?: string })
              .currentRoundText || '';
          const textLen = currentText.length;
          const textPreview =
            currentText.substring(0, 100) + (textLen > 100 ? '...' : '');
          this.logger.error(
            `[Round ${currentRoundId}] TTS Error: ${roundEndPayload.error_msg}`,
          );
          this.logger.error(
            `[Round ${currentRoundId}] Speaker: ${currentSpeaker}, TextLen: ${textLen}, Text: ${textPreview}`,
          );
        } else {
          // 处理音频时长
          if (roundEndPayload?.audio_duration) {
            task.totalDuration += roundEndPayload.audio_duration;
            // 更新字幕时间戳
            task.subtitleManager.updateSubtitleEndTime(
              currentRoundId,
              roundEndPayload.audio_duration,
            );
            this.logger.debug(
              `Round ${currentRoundId} ended, duration: ${roundEndPayload.audio_duration}s`,
            );
          }

          // 只要有音频数据就保存分轮音频（即使没有 audio_duration）
          if (currentAudioChunks.length > 0) {
            await this.saveRoundAudio(
              taskId,
              task,
              currentRoundId,
              currentSpeaker,
              currentAudioChunks,
            );
          }
        }
        // 更新重试相关状态
        task.isPodcastRoundEnd = true;
        task.lastFinishedRoundId = currentRoundId;
        break;
      }

      case EventType.PODCAST_END: {
        const podcastEndPayload = frame.payload as unknown as PodcastEndPayload;
        this.logger.log(`Podcast generation completed for task: ${taskId}`);
        if (podcastEndPayload?.meta_info?.audio_url) {
          this.logger.debug(
            `Audio URL from server: ${podcastEndPayload.meta_info.audio_url}`,
          );
        }
        break;
      }

      case EventType.SESSION_FINISHED: {
        this.logger.log(`Session finished for task: ${taskId}`);
        // 第四步: 发送 FinishConnection
        const finishConnFrame = PodcastProtocol.buildFinishConnectionFrame();
        ws.send(finishConnFrame);
        this.logger.debug(`FinishConnection sent for task: ${taskId}`);
        break;
      }

      case EventType.CONNECTION_FINISHED:
        this.logger.log(`Connection finished for task: ${taskId}`);
        // 完成处理
        await this.handleTaskCompletion(taskId);
        ws.close();
        break;

      case EventType.USAGE_RESPONSE: {
        const usagePayload = frame.payload as {
          usage?: { inputTextTokens: number; outputAudioTokens: number };
        };
        if (usagePayload?.usage) {
          // 存储 usage 信息到任务上下文（与字幕无关）
          task.usageInfo = usagePayload.usage;
          this.logger.debug(
            `Usage info received: input_tokens=${task.usageInfo.inputTextTokens}, output_tokens=${task.usageInfo.outputAudioTokens}`,
          );
        }
        break;
      }

      default:
        this.logger.debug(`Unhandled event type: ${frame.eventType}`);
    }
  }

  /**
   * 保存文件到本地文件系统（debug 模式）
   * @param relativePath 相对路径（例如：podcast/{inputId}/{taskId}/audio.mp3）
   * @param buffer 文件数据
   * @returns 本地文件路径
   */
  private saveFileLocally(relativePath: string, buffer: Buffer): string {
    // 使用项目根目录下的 debug_output 文件夹
    const outputDir = path.join(process.cwd(), 'debug_output');
    const fullPath = path.join(outputDir, relativePath);
    const dir = path.dirname(fullPath);

    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入文件
    fs.writeFileSync(fullPath, buffer);
    this.logger.log(`File saved locally: ${fullPath}`);

    // 返回本地文件路径
    return `file://${fullPath}`;
  }

  /**
   * 保存分轮音频
   * @param taskId 任务ID
   * @param task 任务上下文
   * @param roundId 轮次ID（传入以避免异步竞态）
   * @param speaker 说话人（传入以避免异步竞态）
   * @param audioChunks 音频数据块（传入以避免异步竞态）
   */
  private async saveRoundAudio(
    taskId: string,
    task: TaskContext,
    roundId: number,
    speaker: string,
    audioChunks: Buffer[],
  ): Promise<void> {
    // 跳过无效的 roundId
    if (roundId < 0) {
      this.logger.debug(`Skipping save for invalid round ${roundId}`);
      return;
    }

    if (audioChunks.length === 0) {
      this.logger.debug(`No audio data for round ${roundId}, skipping save`);
      return;
    }

    try {
      const roundAudioBuffer = Buffer.concat(audioChunks);
      const objectName = `podcast/${task.inputId}/${taskId}/round_${roundId}.${task.audioFormat}`;
      // 获取内容类型
      const contentTypeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        ogg_opus: 'audio/ogg',
        pcm: 'audio/pcm',
        aac: 'audio/aac',
        wav: 'audio/wav',
      };
      const contentType =
        contentTypeMap[task.audioFormat] || 'application/octet-stream';

      let audioUrl: string;
      if (task.debugMode) {
        // Debug 模式：保存到本地
        audioUrl = this.saveFileLocally(objectName, roundAudioBuffer);
      } else {
        // 正常模式：上传到 MinIO
        audioUrl = await this.minioService.uploadFile(
          objectName,
          roundAudioBuffer,
          contentType,
        );
      }

      task.roundAudios.push({
        roundId,
        speaker,
        audioUrl,
      });

      this.logger.log(
        `Round ${roundId} audio saved: ${objectName}, speaker: ${speaker}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save round ${roundId} audio: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 清理对象中的 undefined 值
   */
  private cleanPayload(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, value]) => value !== undefined),
    );
  }

  /**
   * 构建请求 payload
   */
  private buildPayload(
    dto: CreatePodcastDto,
    task?: TaskContext,
  ): StartSessionPayload {
    const payload: StartSessionPayload = {
      action: dto.action,
      input_id: dto.input_id,
      input_text: dto.input_text,
      prompt_text: dto.prompt_text,
      nlp_texts: dto.nlp_texts,
      input_info: dto.input_info,
      audio_config: dto.audio_config,
      speaker_info: dto.speaker_info,
      use_head_music: dto.use_head_music,
      use_tail_music: dto.use_tail_music,
      aigc_watermark: dto.aigc_watermark,
      aigc_metadata: dto.aigc_metadata,
    };

    // 添加重试信息（断点续传）
    if (task && !task.isPodcastRoundEnd && task.lastFinishedRoundId >= 0) {
      payload.retry_info = {
        retry_task_id: task.taskId,
        last_finished_round_id: task.lastFinishedRoundId,
      };
      this.logger.debug(
        `Adding retry_info: task=${task.taskId}, lastRound=${task.lastFinishedRoundId}`,
      );
    }

    // 清理 undefined 字段
    const cleanedPayload = this.cleanPayload(payload) as StartSessionPayload;

    // 记录参数信息（用于调试）
    this.logger.log(
      `StartSession Payload - action: ${cleanedPayload.action}, nlp_texts count: ${Array.isArray(cleanedPayload.nlp_texts) ? cleanedPayload.nlp_texts.length : 0}`,
    );
    this.logger.debug(
      `StartSession speaker_info: ${JSON.stringify(cleanedPayload.speaker_info)}`,
    );
    this.logger.debug(
      `StartSession use_head_music: ${cleanedPayload.use_head_music}, use_tail_music: ${cleanedPayload.use_tail_music}`,
    );
    if (cleanedPayload.input_info) {
      this.logger.debug(
        `Payload nlp_texts: ${JSON.stringify(cleanedPayload.nlp_texts)}`,
      );
      const inputInfo = cleanedPayload.input_info as Record<string, unknown>;
      if (inputInfo.only_nlp_text) {
        this.logger.debug(
          `[Task ${task?.taskId}] only_nlp_text enabled: will extract NLP texts without audio`,
        );
      }
      if (inputInfo.return_audio_url) {
        this.logger.debug(
          `[Task ${task?.taskId}] return_audio_url enabled: server will return audio URL`,
        );
      }
    }

    return cleanedPayload;
  }

  /**
   * 处理任务完成
   */
  private async handleTaskCompletion(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task not found for completion: ${taskId}`);
      return;
    }

    try {
      // 合并音频数据
      const audioBuffer = Buffer.concat(task.audioChunks);
      this.logger.log(
        `Audio data collected: ${audioBuffer.length} bytes, duration: ${task.totalDuration}s`,
      );

      if (audioBuffer.length === 0) {
        throw new Error('No audio data received');
      }

      // 上传音频到 MinIO 或保存到本地
      let audioUrl: string;
      const audioObjectName = `podcast/${task.inputId}/${taskId}/audio.${task.audioFormat}`;
      const contentTypeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        ogg_opus: 'audio/ogg',
        pcm: 'audio/pcm',
        aac: 'audio/aac',
        wav: 'audio/wav',
      };
      const audioContentType =
        contentTypeMap[task.audioFormat] || 'application/octet-stream';
      if (task.debugMode) {
        // Debug 模式：保存到本地
        audioUrl = this.saveFileLocally(audioObjectName, audioBuffer);
      } else {
        // 正常模式：上传到 MinIO
        audioUrl = await this.minioService.uploadFile(
          audioObjectName,
          audioBuffer,
          audioContentType,
        );
      }

      // 生成并上传字幕或保存到本地
      let subtitleUrl: string | undefined;
      if (task.subtitleManager.getSubtitles().length > 0) {
        // 均匀分布字幕时间
        task.subtitleManager.distributeSubtitleTimes(task.totalDuration);
        // 获取更新后的字幕列表
        const subtitles = task.subtitleManager.getSubtitles();
        const srtContent = generateSRT(subtitles);
        const srtBuffer = Buffer.from(srtContent, 'utf-8');
        const subtitleObjectName = `podcast/${task.inputId}/${taskId}/subtitles.srt`;
        if (task.debugMode) {
          // Debug 模式：保存到本地
          subtitleUrl = this.saveFileLocally(subtitleObjectName, srtBuffer);
        } else {
          // 正常模式：上传到 MinIO
          subtitleUrl = await this.minioService.uploadFile(
            subtitleObjectName,
            srtBuffer,
            'text/srt',
          );
        }
        this.logger.log(
          `Subtitle ${task.debugMode ? 'saved' : 'uploaded'}: ${subtitleUrl}`,
        );
      }

      task.status = 'completed';
      task.isPodcastRoundEnd = true;

      // 获取播客详细信息
      const podcastInfo = task.subtitleManager.getPodcastInfo();
      // 使用任务上下文中存储的 usage 信息（而非字幕管理器中的）
      const usageInfo = task.usageInfo;

      // 触发回调
      const callbackPayload: PodcastCallbackPayload = {
        task_id: taskId,
        status: 'success',
        audio_url: audioUrl,
        subtitle_url: subtitleUrl,
        round_audios: task.roundAudios,
        duration: task.totalDuration,
        // 添加详细的播客信息和使用量
        podcast_info: {
          totalDuration: podcastInfo.totalDuration,
          totalRounds: podcastInfo.totalRounds,
          speakers: podcastInfo.speakers,
          usage: usageInfo,
        },
        usage: usageInfo,
      };

      await this.callbackService.notifyWithRetry(
        task.callbackUrl,
        callbackPayload,
      );

      this.logger.log(
        `Task ${taskId} completed successfully, usage: input_tokens=${usageInfo?.inputTextTokens || 0}, output_tokens=${usageInfo?.outputAudioTokens || 0}`,
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Task completion error: ${errMsg}`);
      void this.handleTaskError(taskId, errMsg);
    } finally {
      // 清理任务（延迟清理，以便查询状态）
      setTimeout(() => {
        this.tasks.delete(taskId);
      }, 60000); // 1分钟后清理
    }
  }

  /**
   * 处理任务错误
   */
  private async handleTaskError(
    taskId: string,
    errorMessage: string,
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.status = 'failed';
    task.error = errorMessage;

    // 触发回调
    const callbackPayload: PodcastCallbackPayload = {
      task_id: taskId,
      status: 'failed',
      error_message: errorMessage,
    };

    await this.callbackService.notifyWithRetry(
      task.callbackUrl,
      callbackPayload,
    );
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskContext | null {
    return this.tasks.get(taskId) || null;
  }
}
