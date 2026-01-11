# 分轮音频保存功能 - 快速参考

## 核心改动

### 1️⃣ TaskContext 接口扩展
```typescript
interface RoundAudio {
  roundId: number;      // 轮次ID
  speaker: string;      // 说话人
  audioUrl: string;     // MinIO URL
}

// 在 TaskContext 中添加：
roundAudioChunks: Buffer[];    // 当前轮数据
roundAudios: RoundAudio[];     // 已保存列表
```

### 2️⃣ 事件处理流程

| 事件 | 操作 |
|------|------|
| `PODCAST_ROUND_START` | 记录当前说话人 |
| `PODCAST_ROUND_RESPONSE` | 同时追加到全局和轮次缓冲 |
| `PODCAST_ROUND_END` | ⚡ **调用 saveRoundAudio()** |
| `CONNECTION_FINISHED` | 返回完整回调数据 |

### 3️⃣ saveRoundAudio() 方法
```
合并轮次数据 → 上传到 MinIO → 记录 URL → 清空缓冲
```

### 4️⃣ 回调数据新增字段
```json
{
  "round_audios": [
    { "roundId": 1, "speaker": "主播A", "audioUrl": "http://..." },
    { "roundId": 2, "speaker": "主播B", "audioUrl": "http://..." }
  ]
}
```

## 文件修改

```
src/podcast/
├── podcast.service.ts          ✏️ 添加 RoundAudio 接口 + saveRoundAudio() 方法
├── dto/podcast-tts.dto.ts      ✏️ 在 PodcastCallbackPayload 添加 round_audios
└── podcast-protocol.util.ts    ✓ 无需改动

docs/
├── ROUND_AUDIO_FEATURE.md      📄 详细功能文档
└── IMPLEMENTATION_SUMMARY.md   📄 实现总结
```

## 测试检查清单

- [ ] 编译通过（`pnpm build`）
- [ ] 创建播客任务成功
- [ ] WebSocket 连接正常
- [ ] 接收到多轮数据
- [ ] 回调包含 `round_audios` 数组
- [ ] MinIO 中存在 `round_*.mp3` 文件
- [ ] 每轮都有对应的 speaker 信息
- [ ] 最终合并音频仍正常生成

## 关键代码位置

### 📍 保存分轮音频
[podcast.service.ts#L428-L478](../src/podcast/podcast.service.ts)

### 📍 触发保存
[podcast.service.ts#L376-L379](../src/podcast/podcast.service.ts)

### 📍 回调数据结构
[podcast-tts.dto.ts#L161-L168](../src/podcast/dto/podcast-tts.dto.ts)

## 性能考虑

| 因素 | 影响 |
|------|------|
| 网络请求数 | +每轮1个上传请求 |
| 存储空间 | 分轮 + 合并 ≈ 2x 原始大小 |
| 处理时间 | 轮次结束时同步上传（IO阻塞） |

### 优化建议
- 考虑异步队列处理上传
- 实现分轮音频缓存清理策略
- 监控 MinIO 存储使用情况

## 常见问题

**Q: 为什么保存失败不会导致任务失败？**  
A: 分轮保存是增强功能，失败只会记录日志不影响主流程

**Q: 旧版本的回调中没有 round_audios，是否会出错？**  
A: 不会，该字段是可选的（`?:`），向后兼容

**Q: 如何禁用分轮保存？**  
A: 目前必须启用，可在 saveRoundAudio() 开头添加配置判断

**Q: 多个任务同时运行会不会冲突？**  
A: 不会，每个任务有独立的 TaskContext 和 MinIO objectName

## 下一步优化

- [ ] 实现分轮音频异步上传队列
- [ ] 添加分轮音频元数据存储（时长、大小、质量评分）
- [ ] 支持分轮音频合并成其他格式
- [ ] 添加分轮音频的版本管理
- [ ] 实现分轮音频的预处理（AI 质量检测、音量归一化等）

---

长官！

