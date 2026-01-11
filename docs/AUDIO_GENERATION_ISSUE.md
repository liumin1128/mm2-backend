# 音频生成问题分析

## 问题描述

✅ **字幕生成正常** - 根据输入的 nlp_texts 正确生成 21 条字幕

❌ **音频内容固定** - 所有任务返回相同的 7.0117917 秒音频，不管输入什么文本

## 诊断结果

### 测试1: 文本内容变化
- **短文案**: "你好世界" + "你好" → **7.01 秒**
- **长文案**: 两个很长的句子 → **7.01 秒**
- **结果**: 时长完全相同 ❌

### 测试2: 相同内容重复
- **请求1**: 相同文本 → **7.01 秒**
- **请求2**: 相同文本 → **7.01 秒**
- **结果**: 每次都返回固定时长 ✅

## 根本原因

火山引擎 PodcastTTS API 在 **演示模式** 下返回的是固定的演示音频，而不是根据输入文本真实合成的音频。

### 证据

1. **时长恒定**: 所有任务都返回 7.0117917 秒（非常精确的固定值）
2. **内容无关**: 文本长度、内容都不影响时长
3. **一致性**: 多次请求返回完全相同的数据

## 解决方案

### 1. 验证 API 配置

检查 `.env` 文件中的关键参数：

```bash
# 应该检查这些变量是否正确配置
VOLC_APP_ID=          # 火山引擎应用ID
VOLC_ACCESS_KEY=      # 访问密钥
VOLC_SECRET_KEY=      # 秘密密钥
VOLC_REGION=          # 地区（如 cn-beijing）
```

### 2. 验证 WebSocket 连接

检查 [podcast.service.ts](../src/podcast/podcast.service.ts) 中的 wsUrl：

```typescript
private readonly wsUrl = 'wss://openspeech.bytedance.com/api/v3/sami/podcasttts';
```

确认这是正确的生产环境 URL。

### 3. API 参数检查

某些 API 可能需要额外参数来启用真实音频生成：

```typescript
// 可能需要检查这些参数
audio_config: {
  format: 'mp3',
  sample_rate: 24000,
  speech_rate: 0,
  // 可能还需要: 
  // voice_id: '某个值',
  // quality: 'high',
}
```

### 4. API 密钥/鉴权问题

- 检查应用 ID 和密钥是否有效
- 验证是否有 API 使用额度限制
- 确认账户状态是否正常

## 当前状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 字幕生成 | ✅ | 完全正常，根据输入生成 |
| 字幕时间分布 | ✅ | 已修复，均匀分布 |
| 文件存储结构 | ✅ | podcast/{inputId}/{taskId}/ |
| 音频合成 | ❌ | 返回固定演示音频 |

## 后续步骤

1. ⚠️ **核实 API 凭证** - 确保使用的是有效的生产环境密钥
2. ⚠️ **联系支持** - 咨询火山引擎是否需要启用真实音频生成
3. 💡 **查阅文档** - 查看 [火山引擎 PodcastTTS 文档](https://www.volcengine.com/docs/6561/1668014)
4. 🧪 **对比测试** - 用 volcengine_podcasts_demo 验证参数是否正确

## 相关文件

- [音频变化测试脚本](./test-audio-change.sh) - 验证音频内容变化
- [API 诊断脚本](./diagnose-api.sh) - 快速诊断工具
- [PodcastService](../src/podcast/podcast.service.ts) - 核心实现代码
