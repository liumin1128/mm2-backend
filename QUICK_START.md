# 快速开始指南

## 功能概览

本项目实现了一个完整的播客生成服务，包括：

### 核心功能
✅ **重试机制** - 自动重试（最多 5 次），支持断点续传
✅ **字幕生成** - 自动生成 SRT 格式字幕
✅ **异步处理** - 支持任务状态查询和回调通知  
✅ **对象存储** - 音频和字幕自动上传到 MinIO

---

## 项目结构

```
src/podcast/
├── podcast.service.ts          # 核心服务（重试机制 + 字幕生成）
├── podcast.controller.ts       # API 控制器
├── podcast.module.ts           # NestJS 模块
├── podcast-protocol.util.ts    # 火山引擎协议处理
├── subtitle.util.ts            # 字幕管理工具类 ✨ 新增
├── callback.service.ts         # 回调通知服务
└── dto/
    └── podcast-tts.dto.ts      # 数据结构定义

scripts/
├── test-podcast.sh             # 基础功能测试 ✨ 已更新
└── test-features.sh            # 功能集成测试 ✨ 新增

docs/
└── TEST_GUIDE.md               # 详细测试文档 ✨ 新增
```

---

## 关键改进点

### 1️⃣ 重试机制实现

**文件**: `src/podcast/podcast.service.ts`

```typescript
// 自动重试最多 5 次
while (task.retryCount < task.maxRetries) {
  try {
    await this.executeWebSocketSession(...);
    // 断点续传：使用 lastFinishedRoundId 继续
    if (!task.isPodcastRoundEnd) {
      payload.retry_info = {
        retry_task_id: task.taskId,
        last_finished_round_id: task.lastFinishedRoundId
      };
    }
  } catch (error) {
    task.retryCount++;
    await this.delay(1000); // 等待 1 秒后重试
  }
}
```

**状态字段**:
- `retryCount`: 当前重试次数
- `maxRetries`: 最大重试次数（固定 5）
- `lastFinishedRoundId`: 上次完成的轮次 ID
- `isPodcastRoundEnd`: 当前轮次是否完成

### 2️⃣ 字幕生成实现

**文件**: `src/podcast/subtitle.util.ts`

```typescript
// 字幕管理器
export class SubtitleManager {
  addSubtitleEntry(speaker, text, roundId)      // 添加字幕条目
  updateSubtitleEndTime(roundId, duration)      // 更新时间戳
  getSubtitles()                                // 获取字幕列表
  getPodcastInfo()                              // 获取播客信息
}

// SRT 字幕生成
export function generateSRT(subtitles): string  // 生成标准 SRT 格式
```

**支持内容**:
- 多说话人识别
- 精确的时间戳对齐
- Usage token 统计
- 详细的播客信息导出

### 3️⃣ 回调增强

**新增字段**: `PodcastCallbackPayload`

```typescript
{
  task_id: string;
  status: 'success' | 'failed';
  audio_url?: string;              // 音频 URL
  subtitle_url?: string;           // ✨ 新增：字幕 URL
  error_message?: string;
  duration?: number;
}
```

---

## 快速测试

### 1. 启动服务

```bash
# 安装依赖
pnpm install

# 本地开发模式
npm run start:dev

# 生产环境编译
npm run build
npm run start:prod
```

### 2. 运行测试脚本

```bash
# 基础功能测试
./scripts/test-podcast.sh

# 功能集成测试
./scripts/test-features.sh

# 指定自定义 URL
BASE_URL=http://your-server:3000 ./scripts/test-podcast.sh
```

### 3. 验证输出

**成功响应示例**:
```json
{
  "data": {
    "task_id": "12345678-1234-1234-1234-123456789012",
    "message": "播客生成任务已创建，生成完成后将通过回调通知"
  }
}
```

**任务状态示例**:
```json
{
  "data": {
    "taskId": "12345678...",
    "status": "processing",
    "retryCount": 0,
    "maxRetries": 5,
    "lastFinishedRoundId": -1,
    "isPodcastRoundEnd": true,
    "subtitleManager": {
      "subtitles": [
        {
          "index": 1,
          "startTime": 0,
          "endTime": 5.5,
          "speaker": "主持人",
          "text": "欢迎收听",
          "roundId": 1
        }
      ]
    }
  }
}
```

---

## API 端点

### 创建播客任务
```bash
POST /podcast/generate

# 请求体示例
{
  "input_id": "test_podcast_001",
  "action": 3,  # 0=总结 3=对话 4=提示
  "nlp_texts": [
    { "speaker": "主持人", "text": "开场白" },
    { "speaker": "嘉宾", "text": "嘉宾回复" }
  ],
  "audio_config": {
    "format": "mp3",
    "sample_rate": 24000,
    "speech_rate": 0
  },
  "use_head_music": true,
  "use_tail_music": false,
  "callback_url": "http://your-callback-url"
}
```

### 查询任务状态
```bash
GET /podcast/status/{task_id}

# 响应包含重试信息和字幕内容
{
  "data": {
    "retryCount": 0,
    "maxRetries": 5,
    "lastFinishedRoundId": 2,
    "isPodcastRoundEnd": true,
    "subtitleManager": { ... }
  }
}
```

---

## 环境配置

### 必需的环境变量

```bash
# Volcano Engine 配置
VOLC_APP_ID=your_app_id
VOLC_ACCESS_KEY=your_access_key

# MinIO 配置（音频和字幕存储）
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_BUCKET=podcast-audio

# 应用配置
PORT=3000
NODE_ENV=development
```

### 本地 MinIO 启动

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"

# Web 界面: http://localhost:9001
```

---

## 测试验证清单

运行 `./scripts/test-features.sh` 后，应该看到：

- ✅ API 基本连接 - PASS
- ✅ 播客任务创建 - PASS  
- ✅ 字幕管理器初始化 - PASS
- ✅ 重试机制字段验证 - PASS
- ✅ 字幕 URL 在回调中 - PASS
- ✅ 音频配置字段完整性 - PASS

---

## 文件更新记录

### ✨ 新增文件

1. **src/podcast/subtitle.util.ts** (89 lines)
   - 字幕管理器类
   - SRT 格式生成函数
   - 时间格式化工具

2. **scripts/test-features.sh** (161 lines)
   - 功能集成测试脚本
   - 6 个测试用例
   - 彩色输出和统计

3. **TEST_GUIDE.md** (详细测试文档)
   - 功能说明
   - 测试运行指南
   - 故障排查

4. **QUICK_START.md** (本文件)
   - 快速开始指南
   - 关键改进点总结

### 🔧 修改文件

1. **src/podcast/podcast.service.ts**
   - 添加重试机制（startPodcastGeneration）
   - 集成字幕生成（handleTaskCompletion）
   - 优化 buildPayload 方法

2. **src/podcast/dto/podcast-tts.dto.ts**
   - PodcastCallbackPayload 新增 subtitle_url

3. **src/podcast/podcast-protocol.util.ts**
   - PodcastRoundStartPayload 新增 round_type

4. **scripts/test-podcast.sh**
   - 更新测试用例
   - 增加彩色输出
   - 添加多个测试场景

---

## 常见问题

**Q: 重试机制什么时候触发？**
A: 当 WebSocket 连接断开，但播客生成未完成时，系统自动重试（最多 5 次）。

**Q: 字幕什么时候生成？**
A: 在任务完成时（CONNECTION_FINISHED 事件），系统会自动生成 SRT 字幕并上传。

**Q: 如何验证字幕是否生成成功？**
A: 检查回调通知中是否包含 `subtitle_url` 字段，或在 MinIO 中查看 `{taskId}.srt` 文件。

**Q: 重试是否影响最终结果？**
A: 不影响。重试机制支持断点续传，最终结果包含所有轮次的内容。

---

## 下一步

1. 部署到生产环境
2. 配置真实的回调 URL
3. 监控任务执行统计
4. 考虑添加更多字幕格式支持

详见 [TEST_GUIDE.md](./TEST_GUIDE.md)
