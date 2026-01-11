import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MinioModule } from './minio/minio.module';
import { PodcastModule } from './podcast/podcast.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    MinioModule,
    PodcastModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
