import { Controller, Get, Post, Body, Logger } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * 测试回调端点 - 用于开发调试
   */
  @Post('test-callback')
  testCallback(@Body() body: unknown) {
    this.logger.log(`📥 收到回调通知: ${JSON.stringify(body)}`);
    return { code: 0, message: 'callback received' };
  }
}
