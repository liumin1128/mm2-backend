# Debug Mode 功能说明

## 概述

为了方便开发和调试，我们新增了 `debug_mode` 功能。当启用此模式时，生成的音频和字幕文件将保存到本地文件系统，而不是上传到 MinIO。

## 使用方法

在创建播客时，在请求 payload 中设置 `debug_mode: true`：

```json
{
  "action": 0,
  "input_text": "测试文本",
  "callback_url": "http://localhost:3000/callback",
  "debug_mode": true
}
```

## 文件保存位置

当 `debug_mode` 为 `true` 时，所有文件将保存到项目根目录下的 `debug_output` 文件夹中：

```
debug_output/
└── podcast/
    └── {input_id}/
        └── {task_id}/
            ├── audio.mp3              # 完整音频
            ├── subtitles.srt          # 字幕文件
            ├── round_1.mp3            # 第1轮音频
            ├── round_2.mp3            # 第2轮音频
            └── ...
```

## 文件路径格式

Debug 模式下返回的 URL 格式为：`file:///absolute/path/to/file`

例如：
```
file:///Users/username/project/debug_output/podcast/test-input/task-uuid/audio.mp3
```

## 注意事项

1. **开发环境使用**：此功能主要用于开发和测试环境，生产环境建议保持 `debug_mode: false`（默认值）

2. **磁盘空间**：本地保存文件会占用磁盘空间，请定期清理 `debug_output` 文件夹

3. **文件访问**：文件保存在本地后，只能在服务器本地访问，远程客户端无法通过 URL 直接下载

4. **Git 忽略**：`debug_output` 文件夹已添加到 `.gitignore`，不会被提交到版本控制

## 对比

| 特性 | 正常模式 | Debug 模式 |
|------|---------|-----------|
| 文件存储位置 | MinIO | 本地文件系统 |
| URL 格式 | HTTP URL | file:// URL |
| 网络访问 | 可远程访问 | 仅本地访问 |
| 存储时效 | 7天预签名 URL | 永久（手动删除） |
| 适用场景 | 生产环境 | 开发/测试 |

## 示例

### 请求示例

```bash
curl -X POST http://localhost:3000/podcast/create \
  -H "Content-Type: application/json" \
  -d '{
    "action": 0,
    "input_text": "这是一段测试文本，用于生成播客",
    "callback_url": "http://localhost:3000/callback",
    "debug_mode": true
  }'
```

### 响应示例（回调）

```json
{
  "task_id": "abc-123-def-456",
  "status": "success",
  "audio_url": "file:///Users/liumin/Desktop/other/mm2/mm2-backend/debug_output/podcast/unknown/abc-123-def-456/audio.mp3",
  "subtitle_url": "file:///Users/liumin/Desktop/other/mm2/mm2-backend/debug_output/podcast/unknown/abc-123-def-456/subtitles.srt",
  "round_audios": [
    {
      "roundId": 1,
      "speaker": "speaker_1",
      "audioUrl": "file:///Users/liumin/Desktop/other/mm2/mm2-backend/debug_output/podcast/unknown/abc-123-def-456/round_1.mp3"
    }
  ],
  "duration": 10.5
}
```

## 实现细节

Debug 模式的实现位于：
- DTO 定义：[src/podcast/dto/podcast-tts.dto.ts](src/podcast/dto/podcast-tts.dto.ts)
- 服务逻辑：[src/podcast/podcast.service.ts](src/podcast/podcast.service.ts)

核心方法：
- `saveFileLocally()`: 将文件保存到本地文件系统
- `saveRoundAudio()`: 保存分轮音频（支持 debug 模式）
- `finishTask()`: 保存完整音频和字幕（支持 debug 模式）
