import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { PodcastService } from './podcast.service';
import { CreatePodcastDto } from './dto/podcast-tts.dto';

@Controller('podcast')
export class PodcastController {
  constructor(private readonly podcastService: PodcastService) {}

  /**
   * 创建播客生成任务
   * POST /podcast/generate
   */
  @Post('generate')
  generatePodcast(@Body() dto: CreatePodcastDto) {
    try {
      const result = this.podcastService.createPodcast(dto);
      return {
        code: 0,
        message: 'success',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        {
          code: -1,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to create podcast task',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 查询任务状态
   * GET /podcast/status/:taskId
   */
  @Get('status/:taskId')
  getTaskStatus(@Param('taskId') taskId: string) {
    const task = this.podcastService.getTaskStatus(taskId);
    if (!task) {
      throw new HttpException(
        {
          code: -1,
          message: 'Task not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      code: 0,
      message: 'success',
      data: {
        task_id: task.taskId,
        status: task.status,
        current_round: task.currentRound,
        total_duration: task.totalDuration,
        error: task.error,
        retryCount: task.retryCount,
        maxRetries: task.maxRetries,
        lastFinishedRoundId: task.lastFinishedRoundId,
        subtitleManager: task.subtitleManager,
      },
    };
  }
}
