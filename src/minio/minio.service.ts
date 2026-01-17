import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private bucketName: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    let endPoint = this.configService.get<string>(
      'MINIO_ENDPOINT',
      'localhost',
    );
    let port = this.configService.get<number>('MINIO_PORT', 9000);
    let useSSL =
      this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';

    // 如果端点包含协议（http:// 或 https://），需要解析
    if (endPoint.includes('://')) {
      try {
        const url = new URL(endPoint);
        endPoint = url.hostname;
        useSSL = url.protocol === 'https:';
        if (url.port) {
          port = parseInt(url.port, 10);
        } else {
          port = useSSL ? 443 : 80;
        }
      } catch (error) {
        this.logger.error(
          `Failed to parse MINIO_ENDPOINT: ${error instanceof Error ? error.message : error}`,
        );
        throw new Error(`Invalid MINIO_ENDPOINT format: ${endPoint}`);
      }
    }

    const accessKey = this.configService.get<string>(
      'MINIO_ACCESS_KEY',
      'minioadmin',
    );
    const secretKey = this.configService.get<string>(
      'MINIO_SECRET_KEY',
      'minioadmin',
    );
    this.bucketName = this.configService.get<string>(
      'MINIO_BUCKET',
      'podcast-audio',
    );

    this.logger.log(
      `Initializing MinIO client with endpoint: ${endPoint}:${port}, useSSL: ${useSSL}`,
    );

    this.client = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    // 确保 bucket 存在
    await this.ensureBucket();
  }

  private async ensureBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName);
        this.logger.log(`Bucket '${this.bucketName}' created successfully`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to ensure bucket: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * 上传文件到 MinIO
   * @param objectName 对象名称（路径）
   * @param buffer 文件二进制数据
   * @param contentType 内容类型
   * @returns 存储的预签名 URL
   */
  async uploadFile(
    objectName: string,
    buffer: Buffer,
    contentType: string = 'application/octet-stream',
  ): Promise<string> {
    try {
      await this.client.putObject(
        this.bucketName,
        objectName,
        buffer,
        buffer.length,
        { 'Content-Type': contentType },
      );

      this.logger.log(`File uploaded: ${objectName}`);

      // 生成预签名 URL，有效期 7 天
      const url = await this.client.presignedGetObject(
        this.bucketName,
        objectName,
        7 * 24 * 60 * 60, // 7 days in seconds
      );

      return url;
    } catch (error) {
      this.logger.error(
        `Failed to upload file: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  /**
   * 获取文件
   */
  async getFile(objectName: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucketName, objectName);
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * 删除文件
   */
  async deleteFile(objectName: string): Promise<void> {
    await this.client.removeObject(this.bucketName, objectName);
    this.logger.log(`File deleted: ${objectName}`);
  }

  /**
   * 获取预签名 URL
   */
  async getPresignedUrl(
    objectName: string,
    expirySeconds: number = 7 * 24 * 60 * 60,
  ): Promise<string> {
    return this.client.presignedGetObject(
      this.bucketName,
      objectName,
      expirySeconds,
    );
  }

  /**
   * 获取公开访问 URL（如果 bucket 设置为公开）
   */
  getPublicUrl(objectName: string): string {
    const endPoint = this.configService.get<string>(
      'MINIO_ENDPOINT',
      'localhost',
    );
    const port = this.configService.get<number>('MINIO_PORT', 9000);
    const useSSL =
      this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';
    const protocol = useSSL ? 'https' : 'http';

    return `${protocol}://${endPoint}:${port}/${this.bucketName}/${objectName}`;
  }

  private getContentType(format: string): string {
    const contentTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      ogg_opus: 'audio/ogg',
      pcm: 'audio/pcm',
      aac: 'audio/aac',
      wav: 'audio/wav',
    };
    return contentTypes[format] || 'application/octet-stream';
  }
}
