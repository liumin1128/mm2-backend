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

interface TaskContext {
  taskId: string;
  sessionId: string;
  callbackUrl: string;
  audioFormat: string;
  audioChunks: Buffer[];
  totalDuration: number;
  currentRound: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  // 用于完整协议流程
  connectionStarted: boolean;
  sessionStarted: boolean;
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
      totalDuration: 0,
      currentRound: 0,
      status: 'pending',
      connectionStarted: false,
      sessionStarted: false,
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
   * 启动播客生成
   */
  private async startPodcastGeneration(
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
        void this.handleTaskError(taskId, error.message);
        reject(error);
      });

      ws.on('close', (code, reason) => {
        this.logger.log(
          `WebSocket closed for task ${taskId}: code=${code}, reason=${reason.toString()}`,
        );

        const currentTask = this.tasks.get(taskId);
        if (currentTask && currentTask.status === 'processing') {
          // 如果还在处理中就关闭了，说明可能有问题
          this.logger.warn(`WebSocket closed unexpectedly for task ${taskId}`);
        }
        resolve();
      });
    });
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
        const payload = this.buildPayload(dto);
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
        this.logger.debug(
          `Round ${task.currentRound} started, speaker: ${roundStartPayload?.speaker}`,
        );
        break;
      }

      case EventType.PODCAST_ROUND_RESPONSE:
        // 音频数据
        if (Buffer.isBuffer(frame.payload)) {
          task.audioChunks.push(frame.payload);
        }
        break;

      case EventType.PODCAST_ROUND_END: {
        const roundEndPayload =
          frame.payload as unknown as PodcastRoundEndPayload;
        if (roundEndPayload?.is_error) {
          this.logger.error(`Round error: ${roundEndPayload.error_msg}`);
        } else if (roundEndPayload?.audio_duration) {
          task.totalDuration += roundEndPayload.audio_duration;
          this.logger.debug(
            `Round ${task.currentRound} ended, duration: ${roundEndPayload.audio_duration}s`,
          );
        }
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

      case EventType.USAGE_RESPONSE:
        this.logger.debug(`Usage response: ${JSON.stringify(frame.payload)}`);
        break;

      default:
        this.logger.debug(`Unhandled event type: ${frame.eventType}`);
    }
  }

  /**
   * 构建请求 payload
   */
  private buildPayload(dto: CreatePodcastDto): object {
    const payload: Record<string, unknown> = {
      action: dto.action,
    };

    if (dto.input_id) payload.input_id = dto.input_id;
    if (dto.input_text) payload.input_text = dto.input_text;
    if (dto.prompt_text) payload.prompt_text = dto.prompt_text;
    if (dto.nlp_texts) payload.nlp_texts = dto.nlp_texts;
    if (dto.input_info) payload.input_info = dto.input_info;
    if (dto.audio_config) payload.audio_config = dto.audio_config;
    if (dto.speaker_info) payload.speaker_info = dto.speaker_info;
    if (dto.use_head_music !== undefined)
      payload.use_head_music = dto.use_head_music;
    if (dto.use_tail_music !== undefined)
      payload.use_tail_music = dto.use_tail_music;
    if (dto.aigc_watermark !== undefined)
      payload.aigc_watermark = dto.aigc_watermark;
    if (dto.aigc_metadata) payload.aigc_metadata = dto.aigc_metadata;

    return payload;
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

      // 上传到 MinIO
      const audioUrl = await this.minioService.uploadAudio(
        taskId,
        audioBuffer,
        task.audioFormat,
      );

      task.status = 'completed';

      // 触发回调
      const callbackPayload: PodcastCallbackPayload = {
        task_id: taskId,
        status: 'success',
        audio_url: audioUrl,
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
