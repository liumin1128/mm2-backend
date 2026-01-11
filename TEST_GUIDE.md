# 播客生成服务 - 功能测试文档

## 概述

本项目实现了以下核心功能：
- ✅ **重试机制**（断点续传）：最多重试 5 次，支持断点续传
- ✅ **字幕生成**：自动生成 SRT 格式字幕文件
- ✅ **异步任务处理**：支持任务状态查询和回调通知
- ✅ **MinIO 集成**：音频和字幕文件自动上传

## 测试脚本

### 1. 基础功能测试 (test-podcast.sh)

测试播客生成的基本功能，包括对话模式和文本总结模式。

```bash
# 运行基础测试
./scripts/test-podcast.sh

# 指定自定义 URL
BASE_URL=http://your-server:3000 ./scripts/test-podcast.sh
```

**测试内容：**
- 对话模式（NLP_TEXTS）生成播客
- 文本总结模式（SUMMARIZE）生成播客
- 任务状态查询

**预期结果：**
```json
{
  "data": {
    "task_id": "uuid-string",
    "message": "播客生成任务已创建，生成完成后将通过回调通知"
  }
}
```

### 2. 功能集成测试 (test-features.sh)

全面验证重试机制和字幕生成功能。

```bash
# 运行功能测试
./scripts/test-features.sh

# 指定自定义 URL
BASE_URL=http://your-server:3000 ./scripts/test-features.sh
```

**测试项目：**
| # | 测试项 | 说明 |
|---|--------|------|
| 1 | API 基本连接 | 检查服务健康状态 |
| 2 | 播客任务创建 | 验证字幕字段初始化 |
| 3 | 字幕管理器初始化 | 检查 SubtitleManager 对象 |
| 4 | 重试机制字段 | 验证 retryCount, maxRetries 等 |
| 5 | 字幕 URL 回调 | 确保回调包含 subtitle_url |
| 6 | 音频配置完整性 | 验证完整的音频配置参数 |

## 重试机制测试

### 工作原理

重试机制在以下场景自动触发：

1. **WebSocket 连接断开** - 自动重新连接
2. **播客生成不完整** - 支持从上次完成的轮次继续
3. **最多重试 5 次** - 达到限制后才报错

### 验证方式

查询任务状态时，检查以下字段：

```bash
curl http://localhost:3000/podcast/status/{task_id} | jq '.'
```

**响应示例：**
```json
{
  "data": {
    "taskId": "uuid",
    "status": "processing",
    "retryCount": 1,
    "maxRetries": 5,
    "lastFinishedRoundId": 2,
    "isPodcastRoundEnd": true
  }
}
```

| 字段 | 说明 |
|------|------|
| `retryCount` | 当前重试次数（0-5） |
| `maxRetries` | 最大重试次数（固定为 5） |
| `lastFinishedRoundId` | 上次完成的轮次 ID |
| `isPodcastRoundEnd` | 当前轮次是否完成 |

## 字幕生成测试

### 工作原理

任务完成时，系统会自动：

1. **收集字幕条目** - 从每个播客轮次提取文本和时间戳
2. **生成 SRT 文件** - 标准 SubRip 字幕格式
3. **上传到 MinIO** - 作为 `{taskId}.srt` 存储

### 验证方式

#### 方式 1: 通过回调 URL

收到成功的回调通知时，检查 `subtitle_url` 字段：

```json
{
  "task_id": "uuid",
  "status": "success",
  "audio_url": "http://minio.../audio.mp3",
  "subtitle_url": "http://minio.../uuid.srt",
  "duration": 120.5
}
```

#### 方式 2: 通过 MinIO Web Console

1. 访问 MinIO 控制台（默认 `http://localhost:9001`）
2. 登录（默认用户：minioadmin）
3. 查看 `podcast-audio` bucket 中的 `*.srt` 文件

#### 方式 3: 手动验证 SRT 格式

```bash
# 下载字幕文件
curl http://minio-url/podcast-audio/{taskId}.srt

# 预期格式
1
00:00:00,000 --> 00:00:05,500
主持人: 欢迎来到本期播客。

2
00:00:05,500 --> 00:00:12,000
嘉宾A: 感谢邀请。
```

## 环境配置

### 必需的环境变量

```bash
# Volcano Engine (火山引擎) 配置
VOLC_APP_ID=your_app_id
VOLC_ACCESS_KEY=your_access_key

# MinIO 配置（用于存储音频和字幕）
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=podcast-audio

# 服务配置
PORT=3000
```

### 本地开发启动

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入实际的配置

# 3. 启动 MinIO（如果需要本地存储）
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"

# 4. 启动服务
npm run start:dev

# 5. 运行测试
./scripts/test-podcast.sh
./scripts/test-features.sh
```

## 测试检查清单

运行完测试后，请验证以下项目：

- [ ] API 服务成功启动，健康检查通过
- [ ] 播客任务能正常创建，返回有效的 task_id
- [ ] 任务状态能正常查询，包含所有必需字段
- [ ] 重试机制字段正确初始化（maxRetries=5）
- [ ] 字幕管理器（SubtitleManager）对象正确创建
- [ ] 音频配置参数能完整传递到服务端
- [ ] 回调通知能正常发送（需配置有效的回调 URL）
- [ ] 字幕文件能上传到 MinIO（需要 MinIO 正常运行）

## 故障排查

### 问题 1: API 连接失败

```bash
curl http://localhost:3000/health
```

**解决方案：**
- 确保服务正在运行：`npm run start:dev`
- 检查端口是否被占用：`lsof -i :3000`

### 问题 2: 任务一直处于 "processing" 状态

**原因：**
- Volcano Engine API 调用失败
- WebSocket 连接异常

**解决方案：**
- 检查环境变量配置
- 查看服务日志：`npm run start:dev` 控制台输出
- 验证网络连接到 Volcano Engine

### 问题 3: 字幕文件未生成

**原因：**
- MinIO 未正常运行
- 无法连接到 MinIO
- 字幕数据为空

**解决方案：**
- 启动 MinIO：`docker run -p 9000:9000 -p 9001:9001 minio/minio ...`
- 检查 MinIO 连接：`curl http://localhost:9000`
- 验证任务是否真正完成（检查日志）

### 问题 4: 重试机制未生效

**验证方法：**
1. 故意中断网络连接
2. 观察日志中的重试信息
3. 查看 retryCount 变化

**日志示例：**
```
[debug] Task xxx incomplete, retrying (1/5)
[debug] Adding retry_info: task=xxx, lastRound=2
```

## 性能参考

典型的播客生成性能指标：

| 场景 | 平均耗时 | 备注 |
|------|---------|------|
| 简短对话（2-4 轮） | 10-30 秒 | 取决于内容长度 |
| 长文本总结 | 30-60 秒 | 服务端处理耗时 |
| 字幕生成 | < 1 秒 | 本地处理 |
| 文件上传 | 1-5 秒 | 取决于网络和文件大小 |

## 相关代码文件

- **核心服务** → [src/podcast/podcast.service.ts](../src/podcast/podcast.service.ts)
- **字幕工具** → [src/podcast/subtitle.util.ts](../src/podcast/subtitle.util.ts)
- **协议定义** → [src/podcast/podcast-protocol.util.ts](../src/podcast/podcast-protocol.util.ts)
- **数据模型** → [src/podcast/dto/podcast-tts.dto.ts](../src/podcast/dto/podcast-tts.dto.ts)

## 后续改进方向

- [ ] 支持更多字幕格式（VTT, ASS 等）
- [ ] 字幕精细化时间戳对齐
- [ ] 重试策略配置（可配置重试次数）
- [ ] WebSocket 连接池管理
- [ ] 任务执行统计和监控
