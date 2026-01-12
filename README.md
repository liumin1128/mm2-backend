<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

# MM2 Backend

基于 NestJS 的后端服务，集成火山引擎播客 TTS 功能。

## 功能特性

- 🎙️ **播客 TTS 生成** - 调用火山引擎播客语音合成 API
- 📦 **MinIO 存储** - 自动将生成的音频上传到 S3 兼容存储
- 🔔 **回调通知** - 音频生成完成后自动触发回调
- 🐛 **Debug 模式** - 支持本地文件保存，方便开发调试（详见 [docs/DEBUG_MODE.md](docs/DEBUG_MODE.md)）

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填写配置：

```bash
cp .env.example .env
```

环境变量说明：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `VOLC_APP_ID` | 火山引擎 APP ID | 从[控制台](https://console.volcengine.com/speech/service/10028)获取 |
| `VOLC_ACCESS_KEY` | 火山引擎 Access Token | 从控制台获取 |
| `MINIO_ENDPOINT` | MinIO/S3 端点 | localhost |
| `MINIO_PORT` | MinIO 端口 | 9000 |
| `MINIO_USE_SSL` | 是否使用 SSL | false |
| `MINIO_ACCESS_KEY` | MinIO 访问密钥 | minioadmin |
| `MINIO_SECRET_KEY` | MinIO 密钥 | minioadmin |
| `MINIO_BUCKET` | 存储桶名称 | podcast-audio |
| `PORT` | 服务端口 | 3000 |

### 3. 启动服务

```bash
# 开发模式
pnpm run start:dev

# 生产模式
pnpm run start:prod
```

## API 接口

### 创建播客生成任务

**POST** `/podcast/generate`

请求示例（action=3 对话模式）：

```json
{
  "input_id": "test_podcast",
  "action": 3,
  "use_head_music": false,
  "audio_config": {
    "format": "mp3",
    "sample_rate": 24000,
    "speech_rate": 0
  },
  "nlp_texts": [
    {
      "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts",
      "text": "今天呢我们要聊的呢是火山引擎在这个 FORCE 原动力大会上面的一些比较重磅的发布。"
    },
    {
      "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts",
      "text": "来看看都有哪些亮点哈。"
    }
  ],
  "callback_url": "https://your-server.com/callback"
}
```

请求示例（action=0 长文本模式）：

```json
{
  "input_id": "test_podcast",
  "action": 0,
  "input_text": "分析下当前的大模型发展",
  "use_head_music": false,
  "audio_config": {
    "format": "mp3",
    "sample_rate": 24000
  },
  "speaker_info": {
    "random_order": true,
    "speakers": [
      "zh_male_dayixiansheng_v2_saturn_bigtts",
      "zh_female_mizaitongxue_v2_saturn_bigtts"
    ]
  },
  "callback_url": "https://your-server.com/callback"
}
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "task_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "message": "播客生成任务已创建，生成完成后将通过回调通知"
  }
}
```

### 查询任务状态

**GET** `/podcast/status/:taskId`

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "task_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "status": "completed",
    "current_round": 5,
    "total_duration": 120.5,
    "error": null
  }
}
```

### 回调通知格式

当任务完成时，会向 `callback_url` 发送 POST 请求：

**成功时：**

```json
{
  "task_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "status": "success",
  "audio_url": "https://minio.example.com/podcast-audio/podcast/xxx/audio.mp3?...",
  "duration": 120.5
}
```

**失败时：**

```json
{
  "task_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "status": "failed",
  "error_message": "错误描述"
}
```

## 支持的发音人

| 系列 | 发音人 | Speaker ID |
|------|--------|------------|
| 黑猫侦探社 | 咪仔 | `zh_female_mizaitongxue_v2_saturn_bigtts` |
| 黑猫侦探社 | 大一先生 | `zh_male_dayixiansheng_v2_saturn_bigtts` |
| 刘飞和潇磊 | 刘飞 | `zh_male_liufei_v2_saturn_bigtts` |
| 刘飞和潇磊 | 潇磊 | `zh_male_xiaolei_v2_saturn_bigtts` |

> 建议使用同系列的发音人配对使用效果更好

## 参考文档

- [火山引擎播客 TTS API 文档](https://www.volcengine.com/docs/6561/1668014)
- [火山引擎控制台](https://console.volcengine.com/speech/service/10028)

---

## NestJS 原始文档

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
