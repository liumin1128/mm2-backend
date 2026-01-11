import { Module } from '@nestjs/common';
import { PodcastController } from './podcast.controller';
import { PodcastService } from './podcast.service';
import { CallbackService } from './callback.service';

@Module({
  controllers: [PodcastController],
  providers: [PodcastService, CallbackService],
  exports: [PodcastService],
})
export class PodcastModule {}
