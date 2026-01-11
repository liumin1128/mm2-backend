# Podcast 服务功能说明

## 最近实现的功能

### 1. only_nlp_text 参数支持

**用途**: 只提取播客的 NLP 文本，不生成音频

**请求示例**:
```json
{
  "action": 3,
  "nlp_texts": [...],
  "input_info": {
    "only_nlp_text": true
  },
  "callback_url": "https://example.com/callback"
}
```

**特点**:
- 当启用此参数时，服务仅会处理 NLP 文本，不生成音频数据
- 日志会记录: `[Task {taskId}] only_nlp_text enabled: will extract NLP texts without audio`
- 响应中的 `audio_url` 可能为空

---

### 2. return_audio_url 参数支持

**用途**: 让服务器返回生成的音频 URL 而不需要手动上传

**请求示例**:
```json
{
  "action": 0,
  "input_text": "...",
  "input_info": {
    "input_url": "...",
    "return_audio_url": true
  },
  "callback_url": "https://example.com/callback"
}
```

**特点**:
- 启用后，服务器会在响应中返回一个直接可用的音频 URL
- 日志会记录: `[Task {taskId}] return_audio_url enabled: server will return audio URL`
- 可减少本地存储的需求

---

### 3. Usage 信息存储和返回

**功能**: 完整的 Token 使用统计

**回调响应示例**:
```json
{
  "task_id": "uuid",
  "status": "success",
  "audio_url": "minio://...",
  "duration": 120.5,
  "usage": {
    "inputTextTokens": 1024,
    "outputAudioTokens": 2048
  },
  "podcast_info": {
    "totalDuration": 120.5,
    "totalRounds": 5,
    "speakers": ["speaker1", "speaker2"],
    "usage": {
      "inputTextTokens": 1024,
      "outputAudioTokens": 2048
    }
  }
}
```

**新增字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `usage` | `UsageInfo` | Token 使用统计 |
| `usage.inputTextTokens` | number | 输入文本消耗的 token 数 |
| `usage.outputAudioTokens` | number | 输出音频消耗的 token 数 |
| `podcast_info` | `PodcastInfoDetail` | 播客详细信息 |
| `podcast_info.totalDuration` | number | 总时长（秒） |
| `podcast_info.totalRounds` | number | 总轮数 |
| `podcast_info.speakers` | string[] | 所有说话人列表 |
| `podcast_info.usage` | `UsageInfo` | Usage 信息 |

---

## 完整请求示例

```typescript
// 同时启用所有参数
const request = {
  action: ActionType.DIALOGUE,
  nlp_texts: [
    { speaker: "Alice", text: "Hello!" },
    { speaker: "Bob", text: "Hi there!" }
  ],
  input_info: {
    only_nlp_text: false,           // 生成音频
    return_audio_url: true,         // 获取服务器返回的 URL
    input_text_max_length: 1000
  },
  audio_config: {
    format: AudioFormat.MP3,
    sample_rate: 24000,
    speech_rate: 0
  },
  speaker_info: {
    random_order: false
  },
  callback_url: "https://example.com/callback"
};
```

---

## 日志示例

任务完成时的日志输出:
```
Task {taskId} completed successfully, usage: input_tokens=1024, output_tokens=2048
```

参数跟踪日志:
```
[Task {taskId}] only_nlp_text enabled: will extract NLP texts without audio
[Task {taskId}] return_audio_url enabled: server will return audio URL
```

---

## 相关类型定义

### UsageInfo
```typescript
interface UsageInfo {
  inputTextTokens: number;
  outputAudioTokens: number;
}
```

### PodcastInfoDetail
```typescript
interface PodcastInfoDetail {
  totalDuration: number;
  totalRounds: number;
  speakers: string[];
  usage?: UsageInfo;
}
```

### PodcastCallbackPayload
```typescript
class PodcastCallbackPayload {
  task_id: string;
  status: 'success' | 'failed';
  audio_url?: string;
  subtitle_url?: string;
  round_audios?: Array<{ roundId: number; speaker: string; audioUrl: string }>;
  podcast_info?: PodcastInfoDetail;
  usage?: UsageInfo;
  error_message?: string;
  duration?: number;
}
```
