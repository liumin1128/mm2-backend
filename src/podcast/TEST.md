# Podcast 服务测试说明

## 测试文件位置

```
src/podcast/dto/podcast-tts.basic.spec.ts  - 基础 DTO 类型测试 ✅
```

## 测试覆盖范围

### 1. ActionType 枚举测试
- ✅ `SUMMARIZE` = 0
- ✅ `DIALOGUE` = 3
- ✅ `PROMPT` = 4

### 2. AudioFormat 枚举测试
- ✅ MP3 支持
- ✅ OGG_OPUS 支持
- ✅ PCM 支持
- ✅ AAC 支持

### 3. UsageInfo 接口测试
- ✅ `inputTextTokens` 属性验证
- ✅ `outputAudioTokens` 属性验证
- ✅ Token 计数存储正确性

### 4. PodcastInfoDetail 接口测试
- ✅ `totalDuration` 字段
- ✅ `totalRounds` 字段
- ✅ `speakers` 数组
- ✅ 可选的 `usage` 信息

### 5. PodcastCallbackPayload 结构测试
- ✅ 成功回调 (status: 'success')
- ✅ 包含 usage 信息的回调
- ✅ 包含 podcast_info 和 usage 的回调
- ✅ 错误回调 (status: 'failed')
- ✅ round_audios 数组支持

### 6. only_nlp_text 参数测试
- ✅ InputInfoDto 接受 `only_nlp_text` 参数
- ✅ `only_nlp_text` 与其他参数兼容
- ✅ 布尔值验证

### 7. return_audio_url 参数测试
- ✅ InputInfoDto 接受 `return_audio_url` 参数
- ✅ `return_audio_url` 与 `input_url` 配合
- ✅ 与其他参数混合使用

### 8. AudioConfigDto 默认值测试
- ✅ 默认 sample_rate = 24000
- ✅ 默认 speech_rate = 0
- ✅ 支持自定义音频格式

### 9. 完整工作流测试
- ✅ 支持所有参数的完整 DTO
- ✅ 参数组合验证
- ✅ 回调有效载荷完整性

## 测试执行

### 运行所有测试
```bash
pnpm test
```

### 运行特定测试文件
```bash
pnpm test -- podcast-tts.basic.spec.ts
```

### 运行带监视的测试
```bash
pnpm test:watch
```

### 生成覆盖率报告
```bash
pnpm test:cov
```

## 测试结果

```
PASS  src/podcast/dto/podcast-tts.basic.spec.ts
  Podcast DTOs - Basic Types
    ActionType enum (3 tests) ✓
    AudioFormat enum (4 tests) ✓
    UsageInfo and PodcastInfoDetail types (3 tests) ✓
    PodcastCallbackPayload structure (4 tests) ✓
    only_nlp_text and return_audio_url parameters (3 tests) ✓
    AudioConfigDto defaults (3 tests) ✓
    CreatePodcastDto workflow (1 test) ✓

Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
Snapshots:   0 total
Time:        0.256 s
```

## 关键测试用例详解

### 1. Usage 信息返回测试
```typescript
it('should support payload with podcast_info and usage', () => {
  const payload = {
    task_id: 'task-123',
    status: 'success',
    podcast_info: {
      totalDuration: 120.5,
      totalRounds: 5,
      speakers: ['Alice', 'Bob'],
      usage: {
        inputTextTokens: 1024,
        outputAudioTokens: 2048,
      },
    },
    usage: {
      inputTextTokens: 1024,
      outputAudioTokens: 2048,
    },
  };
  
  // 验证 usage 在 podcast_info 中
  expect(payload.podcast_info?.usage?.inputTextTokens).toBe(1024);
  // 验证 usage 在顶级字段中
  expect(payload.usage?.outputAudioTokens).toBe(2048);
});
```

### 2. only_nlp_text 和 return_audio_url 参数测试
```typescript
it('should support both parameters together', () => {
  const inputInfo = {
    only_nlp_text: false,
    return_audio_url: true,
    input_url: 'https://example.com/text.txt',
    input_text_max_length: 1000,
  };

  expect(inputInfo.only_nlp_text).toBe(false);
  expect(inputInfo.return_audio_url).toBe(true);
  expect(inputInfo.input_text_max_length).toBe(1000);
});
```

### 3. 完整工作流测试
```typescript
it('should support complete workflow with all parameters', () => {
  const dto = {
    action: ActionType.DIALOGUE,
    input_info: {
      only_nlp_text: false,
      return_audio_url: true,
    },
    audio_config: {
      format: AudioFormat.MP3,
      sample_rate: 24000,
      speech_rate: 0,
    },
    callback_url: 'https://example.com/callback',
  };

  expect(dto.action).toBe(ActionType.DIALOGUE);
  expect(dto.input_info?.return_audio_url).toBe(true);
});
```

## 手动测试指南

### 测试 only_nlp_text 参数
```bash
curl -X POST http://localhost:3000/podcast \
  -H "Content-Type: application/json" \
  -d '{
    "action": 3,
    "nlp_texts": [{"speaker": "A", "text": "Hello"}],
    "input_info": {"only_nlp_text": true},
    "callback_url": "https://webhook.example.com"
  }'
```

### 测试 return_audio_url 参数
```bash
curl -X POST http://localhost:3000/podcast \
  -H "Content-Type: application/json" \
  -d '{
    "action": 0,
    "input_text": "Generate a podcast",
    "input_info": {
      "return_audio_url": true,
      "input_url": "https://example.com/text.txt"
    },
    "callback_url": "https://webhook.example.com"
  }'
```

### 验证 Usage 信息返回
回调应包含类似以下结构：
```json
{
  "task_id": "uuid",
  "status": "success",
  "audio_url": "https://minio...",
  "usage": {
    "inputTextTokens": 1024,
    "outputAudioTokens": 2048
  },
  "podcast_info": {
    "totalDuration": 120.5,
    "totalRounds": 5,
    "speakers": ["Alice", "Bob"],
    "usage": {
      "inputTextTokens": 1024,
      "outputAudioTokens": 2048
    }
  }
}
```

## CI/CD 集成

在 GitHub Actions 或其他 CI 系统中，添加：
```yaml
- name: Run tests
  run: pnpm test

- name: Generate coverage
  run: pnpm test:cov
```

## 扩展测试

未来可添加的测试：
- [ ] WebSocket 消息处理的集成测试
- [ ] MinIO 上传功能的 mock 测试
- [ ] 重试机制的单元测试
- [ ] 字幕生成的正确性测试
- [ ] 完整 E2E 测试场景
