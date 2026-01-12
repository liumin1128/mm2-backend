# Debug Mode 功能实现摘要

## 实现时间
2026年1月12日

## 功能描述
新增 `debug_mode` 参数，当启用时（`debug_mode: true`），播客生成的音频和字幕文件将保存到本地文件系统而不是上传到 MinIO，方便开发和调试。

## 修改内容

### 1. DTO 定义 ([src/podcast/dto/podcast-tts.dto.ts](../src/podcast/dto/podcast-tts.dto.ts))
- 已存在 `debug_mode?: boolean = false` 字段，无需修改

### 2. 服务逻辑 ([src/podcast/podcast.service.ts](../src/podcast/podcast.service.ts))
- **新增导入**：添加 `fs` 和 `path` 模块
- **TaskContext 接口**：新增 `debugMode: boolean` 字段
- **createPodcast 方法**：从 DTO 读取 `debug_mode` 并传递到任务上下文
- **新增方法 `saveFileLocally()`**：将文件保存到本地文件系统
  - 保存位置：`{项目根目录}/debug_output/{相对路径}`
  - 返回格式：`file:///absolute/path/to/file`
- **修改 `saveRoundAudio()`**：支持 debug 模式，根据 `debugMode` 选择本地保存或 MinIO 上传
- **修改 `finishTask()`**：支持完整音频和字幕的 debug 模式保存

### 3. Git 配置 ([.gitignore](../.gitignore))
- 新增 `debug_output/` 目录到 `.gitignore`，避免将调试文件提交到版本控制

### 4. 测试 ([src/podcast/dto/podcast-tts.basic.spec.ts](../src/podcast/dto/podcast-tts.basic.spec.ts))
- 新增 `CreatePodcastDto - debug_mode` 测试套件
- 测试 `debug_mode` 的默认值、true 和 false 三种情况
- ✅ 所有测试通过（24个测试用例）

### 5. 文档
- 新增 [DEBUG_MODE.md](DEBUG_MODE.md) 完整功能文档
- 新增本摘要文件

## 技术细节

### 文件路径结构
```
debug_output/
└── podcast/
    └── {input_id}/
        └── {task_id}/
            ├── audio.{format}         # 完整音频
            ├── subtitles.srt          # 字幕文件
            ├── round_1.{format}       # 第1轮音频
            ├── round_2.{format}       # 第2轮音频
            └── ...
```

### URL 格式对比
- **正常模式（MinIO）**：`https://minio.example.com/bucket/path/to/file.mp3?signature=...`
- **Debug 模式（本地）**：`file:///absolute/path/to/debug_output/podcast/...`

## 使用示例

### 启用 Debug 模式
```json
{
  "action": 0,
  "input_text": "测试内容",
  "callback_url": "http://localhost:3000/callback",
  "debug_mode": true
}
```

### 禁用 Debug 模式（默认）
```json
{
  "action": 0,
  "input_text": "测试内容",
  "callback_url": "http://localhost:3000/callback"
}
```
或者
```json
{
  "action": 0,
  "input_text": "测试内容",
  "callback_url": "http://localhost:3000/callback",
  "debug_mode": false
}
```

## 注意事项

1. **适用场景**：主要用于开发和测试环境
2. **文件访问**：本地文件仅可在服务器本地访问
3. **磁盘管理**：需要定期清理 `debug_output` 文件夹
4. **生产环境**：建议保持默认值 `false`，使用 MinIO 存储

## 相关文件

- [src/podcast/dto/podcast-tts.dto.ts](../src/podcast/dto/podcast-tts.dto.ts) - DTO 定义
- [src/podcast/podcast.service.ts](../src/podcast/podcast.service.ts) - 核心服务逻辑
- [src/podcast/dto/podcast-tts.basic.spec.ts](../src/podcast/dto/podcast-tts.basic.spec.ts) - 测试用例
- [docs/DEBUG_MODE.md](DEBUG_MODE.md) - 使用文档
- [.gitignore](../.gitignore) - Git 配置

## 测试结果

✅ 所有测试通过
- 24 个测试用例全部通过
- 测试覆盖 debug_mode 的所有使用场景

## 代码质量

✅ 无编译错误
✅ 无 lint 警告
✅ 代码复用良好
✅ 最小化修改，不影响现有功能
