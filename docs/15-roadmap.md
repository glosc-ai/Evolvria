# 路线图

## 目标

把 Evolvria 从文档推进到可运行的 Tauri 2 跨平台 AI 叙事应用。路线图按“本地可玩 MVP、增强 Beta、云端平台、商业化发布”分阶段交付。

## 范围

- 产品、设计、工程、测试和发布任务。
- 每阶段交付物、退出标准和风险。
- 不承诺具体日历日期，按里程碑完成度推进。

## Phase 0：工程恢复与基线

目标：恢复或重建可开发工程骨架。

交付：

- `package.json`、Vite、Vue 3、TypeScript、Pinia、Router。
- Tailwind/shadcn-vue/reka-ui/lucide 基础。
- `src-tauri` Tauri 2 配置、Rust command skeleton。
- Vitest、Playwright、cargo test 基线。
- 原创示例数据种子。

退出标准：

- `yarn dev` 可启动前端。
- `yarn test` 有至少 domain smoke。
- `cd src-tauri && cargo test` 通过 skeleton 测试。
- 页面无竞品品牌和素材。

## Phase 1：本地可玩 MVP

目标：无账号、无网络、无 API key 也能完成故事聊天闭环。

交付：

- Home、Library、Storyline Detail、Start、Chat、Saves、Settings。
- JSON workspace 读写、自动保存、备份。（已完成备份创建、列表、恢复和 `pre_restore` 安全备份）
- mock provider。
- OpenAI-compatible provider 配置。
- Persona 创建。
- 消息发送、继续、重试、回滚。
- 成本估算。
- 内容分级字段和默认过滤。
- 导出/导入 zip。

退出标准：

- 首次启动 3 分钟内完成第一轮 mock 聊天。
- 退出重进后聊天恢复。
- 导出再导入内容完整。
- Playwright smoke 通过。

## Phase 2：Creator Studio MVP+

目标：用户能创建自己的本地故事并试跑。

交付：

- Storyline editor。
- Character editor。
- Scenario editor。
- Media import 和 thumbnail。
- 表单校验和 draft autosave。
- Mock preview。
- `local_ready` 状态。
- 内容包导出。

退出标准：

- 从零创建 Storyline + Character + Scenario 并进入 Chat。
- 缺少关键字段时校验能定位。
- 媒体来源和 license 必填。
- 创作流 E2E 通过。

## Phase 3：长程叙事质量

目标：让 100 轮以上聊天保持一致。

交付：

- SummaryChapter 自动/手动生成。
- Arc 管理和 UI。（已完成 Chat 侧栏手动编辑 title/theme/goal/stakes/status/beat）
- 关系变化记录。
- 上下文预算裁剪。（已完成 input context 超限时摘要旧消息并携带最近消息重试）
- prompt contract version。（已完成分层 prompt、OpenAI-compatible system message、消息 metadata 和 UI 展示）
- provider 错误恢复增强。

退出标准：

- 100 轮 mock/真实 provider 测试不丢主线事实。
- 摘要可编辑、可回滚。
- 上下文超限时可生成摘要后继续。

## Phase 4：Scene Mode 与 Fate Engine Beta

目标：实现视觉小说和规则裁定增强模式。

交付：

- Scene Mode 渲染：背景、角色、字幕、选择。（已完成 MVP 渲染与媒体降级）
- SceneHint 生成和编辑。（已完成手动编辑 mood、camera、前三个选择项；自动生成继续推进）
- Voice/Image mock generation 队列。（已完成本地排队、mock 运行、资产/账本/SceneHint 回填）
- Fate Engine：属性、技能、难度、骰点、后果。
- Fate 可见性设置。
- Scene/Fate 与 Chat 同存档。

退出标准：

- 同一 Chat 可在 Chat 和 Scene Mode 间切换。
- SceneHint 编辑保存后写回同一 `Message`，返回 Chat 后选择产生的用户消息仍可追溯。
- Fate 同一 seed 可复现。
- Scene 缺失媒体时不崩溃。
- 移动视口可用。

## Phase 5：SQLite 与大型内容库

目标：支撑更大本地库和长聊天。

交付：

- JSON -> SQLite 迁移。
- FTS 搜索。
- 消息分页。（已完成 JSON MVP 的 Chat UI 消息窗口：默认最近 80 条、按需加载更早消息、搜索扫描完整聊天；SQLite Beta 仍需后端分页 query）
- 大资产管理。
- 数据库备份和恢复。（已完成 JSON/Tauri workspace 备份列表与恢复；SQLite 数据库备份仍留到 Beta）

退出标准：

- 10k 消息打开不卡顿。
- 2k 实体搜索快速。
- 迁移失败可回滚。

## Phase 6：云同步技术预览

目标：账号和私有同步，不公开 UGC。

交付：

- Auth。（已完成本地 Account Preview：display name/email/age gate/permissions，无真实云端 token）
- 私有 workspace 同步。
- operation log。
- 冲突解决 UI。
- 云端 AI proxy 可选。

退出标准：

- 两台设备同步同一 workspace。
- 冲突不静默覆盖。
- 用户可关闭同步并保留本地数据。

## Phase 7：UGC 平台

目标：公开发布、搜索和审核。

交付：

- Storyline/Character 发布。
- 媒体上传。
- 搜索和推荐基础。
- 创作者主页。
- 举报和审核后台。
- 内容分级锁。
- 申诉状态流。（已完成本地 Cloud Preview：actioned case 可发起 appeal 并模拟 upheld/denied）

退出标准：

- 内容提交到审核再公开搜索。
- 举报可处理并审计。
- 下架和申诉流程可用。

## Phase 8：商业化与创作者收益

目标：积分、计费、账本和收益。

交付：

- Spark/Core Credit。
- AI 网关真实计费。
- 账本、余额、退款。
- Creator Share 计算。
- Payout 申请和风控冻结。
- 支付、退款、创作者条款。

退出标准：

- 每次付费 AI 请求可追溯到 usage 和 ledger。
- 退款和冲正不破坏账本。
- 收益估算、冻结、支付状态清晰。
- 法务和财务审核通过。

## 横向任务

- 可访问性：键盘、focus、ARIA、对比度。
- 国际化：中文优先，英文可扩展。
- 安全：capability 审查、zip 安全、密钥存储。
- 性能：长聊天、媒体库、Scene Mode。
- 文档：每阶段同步更新 `docs/`。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 范围过大 | 严格按阶段，MVP 不做云端和商业化 |
| AI 成本高 | mock 优先、预算上限、上下文摘要 |
| 版权风险 | 原创示例、媒体来源字段、发布审核 |
| 存档损坏 | 原子写入、checkpoint、备份、迁移回滚 |
| 移动复杂度 | 桌面 MVP，移动 Beta 验证 |

## 关键决策

- Phase 1 完成前不做支付、收益和公开 UGC。
- Phase 2 完成前不开放创作者发布。
- Phase 3 是产品质量关键，优先于炫酷媒体生成。
- 云端阶段必须先有审核和举报，再有公开推荐。

## 验收标准

- 每个阶段都有可运行交付物和退出标准。
- MVP 路线能在无云端情况下完整闭环。
- Beta 和 Cloud 阶段不要求重写核心数据模型。
- 路线图与测试策略、架构、数据模型一致。
