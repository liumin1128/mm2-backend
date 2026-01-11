import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  CreatePodcastDto,
  PodcastCallbackPayload,
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
        reject(error);
      });

      ws.on('close', (code, reason) => {
        this.logger.log(
          `WebSocket closed for task ${taskId}: code=${code}, reason=${reason.toString()}`,
        );
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
      const errorMsg = `Error code: ${frame.errorCode}, payload: ${JSON.stringify(frame.payload)}`;
      this.logger.error(`Error frame received: ${errorMsg}`);
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

        // 添加字幕条目（只为有文本的轮次创建）
        if (roundStartPayload?.text) {
          task.subtitleManager.addSubtitleEntry(
            task.currentSpeaker,
            roundStartPayload.text,
            task.currentRound,
          );
        }

        this.logger.debug(
          `Round ${task.currentRound} started, speaker: ${task.currentSpeaker}`,
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
        if (roundEndPayload?.is_error) {
          this.logger.error(`Round error: ${roundEndPayload.error_msg}`);
        } else if (roundEndPayload?.audio_duration) {
          task.totalDuration += roundEndPayload.audio_duration;
          // 更新字幕时间戳
          task.subtitleManager.updateSubtitleEndTime(
            task.currentRound,
            roundEndPayload.audio_duration,
          );
          this.logger.debug(
            `Round ${task.currentRound} ended, duration: ${roundEndPayload.audio_duration}s`,
          );

          // 保存分轮音频到 MinIO
          await this.saveRoundAudio(
            taskId,
            task,
            roundEndPayload.audio_duration,
          );
        }
        // 更新重试相关状态
        task.isPodcastRoundEnd = true;
        task.lastFinishedRoundId = task.currentRound;
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
        this.logger.debug(`Usage response: ${JSON.stringify(frame.payload)}`);
        // 存储 usage 信息到字幕管理器
        const usagePayload = frame.payload as {
          usage?: { inputTextTokens: number; outputAudioTokens: number };
        };
        if (usagePayload?.usage) {
          task.subtitleManager.setUsageInfo(usagePayload.usage);
        }
        break;
      }

      default:
        this.logger.debug(`Unhandled event type: ${frame.eventType}`);
    }
  }

  /**
   * 保存分轮音频
   */
  private async saveRoundAudio(
    taskId: string,
    task: TaskContext,
    duration: number,
  ): Promise<void> {
    if (task.roundAudioChunks.length === 0) {
      this.logger.debug(
        `No audio data for round ${task.currentRound}, skipping save`,
      );
      return;
    }

    try {
      const roundAudioBuffer = Buffer.concat(task.roundAudioChunks);
      const objectName = `podcast/${taskId}/round_${task.currentRound}.${task.audioFormat}`;
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

      const audioUrl = await this.minioService.uploadFile(
        objectName,
        roundAudioBuffer,
        contentType,
      );

      task.roundAudios.push({
        roundId: task.currentRound,
        speaker: task.currentSpeaker,
        audioUrl,
      });

      this.logger.log(
        `Round ${task.currentRound} audio saved: ${objectName}, speaker: ${task.currentSpeaker}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save round ${task.currentRound} audio: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      // 清空当前轮音频数据
      task.roundAudioChunks = [];
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
    return this.cleanPayload(payload) as StartSessionPayload;
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

      // 上传音频到 MinIO
      const audioUrl = await this.minioService.uploadAudio(
        taskId,
        audioBuffer,
        task.audioFormat,
      );

      // 生成并上传字幕
      let subtitleUrl: string | undefined;
      const subtitles = task.subtitleManager.getSubtitles();
      if (subtitles.length > 0) {
        const srtContent = generateSRT(subtitles);
        const srtBuffer = Buffer.from(srtContent, 'utf-8');
        subtitleUrl = await this.minioService.uploadFile(
          `${taskId}.srt`,
          srtBuffer,
          'text/srt',
        );
        this.logger.log(`Subtitle uploaded: ${subtitleUrl}`);
      }

      task.status = 'completed';
      task.isPodcastRoundEnd = true;

      // 触发回调
      const callbackPayload: PodcastCallbackPayload = {
        task_id: taskId,
        status: 'success',
        audio_url: audioUrl,
        subtitle_url: subtitleUrl,
        round_audios: task.roundAudios,
        duration: task.totalDuration,
      };

      await this.callbackService.notifyWithRetry(
        task.callbackUrl,
        callbackPayload,
      );

      this.logger.log(`Task ${taskId} completed successfully`);
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
