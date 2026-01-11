import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PodcastCallbackPayload } from './dto/podcast-tts.dto';

@Injectable()
export class CallbackService {
  private readonly logger = new Logger(CallbackService.name);

  /**
   * 触发回调通知
   * @param callbackUrl 回调地址
   * @param payload 回调数据
   */
  async notify(
    callbackUrl: string,
    payload: PodcastCallbackPayload,
  ): Promise<boolean> {
    try {
      this.logger.log(
        `Sending callback to ${callbackUrl}, taskId: ${payload.task_id}, status: ${payload.status}`,
      );

      const response = await axios.post(callbackUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30秒超时
      });

      if (response.status >= 200 && response.status < 300) {
        this.logger.log(`Callback success for task: ${payload.task_id}`);
        return true;
      }

      this.logger.warn(
        `Callback returned non-success status: ${response.status}`,
      );
      return false;
    } catch (error) {
      this.logger.error(
        `Callback failed for task ${payload.task_id}: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  /**
   * 带重试的回调通知
   * @param callbackUrl 回调地址
   * @param payload 回调数据
   * @param maxRetries 最大重试次数
   * @param retryDelay 重试延迟（毫秒）
   */
  async notifyWithRetry(
    callbackUrl: string,
    payload: PodcastCallbackPayload,
    maxRetries: number = 3,
    retryDelay: number = 1000,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const success = await this.notify(callbackUrl, payload);
      if (success) {
        return true;
      }

      if (attempt < maxRetries) {
        this.logger.log(
          `Retrying callback (${attempt}/${maxRetries}) after ${retryDelay}ms`,
        );
        await this.delay(retryDelay);
        retryDelay *= 2; // 指数退避
      }
    }

    this.logger.error(
      `All callback attempts failed for task: ${payload.task_id}`,
    );
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
