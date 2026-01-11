# 分轮音频保存功能文档

## 功能概述

分轮音频保存是指在播客生成过程中，按照每个说话轮次（round）分别保存音频片段，而不是等到所有轮次完成后才合并成一个完整文件。这使得系统更加灵活、可靠和易于调试。

## 工作流程

```
播客生成过程（多轮对话）:
    ↓
Round 1 (Speaker A) 
    → 接收音频数据 
    → 保存为 podcast/{taskId}/round_1.mp3 (MinIO)
    ↓
Round 2 (Speaker B) 
    → 接收音频数据 
    → 保存为 podcast/{taskId}/round_2.mp3 (MinIO)
    ↓
Round 3 (Speaker A) 
    → 接收音频数据 
    → 保存为 podcast/{taskId}/round_3.mp3 (MinIO)
    ↓
所有轮次完成 
    → 合并所有音频 
    → 保存为 podcast/{taskId}/audio.mp3 (MinIO)
    → 生成字幕 (SRT 格式)
    → 通过回调返回所有结果
```

## 技术实现

### 1. TaskContext 数据结构扩展

```typescript
interface RoundAudio {
  roundId: number;        // 轮次 ID
  speaker: string;        // 说话人名称
  audioUrl: string;       // 分轮音频在 MinIO 中的 URL
}

interface TaskContext {
  // ... 其他字段
  audioChunks: Buffer[];         // 所有轮次的音频数据（用于合并）
  roundAudioChunks: Buffer[];    // 当前轮的音频数据（临时存储）
  roundAudios: RoundAudio[];     // 已保存的分轮音频列表
}
```

### 2. 消息处理流程

#### PODCAST_ROUND_RESPONSE 事件
```typescript
// 接收音频数据时，同时保存到全局和轮次缓冲区
if (Buffer.isBuffer(frame.payload)) {
  task.audioChunks.push(frame.payload);          // 用于最终合并
  task.roundAudioChunks.push(frame.payload);     // 用于轮次保存
}
```

#### PODCAST_ROUND_END 事件
```typescript
// 轮次结束时，将该轮的音频上传到 MinIO
await this.saveRoundAudio(taskId, task, audio_duration);

// 清空当前轮缓冲区，准备下一轮
task.roundAudioChunks = [];
```

### 3. MinIO 存储结构

```
bucket: podcast-audio
    ├── podcast/
    │   ├── {taskId}/
    │   │   ├── round_1.mp3      # 第一轮音频
    │   │   ├── round_2.mp3      # 第二轮音频
    │   │   ├── round_3.mp3      # 第三轮音频
    │   │   ├── audio.mp3        # 合并后的最终音频
    │   │   └── {taskId}.srt     # 字幕文件
```

## 回调数据结构

### 成功回调示例

```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "audio_url": "http://minio:9000/podcast-audio/podcast/{taskId}/audio.mp3?...",
  "subtitle_url": "http://minio:9000/podcast-audio/podcast/{taskId}/{taskId}.srt?...",
  "round_audios": [
    {
      "roundId": 1,
      "speaker": "主播 A",
      "audioUrl": "http://minio:9000/podcast-audio/podcast/{taskId}/round_1.mp3?..."
    },
    {
      "roundId": 2,
      "speaker": "主播 B",
      "audioUrl": "http://minio:9000/podcast-audio/podcast/{taskId}/round_2.mp3?..."
    },
    {
      "roundId": 3,
      "speaker": "主播 A",
      "audioUrl": "http://minio:9000/podcast-audio/podcast/{taskId}/round_3.mp3?..."
    }
  ],
  "duration": 120.5
}
```

## 优势

### 1. 灵活的编辑和复用 ✂️
- 可以单独获取和编辑某一轮的音频
- 无需重新生成整个播客就能替换某一轮
- 高质量的轮次音频可以在其他项目中复用

### 2. 便于调试和问题排查 🔍
- 快速定位音质问题发生在哪一轮
- 可以独立分析每一轮的生成质量
- 便于性能分析和优化

### 3. 更好的容错机制 🛡️
- 如果某一轮失败可以只重新生成该轮
- 完整的成功轮次音频已永久保存
- 支持断点续传，继续生成未完成的轮次

### 4. 数据分析和统计 📊
- 可以统计每个说话人的音频生成时间
- 便于生成详细的质量报告
- 支持多维度的性能分析

## 使用示例

### 创建播客任务

```bash
curl -X POST http://localhost:3000/podcast/create \
  -H "Content-Type: application/json" \
  -d '{
    "action": 0,
    "input_text": "这是一个播客文本",
    "audio_config": {
      "format": "mp3",
      "sample_rate": 24000,
      "speech_rate": 0
    },
    "callback_url": "http://your-callback-url/podcast/callback"
  }'
```

### 回调接收示例

您的回调服务收到的数据结构：

```python
from flask import Flask, request

app = Flask(__name__)

@app.route('/podcast/callback', methods=['POST'])
def handle_podcast_callback():
    data = request.json
    
    task_id = data['task_id']
    status = data['status']
    
    if status == 'success':
        # 获取最终音频
        final_audio_url = data['audio_url']
        
        # 获取所有分轮音频
        for round_audio in data['round_audios']:
            round_id = round_audio['roundId']
            speaker = round_audio['speaker']
            audio_url = round_audio['audioUrl']
            print(f"Round {round_id} ({speaker}): {audio_url}")
        
        # 获取字幕
        subtitle_url = data.get('subtitle_url')
        
        # 获取总时长
        duration = data['duration']
        
        print(f"Podcast generated successfully!")
        print(f"Final audio: {final_audio_url}")
        print(f"Duration: {duration}s")
    else:
        error_msg = data['error_message']
        print(f"Podcast generation failed: {error_msg}")
    
    return {"status": "received"}, 200
```

## 相关代码位置

- **实现文件**: [podcast.service.ts](../src/podcast/podcast.service.ts)
  - `saveRoundAudio()` - 保存分轮音频的核心方法
  - `PODCAST_ROUND_END` 事件处理 - 触发分轮保存

- **DTO 定义**: [podcast-tts.dto.ts](../src/podcast/dto/podcast-tts.dto.ts)
  - `PodcastCallbackPayload` - 回调数据结构

- **存储服务**: [minio.service.ts](../src/minio/minio.service.ts)
  - `uploadFile()` - 文件上传到 MinIO

## 注意事项

1. **网络和存储成本**: 每个轮次都会单独上传到 MinIO，请确保有足够的带宽和存储空间

2. **回调 URL 有效期**: MinIO 预签名 URL 默认有效期为 7 天，如需更长有效期请修改配置

3. **错误处理**: 单个轮次的保存失败不会中断整个播客生成，但会记录日志供后续查询

4. **性能考虑**: 并发上传多个轮次可能会增加系统负载，如需优化可考虑批量上传或异步队列

## 常见问题

**Q: 为什么需要既保存分轮音频又保存最终合并音频？**

A: 分轮音频用于灵活编辑和调试，最终合并音频用于直接使用。两者互补，满足不同使用场景。

**Q: 如果某一轮生成失败，分轮音频会被保存吗？**

A: 不会。只有在 `PODCAST_ROUND_END` 事件中 `is_error` 为 false 时才会保存。出错的轮次会跳过保存并记录日志。

**Q: 可以禁用分轮音频保存吗？**

A: 目前无法通过配置禁用，但如果不需要分轮音频，可以在回调中忽略 `round_audios` 字段。

