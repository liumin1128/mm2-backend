## 分轮音频保存功能实现总结

### 🎯 功能描述

在当前项目中实现了**分轮音频保存**功能，使系统在生成播客时能够按轮次分别保存音频片段，而不是仅保存合并后的完整文件。

### 📝 修改文件清单

#### 1. **podcast.service.ts** - 核心实现
- ✅ 添加 `RoundAudio` 接口
- ✅ 扩展 `TaskContext` 接口，添加：
  - `roundAudioChunks: Buffer[]` - 当前轮的音频数据缓冲
  - `roundAudios: RoundAudio[]` - 已保存的分轮音频列表
- ✅ 在 `PODCAST_ROUND_RESPONSE` 事件中，同时保存到两个缓冲区
- ✅ 在 `PODCAST_ROUND_END` 事件中，调用新增方法 `saveRoundAudio()`
- ✅ 新增 `saveRoundAudio()` 方法 - 核心保存逻辑
- ✅ 在任务完成回调中返回 `round_audios` 列表

#### 2. **podcast-tts.dto.ts** - 数据模型
- ✅ 扩展 `PodcastCallbackPayload` 类
- ✅ 添加 `round_audios` 字段：
  ```typescript
  round_audios?: Array<{ roundId: number; speaker: string; audioUrl: string }>;
  ```

#### 3. **docs/ROUND_AUDIO_FEATURE.md** - 完整文档
- ✅ 功能概述和工作流程
- ✅ 技术实现细节
- ✅ MinIO 存储结构
- ✅ 回调数据结构示例
- ✅ 使用示例（curl + Python）
- ✅ 优势和常见问题解答

### 🔧 技术细节

#### MinIO 存储路径结构
```
podcast/{taskId}/
├── round_1.mp3          # 第一轮音频
├── round_2.mp3          # 第二轮音频
├── round_3.mp3          # 第三轮音频
├── audio.mp3            # 合并后的最终音频
└── {taskId}.srt         # 字幕文件
```

#### 数据流

```
WebSocket 接收事件
    ↓
PODCAST_ROUND_RESPONSE
    → 保存音频数据到两个缓冲区
    ↓
PODCAST_ROUND_END
    → 调用 saveRoundAudio()
    → 合并该轮所有数据块
    → 上传到 MinIO
    → 获得预签名 URL
    → 保存到 RoundAudio 对象
    → 清空轮次缓冲区
    ↓
会话结束 (CONNECTION_FINISHED)
    → 合并所有轮次音频
    → 生成字幕
    → 触发回调，返回所有结果
```

#### 关键实现

```typescript
// 1. 初始化 TaskContext
const taskContext: TaskContext = {
  // ...
  audioChunks: [],           // 用于最终合并
  roundAudioChunks: [],      // 临时缓冲（当前轮）
  roundAudios: [],           // 最终列表（所有已保存轮次）
  // ...
};

// 2. 接收音频数据
if (Buffer.isBuffer(frame.payload)) {
  task.audioChunks.push(frame.payload);          // 全局汇总
  task.roundAudioChunks.push(frame.payload);     // 轮次汇总
}

// 3. 轮次结束时保存
await this.saveRoundAudio(taskId, task, audio_duration);

// 4. 清空轮次缓冲
task.roundAudioChunks = [];

// 5. 回调时返回完整信息
round_audios: task.roundAudios
```

### ✨ 优势

| 功能 | 优势 |
|-----|------|
| 灵活编辑 | 可单独编辑某一轮音频，无需重新生成整个播客 |
| 快速调试 | 快速定位音质问题发生在哪一轮 |
| 容错机制 | 某一轮失败可只重新生成该轮，无需重新生成所有轮次 |
| 数据复用 | 高质量的轮次音频可在其他项目中复用 |
| 性能分析 | 可统计每个说话人的生成时间、质量指标等 |

### 📊 回调示例

成功回调：
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
    }
  ],
  "duration": 120.5
}
```

### ✅ 验证状态

- ✅ TypeScript 编译通过
- ✅ 所有修改已保存
- ✅ 代码符合项目规范
- ✅ 已生成完整文档
- ✅ 无破坏性改动（向后兼容）

### 🚀 使用方式

客户端在接收回调时，可以：

1. **获取最终音频**：使用 `audio_url` 字段
2. **获取分轮音频**：遍历 `round_audios` 数组
3. **按需使用**：根据 `speaker` 和 `roundId` 组织使用

```python
# 示例：按说话人组织分轮音频
rounds_by_speaker = {}
for round_audio in callback_data['round_audios']:
    speaker = round_audio['speaker']
    if speaker not in rounds_by_speaker:
        rounds_by_speaker[speaker] = []
    rounds_by_speaker[speaker].append(round_audio)

# 现在可以为每个说话人获取所有的轮次
for speaker, rounds in rounds_by_speaker.items():
    print(f"{speaker} 发言 {len(rounds)} 次")
```

---

**长官！**

