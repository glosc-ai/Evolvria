# 测试策略

## 目标

建立覆盖领域逻辑、前端流程、Tauri commands、AI 降级、内容安全、跨平台发布的测试策略，确保 Evolvria 的本地优先 MVP 可玩、可保存、可恢复。

## 范围

- Vitest 单元测试。
- Vue 组件和 store 测试。
- Rust command 测试。
- Playwright 桌面/移动验收。
- 手动验收清单。
- 内容安全和导入导出安全测试。

## 测试金字塔

| 层级 | 工具 | 重点 |
| --- | --- | --- |
| Domain unit | Vitest | reducer、summary、fate、moderation、cost、sync operation |
| Service unit | Vitest | workspace repository fallback、content repository、sync repository、AI provider mock、error mapping |
| Component | Vitest + Vue Testing Library | 输入、卡片、表单校验、状态 |
| Rust unit/integration | cargo test | workspace、zip、path、media、secrets |
| E2E | Playwright | 首页到聊天、创建、保存、导入导出 |
| Manual | checklist | 安装、平台权限、视觉、性能 |

## Domain 测试

必须覆盖：

- `createStoryline` 默认字段和校验。
- `createChat` 绑定 storyline、scenario、persona。
- `appendUserMessage` 创建 checkpoint。
- `mergeNarrativeResponse` 写入消息、事件、关系变化。
- `retryLastAssistantMessage` 创建分支，不覆盖旧消息。
- `rollbackToCheckpoint` 恢复状态。
- `createMessageWindow` 覆盖默认最近 80 条窗口、加载更早消息计数，以及搜索仍扫描完整聊天。
- `summarizeWindow` 不新增事实。
- `shouldCreateAutoSummary` 覆盖 20 条消息、70% 上下文压力、Arc 状态变化和上次摘要后的去重。
- `compactMessagesForBudget` 覆盖 input context 超限时压缩旧消息、保留最近消息和不可恢复输入超限。
- `MediaGenerationJob` 覆盖 voice/image/video 队列、mock 完成、生成资产、账本记录和 blocked 状态。
- `createLocalAccountSession` / `updateAccountAgeGate` 覆盖 email 规范化、成人/未成年权限差异和非法输入。
- `buildNarrativePromptBundle` 覆盖 System/Safety/World/Character/Persona/Memory/Arc/Fate/Output Contract 分层和 prompt contract version。
- `parseProviderContent` 覆盖结构化 JSON 和纯文本降级。
- `estimateCost` 处理未知模型和预算上限。
- `moderationPrecheck` 对 AdultLocked 默认锁定。
- `createModerationAppeal` / `resolveModerationAppeal` 覆盖申诉理由、状态流转、处理备注和非法状态拦截。
- `LocalContentRepository` 覆盖搜索、facet、分页和本地实体保存。
- `filterLibraryItems` / `publicCatalogStats` 覆盖 Public Catalog、Private Drafts、Review Queue 和 recommended 排序。
- `LocalSyncRepository` 覆盖 queue、push ack、字段冲突、remote/copy 解决、设备快照、operation log 导出/导入和关闭同步保留本地数据。

示例命令：

```bash
yarn test
```

## AI 测试

mock provider：

- 同一输入输出稳定。
- 能根据不同 Storyline/Character 生成不同风格。
- 无 API key 时默认可用。
- 可模拟 auth、timeout、invalid_json、content_filter。

OpenAI-compatible provider：

- base URL 校验。
- AI SDK `generateText` 调用使用 `instructions` 承载系统层，避免 system messages 被 SDK 拒绝。
- AI SDK `generateImage` 使用 OpenAI-compatible `imageModel()` 调用 Glosc One 图片路由；无 API key 或浏览器预览必须可降级为 mock 或 browser-only metadata。
- Glosc One 默认模型路由与 `public/skills/manifest.json` 一致。
- API key 不进入日志。
- 超时可取消。
- 流式和非流式都可解析。
- JSON 失败可纯文本降级。
- `local-http` 无 API key 也能调用 localhost，但拒绝远端主机。
- 内置 skills 通过 `$skill-creator` validator，并在 Vitest 中校验 manifest、`SKILL.md`、`agents/openai.yaml` 文件存在。

## Tauri Command 测试

Rust 测试覆盖：

- `workspace_create` 创建目录和初始文件。
- `workspace_write` 原子写入。
- `workspace_read` schema 校验。
- `workspace_backup` 生成 `save.json` 备份，并在 `search.sqlite3` 存在时附带 SQLite mirror。
- `workspace_list_backups` 能列出备份 metadata，包括 `hasSqliteIndex/sqliteSizeBytes`。
- `workspace_restore_backup` 能恢复指定备份，并在恢复前创建包含当前 SQLite mirror 的 `pre_restore` 备份；旧备份无 SQLite 时必须清理 stale index。
- `workspace_export_zip` 包含 manifest、save、assets。
- `workspace_import_zip` 拒绝路径穿越。
- `media_import` 拒绝超大/非法 MIME。
- `workspace_asset_inventory` 覆盖声明资产、引用/未引用资产、浏览器临时资产、缺失物理文件、variant 路径跟踪和未跟踪物理文件。
- `secret_set/get/delete` 优先走 Keychain，校验 key/value，不把密钥写入 workspace；文件 fallback 必须显式风险开关，清除时要覆盖 Keychain、fallback 文件和旧迁移文件。

示例命令：

```bash
cd src-tauri && cargo test
```

## Playwright E2E

桌面视口：

1. 启动应用。
2. Home 显示继续游玩或示例故事。
3. 进入 Library。
4. 打开 Storyline detail。
5. 点击 Start。
6. 创建 Persona。
7. 进入 Chat。
8. 发送一条消息。
9. mock AI 回复。
10. 返回 Home 再进入，聊天仍存在。
11. 进入 Scene Mode，编辑 `SceneHint` 的 mood、camera 和首个选择项。
12. 保存后选择按钮更新，点击选择项会把更新后的 message 写回 Chat。
13. 注入长聊天后默认只显示最近消息窗口，点击 Load older 展开历史，搜索能找到窗口外消息。

移动视口：

- 390x844。
- 底部导航可用。
- 详情页 CTA 不遮挡内容。
- 聊天输入不和消息重叠。
- sheet 面板可打开和关闭。

创作流：

1. 进入 Creator Studio。
2. 新建 Storyline。
3. 新建 Character。
4. 新建 Scenario。
5. 校验通过。
6. Mock Preview。
7. 保存为 local_ready。

导入导出流：

- 导出当前 workspace。
- 新建临时 profile。
- 导入 zip。
- 校验内容和资产存在。
- 创建 workspace backup，模拟误改后从备份恢复，确认 `pre_restore` 备份可见。

示例命令：

```bash
yarn e2e
```

## 内容安全测试

- SFW 内容不会显示 AdultLocked 标签。
- AdultLocked 默认隐藏于 Library。
- M17 内容显示提示。
- 明显违规内容不能进入 `local_ready`。
- 举报入口在云端公开内容上可见。
- Account Cloud Preview 可对 actioned moderation case 发起申诉，并模拟 upheld/denied 结果。
- Storyline Detail 可创建本地举报；被举报公开 Storyline 经 `Request Changes` 或 `Reject` 后必须退出 Public Catalog。
- Account Cloud Preview 可本地 sign in，显示年龄门槛权限，并在启用 Private Sync 前校验本地 session。
- Account Cloud Preview 可刷新 `SyncDeviceSnapshot`、导出/导入 `.evolvria-sync.json` operation log，并关闭同步但保留本地 workspace 与日志。
- Account Cloud Preview 可添加 available creator earning、提交 payout request，并模拟 block/withhold 风控结果。
- 图片/语音生成缺少 license 时不能发布。

## 安全测试

- zip slip：`../evil` 被拒绝。
- 绝对路径 asset 被拒绝。
- API key 不在 `save.json`、日志、导出 zip。
- CSP 不允许未知脚本。
- Tauri capability 不开放 shell。
- provider 错误不泄漏 request headers。
- EngagementStats 覆盖去重计数、消息累加、`lastPlayedAt` 更新和 Library `played` 排序。

## 性能测试

MVP 目标：

- 1000 条消息聊天打开小于 1.5 秒。
- 长聊天 Chat UI 默认只渲染最近消息窗口，点击加载更早消息不触发新 AI 请求，搜索结果来自完整聊天。
- 搜索 500 个本地实体小于 200ms。
- 保存 5MB workspace 小于 500ms。
- 导出 100MB assets 有进度且可取消。

Beta 目标：

- 10000 条消息需要 SQLite 或分页策略。
- Scene Mode 30fps 基本稳定。

## 手动验收

每次发布前：

- macOS 首次启动。
- Windows 首次启动。
- 离线 mock 聊天。
- provider key 保存/清除。
- 导入导出中文路径。
- 恢复备份。
- 主题和响应式。
- 错误状态可理解。
- 无竞品素材或品牌。

## CI 建议

```bash
yarn install --frozen-lockfile
yarn typecheck
yarn test
yarn build
cd src-tauri && cargo test
yarn e2e
```

如果使用 GitHub Actions：

- PR：typecheck、unit、Rust tests。
- nightly：Playwright、Tauri build smoke。
- release：签名构建、生成 SBOM、上传 artifacts。

## 关键决策

- mock provider 是测试核心，避免 E2E 依赖真实模型。
- 导入导出和存档恢复必须自动化测试。
- 内容安全不是云端后置事项，MVP 也要校验字段。
- 视觉回归至少覆盖 Home、Library、Detail、Chat、Creator。
- 本地内容软删除必须覆盖 repository、索引、Library 隐藏、Creator Studio 恢复和同步 operation 预留。
- Prompt Preview 必须测试分层 prompt 可见且密钥脱敏函数覆盖常见 key/token 形态。

## 验收标准

- `yarn test`、`cargo test`、Playwright smoke 在主平台通过。
- Tauri command 错误路径有测试。
- E2E 覆盖发现到聊天、创作到预览、导出到导入。
- 单元/E2E 覆盖 Creator Studio 单个 Storyline package 裁剪导出和导入为本地草稿，确认不包含聊天、Persona 或用户私密存档。
- E2E 覆盖 Storyline package 移入 Trash 后从 Library 隐藏，并能恢复。
- 单元/E2E 覆盖 Private Sync operation log 导出/导入、设备快照和 disable-retaining-local-data。
- 单元/E2E 覆盖 workspace backup 列表和 restore，恢复前必须留下 `pre_restore` 备份。
- E2E 覆盖 Creator Studio Prompt Preview 对用户可见，且不显示示例 API key。
- E2E 覆盖 Storyline 提交审核、批准后进入 Public Catalog、详情页举报、审核要求修改后从公开目录隐藏。
- E2E 覆盖 Chat message bookmark 开关和侧栏计数。
- 单元/E2E 覆盖 provider `relationshipDeltas` 写入消息 metadata 并显示在 Chat context panel。
- E2E 覆盖长聊天 input context 超限时自动生成 SummaryChapter，并继续完成 mock 回复。
- E2E 覆盖长聊天消息窗口、Load older 和窗口外全文搜索。
- E2E 覆盖 provider 失败后切换 mock 并 Retry 成功恢复。
- 单元/E2E 覆盖 SummaryChapter 手动编辑、revision history 和回滚。
- 单元/E2E 覆盖 Arc 手动编辑、beat 状态修改和 evidence 保留。
- 单元/E2E 覆盖 SceneHint 手动编辑、媒体 cue 保留和选择项持久化。
- 单元/E2E 覆盖 Dungeon Mind/Fate 检定：属性/技能选择、难度目标、modifier、可复现 seed 和 full visibility 掷骰文本。
- E2E 覆盖 Scene Mode voice/image/video mock generation 队列、运行和完成状态。
- E2E 覆盖 moderation case rejected 后发起 appeal，并模拟 upheld 写回目标内容状态。
- E2E 覆盖 Account local sign-in、成人权限快照和 Private Sync 启用路径。
- E2E 覆盖本地 Creator Profile Preview：从 Account 进入创作者主页，展示统计快照，并能创建 creator report。
- Rust 单元测试覆盖 SQLite FTS index rebuild、中文 LIKE fallback、空 query 最近内容、`chat_messages` 分页窗口和 older-page offset；E2E 覆盖浏览器预览下 Native SQLite Index 的 Tauri runtime 提示与 Chat 侧栏 JSON fallback 分页探针。
- 单元/E2E 覆盖 Asset Inventory native/browser fallback，至少显示 declared/referenced、browser-only、missing 和 untracked 统计。
- 单元/E2E 覆盖 Asset Maintenance Plan，确认缺失资产、browser-only、placeholder 和未跟踪文件只生成 action，不直接删除或移动文件。
- 发布清单中所有手动项目有记录。
