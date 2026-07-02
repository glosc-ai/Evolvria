# 安全、隐私与法律

## 目标

定义 Evolvria 在本地存档、AI 密钥、媒体资产、UGC、未成年人保护、版权和平台安全上的边界。目标是从 MVP 开始避免把用户私密叙事、API key 和版权风险变成技术债。

## 范围

- Tauri 2 本地应用安全。
- API key 和 provider 配置。
- 本地存档、导入导出、日志。
- UGC、媒体、版权和内容审核。
- 未成年人和成人内容边界。
- 不替代正式法律意见。

## 数据分类

| 数据 | 敏感度 | 默认存储 | 上传策略 |
| --- | --- | --- | --- |
| Persona | 高 | 本地 workspace | 仅用户启用同步 |
| Chat messages | 高 | 本地 workspace | 私有同步需显式确认 |
| Storyline/Character drafts | 中 | 本地 workspace | 发布时只上传选中版本 |
| Media assets | 中/高 | 本地 assets | 发布时上传选中资产 |
| API keys | 高 | 系统安全存储 | 不上传 |
| Logs | 中 | 本地 logs | 用户主动导出 |
| Cost ledger | 中 | 本地/云端 | 云端计费时上传 |

## 密钥安全

- OpenAI-compatible API key 不写入 `save.json`。
- Tauri 桌面版优先使用系统 Keychain/Keystore；`secret_set` 返回实际后端供 UI 展示。
- `secret_get` 支持 `EVOLVRIA_OPENAI_COMPATIBLE_API_KEY` 环境变量，适合开发、CI 或不想保存密钥的用户。
- `secret_delete` 必须从 Keychain、显式 fallback 文件和旧版迁移文件中清除 provider key；如果环境变量仍存在，设置页提示用户需要在系统环境中取消设置。
- 系统 Keychain 不可用时默认拒绝保存密钥；只有用户显式设置 `EVOLVRIA_ALLOW_INSECURE_SECRET_FILE=1` 才允许 `secrets.insecure.json` 文件 fallback，并在 UI 中提示风险。
- 旧版 `secrets.json` 只作为迁移来源：能迁移到 Keychain 时移除对应旧记录，不能迁移时默认不读取，除非显式开启不安全文件 fallback。
- 日志和错误报告必须脱敏：只显示 key 前后少量字符或哈希。
- 导出 zip 不包含 API key。

## 存档安全

写入：

- 原子写入，避免半写文件。
- 写入前 schema 校验。
- AI 请求前 checkpoint。
- 重大迁移前备份。

导入：

- zip 解压到临时目录。
- 检查路径穿越。
- 检查文件大小、数量、MIME、schema version。
- 媒体文件只复制到 workspace assets。
- 冲突时创建副本，不静默覆盖。

删除：

- MVP 本地删除先进入 trash/backup。
- 云端删除需处理公开内容、收益账本和法务保留期。

## Tauri 安全

参考 Tauri 2 官方 capabilities/permissions 模型：

- 最小权限 capability。
- 不暴露 shell 执行。
- 不暴露任意文件系统读写。
- 不把用户输入拼接成路径。
- `invoke` 输入全部 serde 校验。
- CSP 限制脚本和远端媒体来源。
- 开发 build 和生产 build 使用不同配置。

安全测试见 [测试策略](14-testing-strategy.md)。

## 隐私原则

- 本地优先：默认不上传 Persona、Chat、草稿。
- 明示同步：启用云同步前说明上传范围。
- 账号预览：MVP 的 Account local sign-in 只保存 display name、email、age gate 和权限快照，不保存密码、OAuth token 或真实会话。
- 可导出：用户可导出 workspace。
- 可删除：用户可删除本地 workspace；云端阶段提供删除请求。
- 最小日志：不记录完整聊天内容到诊断日志，除非用户主动选择包含。

## UGC 与版权

禁止：

- 复制 ISEKAI ZERO 或其他平台的角色图、故事文本、用户内容。
- 使用未授权动漫、游戏、小说角色作为官方示例。
- 使用真实人物肖像、声音或身份进行误导。
- 上传无来源、无 license 的媒体进入公开发布流程。

要求：

- 每个 `MediaAsset` 有 `source`、`license`、`altText`。
- 每个发布内容有创作者声明。
- 举报入口覆盖版权问题。
- 重复侵权创作者可限制发布或收益。

## 未成年人和成人内容

MVP 默认：

- AdultLocked 内容隐藏。
- 不做成人内容推荐。
- 示例内容全部 SFW 或轻度 M17。
- 未成年人相关高风险内容直接拒绝。

Cloud 阶段：

- 年龄门槛。
- 成人内容隔离。
- 搜索和推荐过滤。
- 人审队列。
- 地区合规策略。

MVP Account Preview 已将年龄门槛接入权限：`minor` 只保留 private sync 权限，并关闭 AdultLocked 解锁；`adult` 才显示 publish、billing 和 adult_content 预留权限。真实年龄验证、地区策略和家长同意仍属于 Cloud 阶段。

## AI 安全边界

- 模型输出不是事实来源，关键状态写入 reducer 后才生效。
- 安全拒绝要简短，不提供绕过建议。
- 用户 OOC 请求不能覆盖平台安全规则。
- prompt 不包含密钥、绝对路径、其他用户私有数据。
- provider 错误不暴露完整请求体。

## 法务文档预留

Cloud 前必须准备：

- Terms of Service。
- Privacy Policy。
- Community Guidelines。
- Creator Terms。
- Content Rating Policy。
- Copyright/DMCA 或本地等效流程。
- Payment、Refund、Payout Terms。

这些文档只能参考公开平台的结构，不复制其原文。

## 关键决策

- API key 永不进入 workspace 导出包。
- 本地聊天默认不上传，云同步必须 opt-in。
- 官方示例内容必须原创且版权清晰。
- 成人内容和收益功能必须等审核体系成熟后再开放。

## 验收标准

- 导出 zip 不包含密钥、绝对路径或诊断日志。
- 恶意 zip 导入不会写出应用数据目录。
- 日志默认不包含完整聊天和 API key。
- 每个可公开实体都有版权来源、分级和审核状态字段。
