import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
  CreatePodcastDto,
  PodcastCallbackPayload,
} from './dto/podcast-tts.dto';
import {
  MsgType,
  EventType,
  StartConnection,
  StartSession,
  FinishSession,
  FinishConnection,
  WaitForEvent,
  ReceiveMessage,
  messageToString,
} from './podcast-protocol.util';
import { MinioService } from '../minio/minio.service';
import { CallbackService } from './callback.service';

const ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sami/podcasttts';

interface RoundAudio {
  roundId: number;
  speaker: string;
  audioUrl: string;
}

/** 字幕条目 */
interface SubtitleEntry {
  index: number;
  startTime: number; // 秒
  endTime: number; // 秒
  speaker: string;
  text: string;
}

interface TaskContext {
  taskId: string;
  inputId: string;
  callbackUrl: string;
  audioFormat: string;
  debugMode: boolean;
  // 状态追踪
  status: 'pending' | 'processing' | 'completed' | 'failed';
  currentRound: number;
  totalDuration: number;
  error?: string;
  retryCount: number;
  maxRetries: number;
  lastFinishedRoundId: number;
  // 音频和字幕数据
  roundAudios: RoundAudio[];
  speakers: Set<string>;
  // 字幕数据
  subtitles: SubtitleEntry[];
  accumulatedDuration: number; // 累积时长（秒）
  currentText: string; // 当前轮的文本
}

@Injectable()
export class PodcastService {
  private readonly logger = new Logger(PodcastService.name);
  private readonly resourceId = 'volc.service_type.10050';
  private readonly appKey = 'aGjiRDfUWi';
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

    const taskContext: TaskContext = {
      taskId,
      inputId: dto.input_id || 'unknown',
      callbackUrl: dto.callback_url,
      audioFormat: dto.audio_config?.format || 'mp3',
      debugMode: dto.debug_mode || false,
      // 状态追踪
      status: 'pending',
      currentRound: 0,
      totalDuration: 0,
      retryCount: 0,
      maxRetries: 5,
      lastFinishedRoundId: -1,
      // 音频和字幕数据
      roundAudios: [],
      speakers: new Set<string>(),
      // 字幕数据
      subtitles: [],
      accumulatedDuration: 0,
      currentText: '',
    };

    this.tasks.set(taskId, taskContext);

    // 异步启动播客生成
    void this.generatePodcast(taskId, dto).catch((error: unknown) => {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Task ${taskId} failed: ${errMsg}`);
      void this.sendCallback(taskId, {
        task_id: taskId,
        status: 'failed',
        error_message: errMsg,
      });
    });

    return {
      task_id: taskId,
      message: '播客生成任务已创建，生成完成后将通过回调通知',
    };
  }

  /**
   * 生成播客主流程（参考 demo 实现）
   */
  private async generatePodcast(
    taskId: string,
    dto: CreatePodcastDto,
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const appId = this.configService.get<string>('VOLC_APP_ID');
    const accessKey = this.configService.get<string>('VOLC_ACCESS_KEY');

    if (!appId || !accessKey) {
      throw new Error('Missing VOLC_APP_ID or VOLC_ACCESS_KEY');
    }

    let isPodcastRoundEnd = true;
    let lastRoundID = -1;
    let retryNum = 5;
    const podcastAudio: Uint8Array[] = [];
    let audio: Uint8Array[] = [];
    let currentRound = 0;
    let currentSpeaker = '';
    let ws: WebSocket | null = null;

    // 更新任务状态
    task.status = 'processing';

    try {
      while (retryNum > 0) {
        // 建立 WebSocket 连接
        const headers = {
          'X-Api-App-Id': appId,
          'X-Api-App-Key': this.appKey,
          'X-Api-Access-Key': accessKey,
          'X-Api-Resource-Id': this.resourceId,
          'X-Api-Connect-Id': uuidv4(),
        };

        ws = new WebSocket(ENDPOINT, {
          headers,
          skipUTF8Validation: true,
        });

        await new Promise<void>((resolve, reject) => {
          ws!.on('open', resolve);
          ws!.on('error', reject);
        });

        this.logger.log(`WebSocket connected for task: ${taskId}`);

        // 构建请求参数
        const reqParams = this.buildRequestParams(
          dto,
          taskId,
          isPodcastRoundEnd,
          lastRoundID,
        );

        // Step 1: StartConnection
        await StartConnection(ws);
        await WaitForEvent(
          ws,
          MsgType.FULL_SERVER_RESPONSE,
          EventType.CONNECTION_STARTED,
        );
        this.logger.debug(`Connection started for task: ${taskId}`);

        const sessionId = uuidv4();

        // Step 2: StartSession
        await StartSession(
          ws,
          new TextEncoder().encode(JSON.stringify(reqParams)),
          sessionId,
        );
        await WaitForEvent(
          ws,
          MsgType.FULL_SERVER_RESPONSE,
          EventType.SESSION_STARTED,
        );
        this.logger.debug(`Session started for task: ${taskId}`);

        // Step 3: FinishSession
        await FinishSession(ws, sessionId);

        // 消息接收循环
        while (true) {
          const msg = await ReceiveMessage(ws);
          this.logger.debug(`Received: ${messageToString(msg)}`);

          switch (msg.type) {
            case MsgType.AUDIO_ONLY_SERVER:
              if (msg.event === EventType.PODCAST_ROUND_RESPONSE) {
                audio.push(msg.payload);
                this.logger.debug(
                  `Audio chunk received: ${msg.payload.length} bytes`,
                );
              }
              break;

            case MsgType.ERROR:
              throw new Error(
                `Server error: ${new TextDecoder().decode(msg.payload)}`,
              );

            case MsgType.FULL_SERVER_RESPONSE:
              if (msg.event === EventType.PODCAST_ROUND_START) {
                const data = JSON.parse(new TextDecoder().decode(msg.payload));
                currentRound = data.round_id;
                currentSpeaker = data.speaker || '';
                isPodcastRoundEnd = false;
                // 收集 speaker
                if (currentSpeaker) {
                  task.speakers.add(currentSpeaker);
                }
                // 保存当前轮的文本（用于字幕）
                task.currentText = data.text || '';
                task.currentRound = currentRound;
                this.logger.log(
                  `Round ${currentRound} started, speaker: ${currentSpeaker}`,
                );
              } else if (msg.event === EventType.PODCAST_ROUND_END) {
                const data = JSON.parse(new TextDecoder().decode(msg.payload));
                if (data.is_error) {
                  this.logger.error(`Round error: ${JSON.stringify(data)}`);
                  break;
                }
                isPodcastRoundEnd = true;
                lastRoundID = currentRound;

                // 获取本轮时长
                const roundDuration = data.audio_duration || 0;

                // 生成字幕条目（只为有文本的轮次创建）
                if (task.currentText && roundDuration > 0) {
                  task.subtitles.push({
                    index: task.subtitles.length + 1,
                    startTime: task.accumulatedDuration,
                    endTime: task.accumulatedDuration + roundDuration,
                    speaker: currentSpeaker,
                    text: task.currentText,
                  });
                }

                // 累积时长
                task.accumulatedDuration += roundDuration;
                task.totalDuration = task.accumulatedDuration;

                // 保存分轮音频
                if (audio.length > 0) {
                  const roundAudioBuffer = Buffer.concat(audio);
                  const roundAudioUrl = await this.saveRoundAudio(
                    task,
                    currentRound,
                    currentSpeaker,
                    roundAudioBuffer,
                  );
                  if (roundAudioUrl) {
                    task.roundAudios.push({
                      roundId: currentRound,
                      speaker: currentSpeaker,
                      audioUrl: roundAudioUrl,
                    });
                  }
                  podcastAudio.push(...audio);
                  audio = [];
                }
                task.lastFinishedRoundId = currentRound;
                this.logger.log(`Round ${currentRound} finished`);
              } else if (msg.event === EventType.PODCAST_END) {
                const data = JSON.parse(new TextDecoder().decode(msg.payload));
                this.logger.log(`Podcast end: ${JSON.stringify(data)}`);
              }
              break;
          }

          if (msg.event === EventType.SESSION_FINISHED) {
            break;
          }
        }

        // Step 4: FinishConnection
        await FinishConnection(ws);
        await WaitForEvent(
          ws,
          MsgType.FULL_SERVER_RESPONSE,
          EventType.CONNECTION_FINISHED,
        );

        // 检查是否完成
        if (isPodcastRoundEnd) {
          if (podcastAudio.length > 0) {
            await this.saveFinalAudio(taskId, podcastAudio, task);
          }
          break;
        } else {
          this.logger.warn(
            `Podcast not finished, retrying from round ${lastRoundID}`,
          );
          retryNum--;
          await this.delay(1000);
        }
      }

      if (!isPodcastRoundEnd) {
        throw new Error(`Podcast generation failed after retries`);
      }
    } finally {
      if (ws) {
        ws.close();
      }
      this.tasks.delete(taskId);
    }
  }

  /**
   * 构建请求参数
   */
  private buildRequestParams(
    dto: CreatePodcastDto,
    taskId: string,
    isPodcastRoundEnd: boolean,
    lastRoundID: number,
  ): Record<string, unknown> {
    const reqParams: Record<string, unknown> = {
      input_id: dto.input_id || taskId,
      input_text: dto.input_text || '',
      prompt_text: dto.prompt_text || '',
      action: dto.action,
      speaker_info: dto.speaker_info || { random_order: false },
      nlp_texts: dto.nlp_texts || [],
      use_head_music: dto.use_head_music ?? false,
      use_tail_music: dto.use_tail_music ?? false,
      input_info: {
        input_url: dto.input_info?.input_url || '',
        return_audio_url: dto.input_info?.return_audio_url ?? false,
        only_nlp_text: dto.input_info?.only_nlp_text ?? false,
      },
      audio_config: {
        format: dto.audio_config?.format || 'mp3',
        sample_rate: dto.audio_config?.sample_rate || 24000,
        speech_rate: dto.audio_config?.speech_rate || 0,
      },
    };

    // 重试时添加重试信息
    if (!isPodcastRoundEnd) {
      reqParams.retry_info = {
        retry_task_id: taskId,
        last_finished_round_id: lastRoundID,
      };
    }

    return reqParams;
  }

  /**
   * 保存分轮音频
   */
  private async saveRoundAudio(
    task: TaskContext,
    roundId: number,
    speaker: string,
    audioBuffer: Buffer,
  ): Promise<string | null> {
    try {
      const filename = `round_${roundId}.${task.audioFormat}`;

      if (task.debugMode) {
        const outputDir = path.join(
          process.cwd(),
          'debug_output',
          'podcast',
          task.inputId,
          task.taskId,
        );
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        const filepath = path.join(outputDir, filename);
        await fs.promises.writeFile(filepath, audioBuffer);
        return filepath;
      } else {
        const objectPath = `podcast/${task.inputId}/${task.taskId}/${filename}`;
        return await this.minioService.uploadFile(
          objectPath,
          audioBuffer,
          `audio/${task.audioFormat}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to save round ${roundId} audio: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 保存最终音频
   */
  private async saveFinalAudio(
    taskId: string,
    podcastAudio: Uint8Array[],
    task: TaskContext,
  ): Promise<void> {
    const audioBuffer = Buffer.concat(podcastAudio);
    const audioFilename = `audio.${task.audioFormat}`;
    const subtitleFilename = 'subtitles.srt';

    // 生成字幕文件
    const srtContent = this.generateSRT(task.subtitles);
    const srtBuffer = Buffer.from(srtContent, 'utf-8');

    let audioUrl: string;
    let subtitleUrl: string | undefined;

    if (task.debugMode) {
      // 调试模式：保存到本地
      const outputDir = path.join(
        process.cwd(),
        'debug_output',
        'podcast',
        task.inputId,
        taskId,
      );
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 保存音频
      const audioPath = path.join(outputDir, audioFilename);
      await fs.promises.writeFile(audioPath, audioBuffer);
      audioUrl = audioPath;
      this.logger.log(`Debug: Audio saved to ${audioPath}`);

      // 保存字幕
      if (task.subtitles.length > 0) {
        const subtitlePath = path.join(outputDir, subtitleFilename);
        await fs.promises.writeFile(subtitlePath, srtBuffer);
        subtitleUrl = subtitlePath;
        this.logger.log(`Debug: Subtitle saved to ${subtitlePath}`);
      }
    } else {
      // 正常模式：上传到 MinIO
      const audioObjectPath = `podcast/${task.inputId}/${taskId}/${audioFilename}`;
      audioUrl = await this.minioService.uploadFile(
        audioObjectPath,
        audioBuffer,
        `audio/${task.audioFormat}`,
      );
      this.logger.log(`Audio uploaded: ${audioUrl}`);

      // 上传字幕
      if (task.subtitles.length > 0) {
        const subtitleObjectPath = `podcast/${task.inputId}/${taskId}/${subtitleFilename}`;
        subtitleUrl = await this.minioService.uploadFile(
          subtitleObjectPath,
          srtBuffer,
          'application/x-subrip',
        );
        this.logger.log(`Subtitle uploaded: ${subtitleUrl}`);
      }
    }

    task.status = 'completed';

    // 构建回调 payload
    const callbackPayload: PodcastCallbackPayload = {
      task_id: taskId,
      status: 'success',
      audio_url: audioUrl,
      subtitle_url: subtitleUrl,
      round_audios: task.roundAudios,
      duration: task.totalDuration,
      podcast_info: {
        totalDuration: task.totalDuration,
        totalRounds: task.roundAudios.length,
        speakers: Array.from(task.speakers),
      },
    };

    await this.sendCallback(taskId, callbackPayload);
  }

  /**
   * 生成 SRT 格式字幕
   */
  private generateSRT(subtitles: SubtitleEntry[]): string {
    return subtitles
      .map((entry) => {
        const startTime = this.formatSRTTime(entry.startTime);
        const endTime = this.formatSRTTime(entry.endTime);
        return `${entry.index}\n${startTime} --> ${endTime}\n${entry.text}\n`;
      })
      .join('\n');
  }

  /**
   * 格式化时间为 SRT 时间格式 (HH:MM:SS,mmm)
   */
  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.round((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
  }

  /**
   * 发送回调
   */
  private async sendCallback(
    taskId: string,
    payload: PodcastCallbackPayload,
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task?.callbackUrl) {
      await this.callbackService.notifyWithRetry(task.callbackUrl, payload);
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskContext | null {
    return this.tasks.get(taskId) || null;
  }
}
