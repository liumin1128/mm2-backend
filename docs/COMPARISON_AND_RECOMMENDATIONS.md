# 参考对比：mm2-backend vs mm2-one

## 功能实现对比

| 功能特性 | 参考项目(mm2-one) | 当前项目(mm2-backend) | 状态 |
|---------|------------------|----------------------|------|
| **基础播客生成** | ✅ | ✅ | ✅ 已有 |
| **WebSocket 通信** | ✅ | ✅ | ✅ 已有 |
| **重试机制** | ✅ 有 | ✅ 有 | ✅ 已实现 |
| **字幕生成** | ✅ SRT格式 | ✅ SRT格式 | ✅ 已实现 |
| **分轮音频保存** | ✅ 保存到数组 | ✅ 上传到MinIO | ✨ **新实现** |
| **MinIO 存储** | ❌ 文件系统 | ✅ MinIO | ✨ **优势** |
| **回调通知** | ❌ 无 | ✅ 有 | ✨ **优势** |
| **任务状态查询** | ❌ 无 | ✅ 有 | ✨ **优势** |

## 实现方式对比

### 📊 参考项目 (podcasts.ts)

```typescript
// 存储分轮音频到内存数组
const roundAudios: Array<{
  speaker: string;
  roundId: number;
  audio: Buffer;  // 音频数据本体
}> = [];

// 轮次结束时添加到数组
roundAudios.push({
  speaker: voice,
  roundId: currentRound,
  audio: audioBuffer,
});

// 最终返回结果对象
return {
  finalAudio: audioBuffer,
  roundAudios: roundAudios,        // 返回内存数组
  subtitleSRT: srt,
  podcastInfo: info,
  podcastTexts: texts,
};
```

### 🚀 当前实现 (mm2-backend)

```typescript
// 存储分轮音频的元数据 + URL
interface RoundAudio {
  roundId: number;
  speaker: string;
  audioUrl: string;  // MinIO 预签名 URL
}

// 轮次结束时上传到 MinIO
const audioUrl = await this.minioService.uploadFile(
  `podcast/${taskId}/round_${roundId}.mp3`,
  audioBuffer,
  contentType,
);

task.roundAudios.push({
  roundId: currentRound,
  speaker: speaker,
  audioUrl,  // 存储 URL，不是音频本体
});

// 回调返回 URL 列表
{
  round_audios: [
    { roundId: 1, speaker: "主播A", audioUrl: "http://..." },
    { roundId: 2, speaker: "主播B", audioUrl: "http://..." }
  ]
}
```

## 架构优劣对比

### 参考项目的方式（内存存储）

| 优点 | 缺点 |
|------|------|
| ✅ 速度快（无IO） | ❌ 内存占用大 |
| ✅ 实现简单 | ❌ 数据易丢失 |
| ✅ 无外部依赖 | ❌ 不利于分布式 |
| | ❌ 无法长期保存 |
| | ❌ 多个消费者需复制数据 |

### 当前项目的方式（MinIO 存储）

| 优点 | 缺点 |
|------|------|
| ✅ 内存占用少 | ❌ 速度相对慢（有IO） |
| ✅ 数据持久化 | ❌ 需要外部依赖 |
| ✅ 支持分布式 | ❌ 实现稍复杂 |
| ✅ 易于扩展（云存储） | ❌ URL 过期问题 |
| ✅ 支持多消费者 | |
| ✅ 便于审计和恢复 | |

## 性能指标对比

### 假设场景：生成3轮播客，每轮10MB 音频

#### 参考项目方式
```
内存占用：
  • 全局buffer:  30MB
  • roundAudios: 30MB (3轮 × 10MB)
  • 其他:        ~5MB
  总计:         ≈65MB

处理时间:
  • 轮次结束 → 内存操作: 毫秒级 ⚡
```

#### 当前项目方式
```
内存占用:
  • 全局buffer:         30MB
  • roundAudioChunks:   10MB (单轮缓冲，及时清空)
  • roundAudios元数据: <1MB (仅URL，不含数据)
  总计:               ≈41MB ✅ 省24MB

处理时间:
  • 轮次结束 → 上传MinIO: 秒级~十秒级 ⏱️
  • 但支持后续查询、复用等
```

## 功能对标表

### 与参考项目 mm2-one 的差异

| 功能 | mm2-one | mm2-backend | 说明 |
|------|---------|------------|------|
| `only_nlp_text` 参数 | ✅ 支持 | ❌ 未支持 | 仅返回NLP处理后的文本 |
| `return_audio_url` 参数 | ✅ 支持 | ❌ 未支持 | 返回服务器生成的URL |
| `skip_round_audio_save` | ✅ 支持 | ⚠️ 不可配置 | 强制保存分轮音频 |
| 使用 Info 信息 | ✅ 使用 | ⚠️ 部分 | 字幕中使用了 |
| 返回 PodcastInfo | ✅ 返回 | ✅ 返回 | 字幕管理器生成 |
| 返回 PodcastTexts | ✅ 返回 | ❌ 未返回 | `only_nlp_text=true` 时 |

## 融合建议

### 建议补充的功能

#### 1. 添加 only_nlp_text 和 return_audio_url 参数
```typescript
// 在 DTO 中扩展 InputInfoDto
export class InputInfoDto {
  @IsOptional()
  @IsBoolean()
  only_nlp_text?: boolean;      // 新增
  
  @IsOptional()
  @IsBoolean()
  return_audio_url?: boolean;   // 新增
}

// 在回调中可选返回文本
round_audios?: Array<{
  roundId: number;
  speaker: string;
  audioUrl?: string;      // 可选，取决于 return_audio_url
  text?: string;          // 新增，取决于 only_nlp_text
}>
```

#### 2. 支持配置禁用分轮保存
```typescript
// 在 DTO 中添加
@IsOptional()
@IsBoolean()
skip_round_audio_save?: boolean = false;  // 默认保存

// 在 saveRoundAudio() 中判断
if (this.configService.get<boolean>('SKIP_ROUND_AUDIO_SAVE') || 
    dto.skip_round_audio_save) {
  return; // 跳过保存
}
```

#### 3. 返回 PodcastTexts
```typescript
// 在回调中添加
podcastTexts?: Array<{ speaker: string; text: string }>;

// 在 handleTaskCompletion 中收集
if (dto.input_info?.only_nlp_text) {
  // 从字幕管理器或消息中提取文本
  callbackPayload.podcastTexts = [/*...*/];
}
```

### 优先级建议
1. **高**: 添加 `only_nlp_text` 和 `return_audio_url` 参数（常用功能）
2. **中**: 返回 `podcastTexts`（补充数据）
3. **低**: `skip_round_audio_save` 配置（性能优化）

## 部署检查清单

- [x] 分轮音频保存功能实现
- [x] MinIO 集成完成
- [x] 回调数据结构更新
- [x] 编译测试通过
- [ ] 单元测试（待补充）
- [ ] 集成测试（待补充）
- [ ] 性能测试（待补充）
- [ ] 文档更新完成 ✅
- [ ] 生产环境检查清单（待准备）

---

**总体评价**: 🌟🌟🌟🌟

当前实现在参考项目基础上进行了**架构升级**，采用了更合理的存储方案（MinIO），并补充了**异步回调通知**和**任务状态查询**等企业级功能。建议后续根据需求补充上述的功能参数，以完全兼容参考项目的功能集合。

长官！

