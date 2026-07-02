# 功能映射

## 目标

把 ISEKAI ZERO 的公开产品能力拆成 Evolvria 的自有实现项，明确哪些进入 MVP、哪些进入 Beta 或云端阶段，以及哪些必须避开侵权或过度相似风险。

## 范围

- 覆盖首页、探索、详情、启动、聊天、视觉小说、Dungeon Mind、Creator Centre、积分、收益、审核。
- 只映射功能，不映射对方视觉资产、内容库、接口或商业条款原文。
- 阶段定义与 [产品需求](01-product-requirements.md) 和 [路线图](15-roadmap.md) 保持一致。

## 映射总表

| ISEKAI ZERO 公开能力 | Evolvria 自有实现 | 阶段 | 差异化要求 |
| --- | --- | --- | --- |
| 首页内容推荐 | `Home` 工作台：继续游玩、精选本地故事、最近草稿、模型状态 | MVP | 不做营销 hero；首屏直接可操作 |
| Explore | `Library`：故事线/角色统一浏览、搜索、筛选、排序 | MVP | 本地数据优先，云端搜索后置 |
| Storyline hero/detail | `StorylineDetail`：封面、简介、Casts、标签、模式、分级、成本提示 | MVP | 用原创封面和原创故事，不复制热门内容 |
| Character card | `CharacterProfile`：人设、声音、关系、禁忌、媒体资产 | MVP | 字段服务本地 AI 叙事，而非社交展示优先 |
| Start persona | `StartStory`：快速 Persona、名称、代词、叙事偏好、安全边界 | MVP | 支持匿名本地身份 |
| Chat | `ChatSession`：消息流、继续、重试、回滚、搜索、设置 | MVP | 强化存档、摘要和调试可见性 |
| Model choice | `AIProviderSettings`：mock、OpenAI-compatible、未来 cloud-proxy | MVP | 用户自配 key 时不走平台计费 |
| Mana/Arcane | `CreditLedger` 预留：成本估算、预算、后续积分 | MVP/Cloud | 不使用竞品命名；MVP 不收费 |
| Summaries / Arc | `SummaryChapter` + `Arc`：记忆压缩、阶段目标、关系变化 | MVP+ | 作为长程叙事质量核心 |
| Visual Novel | `SceneMode`：背景、立绘、字幕、旁白、音效队列 | Beta | 先静态图层，后语音/图片生成 |
| Dungeon Mind | `FateEngine`：规则、属性、骰点、后果、可解释日志 | Beta | 独立规则层，可测试可复现 |
| Creator Centre | `CreatorStudio`：角色、故事线、媒体、标签、版本、预览 | MVP+ | 本地草稿优先，云发布后置 |
| Creator earnings | `CreatorPayout` 预留：收益比例、账本、提现状态 | Cloud | 需法务、税务、反作弊 |
| Content rating | `ModerationStatus`：SFW、M17、AdultLocked、Rejected、Appeal | MVP/Cloud | 默认安全，成人内容锁定 |
| Report/appeal | `ModerationCase`：举报、申诉、处置、审计 | Cloud | 平台化后必须先于公开发布 |
| Mobile apps | Tauri mobile 预留 | Beta/Release | 桌面 MVP，不承诺首版商店发布 |

## 页面级映射

### 首页

竞品首页强调内容消费入口和移动下载。Evolvria 首页应更像桌面创作/游玩工作台：

- 左侧常驻导航：Home、Library、Create、Saves、Settings。
- 主区域：继续游玩、今日推荐、本地故事线、最近角色草稿。
- 右侧状态：AI provider、预算、存档健康、内容分级过滤。
- 空状态：引导创建第一个故事或导入示例包。

### 探索与内容库

竞品探索页面向大规模 UGC。Evolvria MVP 没有云端内容量，因此重点是“本地内容管理 + 可扩展到云端”：

- 统一搜索 `Storyline`、`Character`、`Scenario`。
- 筛选：模式、标签、分级、语言、最近更新、是否可 VN、是否可 Fate Engine。
- 排序：最近游玩、最近创建、标题、热度占位、完成度。
- 卡片显示：封面、标题、短简介、Casts 数、标签、分级、更新时间。

### 详情与启动

详情页要把“这个故事是否值得开始”说清楚：

- 顶部媒体：封面或视频预览，右侧标题、摘要、创作者、分级。
- Casts：主要角色、头像、关系、出场条件。
- 模式标记：Chat、Scene Mode、Fate Engine、Voice Ready。
- 启动 CTA：选择 Persona、选择初始 Scenario、确认安全边界。
- 技术提示：推荐模型、上下文长度、预估每轮成本。

### 聊天

聊天是 MVP 的核心体验，不只是普通消息列表：

- 消息分层：玩家动作、玩家对白、角色对白、旁白、系统裁定、摘要。
- 控制：继续、重试上轮、回滚到 checkpoint、搜索消息、导出片段。
- 上下文：当前 Arc、活跃角色、关系状态、地点、任务、预算。
- 失败处理：模型错误、内容过滤、超时、JSON 解析失败都有可恢复路径。

### 创作者工作台

竞品 Creator Centre 是平台化入口。Evolvria 的 MVP 先把创作流程本地化：

- Storyline editor：标题、简介、开场、世界规则、标签、分级。
- Character editor：人设、语气、目标、记忆、关系、禁忌、头像。
- Scenario editor：初始地点、参与角色、触发条件、开场提示。
- Preview：用 mock provider 试跑开场。
- Publish 状态：`draft`、`local_ready`、`submitted`、`published`、`rejected` 预留。

## 数据级映射

| 竞品概念 | Evolvria 模型 | MVP 字段重点 |
| --- | --- | --- |
| Character | `Character` | profile、voice、goals、boundaries、mediaIds |
| Storyline | `Storyline` | title、summary、premise、tags、rating、castIds、scenarioIds |
| Cast | `StoryCast` | characterId、role、relationshipSeed、visibility |
| Chat | `Chat` | storylineId、personaId、scenarioId、activeArcId、provider |
| Message | `Message` | role、content、speakerId、sceneHints、tokenEstimate、safetyFlags |
| Memory | `SummaryChapter` | window、facts、relationships、openThreads |
| Arc | `Arc` | theme、goal、stakes、status、beats |
| Credits | `CreditLedger` | estimate、providerCost、futureBalance |
| Moderation | `ModerationStatus` | rating、status、reasons、appeal |

## 不复刻清单

- 不复刻 ISEKAI ZERO、Mana、Arcane 等品牌名或图标。
- 不复刻对方角色、故事标题、封面、视频、宣传图和用户内容。
- 不复刻对方网页布局到像素级，不使用对方 CSS、截图或字体素材。
- 不调用对方内容 API，不抓取 sitemap 中的角色/故事线作为种子数据。
- 不复制 Terms、Guideline、收益说明的具体措辞；只根据功能需要建立自有政策。

## 关键决策

- 功能优先级按“可玩闭环 > 创作闭环 > 长程质量 > 平台化商业”排序。
- 所有竞品能力都必须映射到自有命名和自有数据模型。
- MVP 的积分只做成本估算和账本结构，不做真实充值。
- 审核字段从 MVP 开始存在，避免云端阶段大改 schema。

## 验收标准

- 每个主要竞品能力都有 Evolvria 对应实现或明确暂不做原因。
- MVP 范围不依赖云端账号、支付或公开 UGC。
- 映射表没有引用对方私有接口或内容资产。
- 工程任务可以按本文拆成路由、组件、store、command 和测试用例。
