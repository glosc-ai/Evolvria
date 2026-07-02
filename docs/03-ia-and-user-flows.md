# 信息架构与用户流

## 目标

定义 Evolvria 的导航结构、页面职责和核心用户流，确保玩家能快速进入故事，创作者能安全创建内容，工程团队能按路由和状态边界实现。

## 范围

- 覆盖桌面优先布局和移动响应式退化。
- 覆盖首页、内容库、故事详情、启动、聊天、创作、存档、设置、账户预留。
- 不定义具体视觉 token，视觉规则见 [视觉设计系统](04-visual-design-system.md)。

## 顶层导航

桌面端使用左侧 rail + 顶部上下文栏：

| 路由 | 名称 | 目的 |
| --- | --- | --- |
| `/` | Home | 继续游玩、精选内容、模型与存档状态 |
| `/library` | Library | 浏览本地故事线、角色、Scenario |
| `/storylines/:id` | Story Detail | 查看故事详情和启动入口 |
| `/start/:storylineId` | Start | 选择 Persona、Scenario、模型和安全边界 |
| `/chat/:chatId` | Chat | 核心互动叙事 |
| `/create` | Creator Studio | 创建/编辑故事线、角色、Scenario、媒体 |
| `/saves` | Saves | 存档、备份、导入导出、恢复 |
| `/settings` | Settings | AI provider、主题、数据目录、安全过滤 |
| `/account` | Account | 云端阶段账号、同步、积分、收益 |

移动端把左侧 rail 折叠为底部导航：Home、Library、Chat、Create、Settings。详情页和聊天页使用全屏沉浸布局，次级面板通过 sheet 打开。

## 首页信息架构

首页不是营销页，而是启动台：

1. `Continue`：最近一个聊天、上次保存时间、所在 Arc、继续按钮。
2. `Featured Local Stories`：3 到 6 个原创示例或用户置顶故事。
3. `Recent Drafts`：最近编辑的角色/故事线，显示校验状态。
4. `Provider Status`：当前 provider、模型、预算、key 状态、mock 提醒。
5. `Health`：存档目录、最近备份、待处理错误、导入入口。

空状态：

- 没有内容：显示“导入示例包”和“创建故事线”两个动作。
- 没有 provider：仍可使用 mock；OpenAI-compatible 配置放入设置。
- 存档损坏：提供从备份恢复，不覆盖原文件。

## 内容库信息架构

`Library` 是探索和管理合一页面：

- 顶部搜索：标题、简介、角色名、标签、创作者。
- segmented control：All、Storylines、Characters、Scenarios、Media。
- 筛选器：分级、模式、语言、标签、更新状态、创建者、是否有存档。
- 排序：最近游玩、最近更新、标题、完成度、热度占位。
- 视图：媒体网格、紧凑列表、创作者审核列表。

卡片必须显示：

- 封面或头像、标题、两行摘要、标签、分级、支持模式。
- Storyline：Casts 数、Scenario 数、最近聊天。
- Character：所属故事、语气、可见性。
- Draft：校验错误数量和发布准备状态。

## 故事详情结构

详情页分四个区：

1. 媒体头部：原创封面、标题、短简介、分级、语言、模式徽标。
2. 决策信息：Premise、玩家扮演、推荐 Persona、预计强度、成本估算。
3. Casts：角色头像、名字、角色定位、关系种子、首次出现地点。
4. Tabs：Overview、Characters、Scenarios、Creator Notes、Safety、Changelog。

固定动作：

- `Start`：进入启动流程。
- `Resume`：如果已有聊天，直接继续。
- `Duplicate`：复制为本地可编辑版本。
- `Edit`：仅作者或本地草稿可见。

## 核心用户流

### 首次游玩

1. 用户打开应用。
2. Home 检测没有 workspace，创建默认本地 workspace。
3. 用户选择原创示例故事。
4. 进入详情页，查看角色和分级。
5. 点击 Start，创建 Persona 或选择默认 Persona。
6. 选择 mock provider 或已配置模型。
7. 创建 Chat，进入聊天页。
8. 第一条系统开场和角色欢迎消息生成并自动保存。

验收点：无账号、无网络、无 API key 也能完成。

### 常规聊天

1. 用户在输入框选择模式：对白、动作、旁白请求、OOC 设置。
2. 发送后创建 `Message` 和 `Checkpoint`。
3. AI service 组装上下文：Storyline、Persona、最近消息、Summary、Arc、Safety。
4. provider 返回回复；domain reducer 写入消息、事件和关系变化。
5. 自动保存；如果失败，保留待重试状态。
6. 用户可继续、重试、回滚或生成摘要。

验收点：失败不丢用户输入，重试不污染历史。

### 创建故事线

1. 用户进入 Creator Studio。
2. 新建 Storyline：标题、摘要、玩家身份、世界规则、标签、分级。
3. 新建或选择 Character，设置人设、语气、目标、禁忌和媒体。
4. 新建 Scenario，写入开场地点、初始角色和开场 prompt。
5. 运行 Preview，使用 mock provider 试跑。
6. 校验通过后标记 `local_ready`。
7. 可导出为 `.evolvria.zip` 或进入详情页游玩。

验收点：草稿可保存，校验错误可定位到字段。

### 导入导出

导出：

1. Saves 页面选择 workspace。
2. 创建备份。
3. 打包 `save.json`、assets、manifest、schema version。
4. 用户选择保存路径。

导入：

1. 用户选择 zip。
2. Rust command 解压到临时目录并校验路径穿越。
3. 校验 schema、资产引用和重复 ID。
4. 如有冲突，选择新建副本或覆盖。
5. 写入 workspace 并创建导入日志。

验收点：恶意 zip 不能写出应用数据目录。

## 账户与云同步预留

MVP 不要求登录。Account 页面可为空状态：

- 云同步未启用。
- 本地数据不会自动上传。
- 后续可登录后同步私有 workspace、发布公开故事、查看积分和收益。

云端阶段新增流程：

- 注册/登录。
- 选择本地 workspace 上传。
- 查看设备同步快照：状态、pending operation、open conflict、实体计数，不展示私密正文。
- 导出/导入本地 operation log，用于模拟两台设备交换同步增量；导入必须校验 workspace id，不能静默覆盖。
- 处理冲突：本地优先、云端优先、创建副本、字段级合并。
- 关闭同步：状态回到 `local_only`，本地 workspace、operation log、冲突记录和备份仍留在设备上。
- 发布审核：草稿 -> 提交 -> 队列 -> 通过/拒绝/申诉。
- 公开发现：审核通过后内容进入 Library 的 Public Catalog；详情页举报后进入 Account Moderation Queue，要求修改或拒绝会从 Public Catalog 隐藏。

## 关键决策

- 首页、内容库和聊天页是产品主轴，避免落地页式空转。
- 所有可破坏数据的操作都经过确认、备份或可撤销机制。
- 移动端不删功能，只调整面板呈现。
- 账户、云同步、积分和收益在 IA 中占位，但不阻塞 MVP。

## 验收标准

- 从 Home 到首轮聊天不超过 5 个用户动作。
- 所有路由都有明确职责、空状态和错误状态。
- 创建、游玩、保存、导入导出形成闭环。
- 移动端关键流程可在 390px 宽度下完成且文本不重叠。
