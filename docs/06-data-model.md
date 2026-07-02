# 数据模型

## 目标

定义 Evolvria 本地优先 MVP 的核心数据结构、关系、索引、迁移和示例数据原则。模型必须支持故事线发现、角色卡、Persona、聊天、摘要、Arc、Dungeon Mind/Fate Engine、媒体资产、积分账本和审核状态。

## 范围

- TypeScript 领域模型和 JSON workspace schema。
- MVP JSON 存储与 Beta SQLite 迁移路线。
- 本地优先 ID、关系、索引、示例数据。
- 不定义云端鉴权和完整支付表，云端接口见 [后端同步 API](10-backend-sync-api.md)。

## Schema 版本

```ts
type SaveEnvelope = {
  schemaVersion: "1.0.0";
  workspace: Workspace;
  entities: EntityStore;
  indexes: SearchIndexSnapshot;
  settings: WorkspaceSettings;
  audit: AuditEntry[];
};
```

规则：

- `schemaVersion` 使用 semver。
- patch 版本只允许兼容字段新增。
- minor 版本允许可自动迁移。
- major 版本必须要求用户确认并创建备份。

## ID 与时间

- ID 使用带前缀的 ULID/UUID：`story_`、`char_`、`chat_`、`msg_`。
- 所有时间使用 ISO 8601 UTC 字符串。
- 实体包含 `createdAt`、`updatedAt`、`deletedAt?`，删除优先软删除。
- 本地内容库、搜索索引和启动流程默认过滤 `deletedAt` 实体；Creator Studio 的 Trash 视图可恢复 Storyline package，并级联恢复其 Character、Scenario 与 MediaAsset。
- 云同步阶段增加 `serverId?`、`syncVersion?`、`lastSyncedAt?`。

## Workspace 设置

```ts
type BackupMeta = {
  id: string;
  workspaceId: string;
  reason: string;
  createdAt: string;
  path?: string;
  sizeBytes?: number;
  hasSqliteIndex?: boolean;
  sqlitePath?: string;
  sqliteSizeBytes?: number;
};

type AccountAgeGate = "unknown" | "adult" | "minor";
type AccountPermission = "sync" | "publish" | "billing" | "adult_content";

type CloudAccountSession = {
  id: string;
  displayName: string;
  email?: string;
  ageGate: AccountAgeGate;
  permissions: AccountPermission[];
  status: "local_preview" | "connected" | "expired";
  createdAt: string;
  updatedAt: string;
};

type BudgetSettings = {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxEstimatedCostPerTurn: number;
};

type SyncSettings = {
  enabled: boolean;
  endpoint?: string;
  lastSyncAt?: string;
  status: "local_only" | "ready" | "syncing" | "conflict" | "error";
  conflictCount: number;
};

type WorkspaceSettings = {
  activeWorkspaceId: string;
  adultContentUnlocked: boolean;
  cloudAccount?: CloudAccountSession;
  provider: AIProviderSettings;
  budget: BudgetSettings;
  sync: SyncSettings;
};
```

MVP 在发送前用 `BudgetSettings` 做本地预估和拦截；它不是实际扣费系统，真实余额和结算留到 Cloud 阶段。
`BackupMeta` 不写入 `SaveEnvelope`，而是由 repository 从 Tauri `backups/` 目录或浏览器 fallback 动态读取；恢复备份前必须创建 `pre_restore` 备份。桌面端 `hasSqliteIndex/sqlitePath/sqliteSizeBytes` 表示该备份是否包含 `search.sqlite3` mirror，浏览器 fallback 恒为 false。
`CloudAccountSession` 是 Account 页面的本地预览 session，不代表真实登录 token，不包含密码或 OAuth credential；启用私有同步前需要本地 session，`minor` 年龄门槛会移除 publish/billing/adult_content 权限并强制关闭 AdultLocked 解锁。
`SyncSettings` 只表达本地同步意图和状态，不代表已连接云端。Phase 6 本地预览的 `SyncDeviceSnapshot` 只包含设备状态、实体计数和 pending/conflict 计数；`.evolvria-sync.json` operation log 可用于离线演练导入/导出，但不是公开内容包。

## 核心实体

```ts
type EntityStore = {
  characters: Record<string, Character>;
  storylines: Record<string, Storyline>;
  scenarios: Record<string, Scenario>;
  mediaAssets: Record<string, MediaAsset>;
  personas: Record<string, Persona>;
  chats: Record<string, Chat>;
  chatCheckpoints: Record<string, ChatCheckpoint>;
  messages: Record<string, Message>;
  summaryChapters: Record<string, SummaryChapter>;
  arcs: Record<string, Arc>;
  dungeonMindConfigs: Record<string, DungeonMindConfig>;
  fateChecks: Record<string, FateCheck>;
  creditLedger: Record<string, CreditLedgerEntry>;
  creditAdjustments: Record<string, CreditAdjustment>;
  moderationCases: Record<string, ModerationCase>;
  creatorEarnings: Record<string, CreatorEarning>;
  creatorPayoutRequests: Record<string, CreatorPayoutRequest>;
  engagementStats: Record<string, EngagementStats>;
  mediaGenerationJobs: Record<string, MediaGenerationJob>;
  syncOperations: Record<string, SyncOperation>;
  syncConflicts: Record<string, SyncConflict>;
};
```

### Character

```ts
type Character = {
  id: string;
  type: "character";
  name: string;
  subtitle?: string;
  summary: string;
  profile: string;
  voice: CharacterVoice;
  goals: string[];
  fears?: string[];
  boundaries: string[];
  tags: string[];
  mediaIds: string[];
  defaultScenarioIds: string[];
  moderation: ModerationStatus;
  visibility: Visibility;
  createdBy: CreatorRef;
  createdAt: string;
  updatedAt: string;
};
```

`voice` 包含语气、口头禅、禁用表达、语言偏好。`boundaries` 是模型必须遵守的内容边界，不用于替代平台审核。

### Storyline

```ts
type Storyline = {
  id: string;
  type: "storyline";
  title: string;
  tagline: string;
  summary: string;
  premise: string;
  playerRole: string;
  worldRules: string[];
  tags: string[];
  language: string;
  rating: ContentRating;
  cast: StoryCast[];
  scenarioIds: string[];
  mediaIds: string[];
  supportedModes: PlayMode[];
  dungeonMindConfigId?: string;
  moderation: ModerationStatus;
  visibility: Visibility;
  version: ContentVersion;
  createdBy: CreatorRef;
  createdAt: string;
  updatedAt: string;
};
```

`premise` 给玩家看，`worldRules` 给模型和 Fate Engine 用。`supportedModes` 可为 `chat`、`scene`、`fate`、`voice`、`image`、`video`。

### Scenario

```ts
type Scenario = {
  id: string;
  storylineId: string;
  title: string;
  summary: string;
  opening: string;
  location?: string;
  participatingCharacterIds: string[];
  trigger: ScenarioTrigger;
  initialState: Record<string, unknown>;
  order: number;
  createdAt: string;
  updatedAt: string;
};
```

Scenario 是进入故事的具体入口，例如“王都夜宴”“边境失联”“学院入学日”。

### MediaAsset

```ts
type MediaAsset = {
  id: string;
  kind: "image" | "audio" | "video" | "document";
  purpose: "cover" | "avatar" | "background" | "sprite" | "voice" | "reference";
  relativePath: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  sizeBytes: number;
  variants: MediaVariant[];
  altText: string;
  source: AssetSource;
  license: AssetLicense;
  safety: ModerationStatus;
  createdAt: string;
};
```

所有媒体通过 `relativePath` 引用，前端使用 asset protocol，不保存绝对路径。
桌面端资产盘点不新增持久化模型，而是由 `workspace_asset_inventory` 从 `MediaAsset.relativePath`、`MediaVariant.relativePath`、引用集合和物理 `assets/` 文件即时计算：`present/missing/browser_only/placeholder/invalid_path` 状态、未引用资产、未跟踪文件和目录体积分布。`AssetMaintenancePlan` 同样是派生视图，只生成非破坏性 action：restore/reimport/replace/review/import-or-remove/compress，不写回 workspace。

### Persona

```ts
type Persona = {
  id: string;
  name: string;
  pronouns?: string;
  description: string;
  preferences: NarrativePreference[];
  boundaries: string[];
  privateNotes?: string;
  createdAt: string;
  updatedAt: string;
};
```

Persona 是玩家身份，不等同于账号。MVP 默认本地私有，不上传。

### Chat 与 Message

```ts
type Chat = {
  id: string;
  storylineId: string;
  scenarioId: string;
  personaId: string;
  title: string;
  status: "active" | "archived" | "error";
  provider: AIProviderRef;
  activeArcId?: string;
  messageIds: string[];
  checkpointIds: string[];
  createdAt: string;
  updatedAt: string;
};

type ChatCheckpoint = {
  id: string;
  chatId: string;
  label: string;
  messageIndex: number;
  messageId?: string;
  createdAt: string;
};

type Message = {
  id: string;
  chatId: string;
  role: "system" | "user" | "assistant" | "narrator" | "fate" | "tool";
  speakerId?: string;
  content: string;
  mode?: "say" | "act" | "ask" | "ooc";
  promptContractVersion?: string;
  sceneHints?: SceneHint[];
  tokenEstimate?: number;
  costEstimate?: CostEstimate;
  safetyFlags: SafetyFlag[];
  parentMessageId?: string;
  retryOfMessageId?: string;
  createdAt: string;
};
```

`checkpointIds` 引用 `ChatCheckpoint`。Checkpoint 记录回滚位置，而不是复制完整消息内容；回滚时当前分支裁剪 `messageIds`，后续消息实体保留用于审计或未来分支恢复。`Message` 支持分支和重试：重试不覆盖旧消息，而是通过 `retryOfMessageId` 关联。AI 生成消息写入 `promptContractVersion`，用于调试、回放和未来 contract migration。JSON MVP 阶段仍保留完整 `messageIds` 顺序，Chat UI 通过 `createMessageWindow` 默认只渲染最近 80 条并按需加载更早消息；搜索必须扫描完整聊天。SQLite Beta 已把该窗口策略下沉到 Tauri command：`chat_messages` 表按 `chat_id/message_index` 建索引，`workspace_query_sqlite_messages` 可读取最近页或基于 `offsetFromEnd` 读取更早页；Chat 主消息流优先使用 offset 0 的分页页数据，浏览器使用同形状 fallback。

### SummaryChapter 与 Arc

```ts
type SummaryChapter = {
  id: string;
  chatId: string;
  range: { fromMessageId: string; toMessageId: string };
  title: string;
  summary: string;
  facts: string[];
  relationshipDeltas: RelationshipDelta[];
  unresolvedThreads: string[];
  createdAt: string;
};

type Arc = {
  id: string;
  chatId: string;
  title: string;
  theme: string;
  goal: string;
  stakes: string;
  beats: ArcBeat[];
  status: "planned" | "active" | "resolved" | "abandoned";
  createdAt: string;
  updatedAt: string;
};
```

摘要是长上下文压缩的事实来源；Arc 是叙事阶段，不应被模型随意改写。

### DungeonMindConfig

```ts
type DungeonMindConfig = {
  id: string;
  storylineId: string;
  enabled: boolean;
  dice: "d20" | "2d6" | "percentile" | "custom";
  attributes: AttributeDefinition[];
  skills: SkillDefinition[];
  difficultyTable: DifficultyBand[];
  consequenceRules: ConsequenceRule[];
  visibility: "hidden" | "summary" | "full";
};
```

当前已落地 Chat 侧 Fate Engine 技术预览：`DungeonMindConfig` 由 Creator Studio 编辑，`FateCheck` 由 Chat 侧 Dungeon Mind 表单或快速 `Fate` 按钮生成；同一 seed、骰子、难度和 modifier 会复现同一掷骰结果，生成的 `fate` message 与 `fateChecks` 会进入叙事上下文。

### MediaGenerationJob

```ts
type MediaGenerationJob = {
  id: string;
  kind: "voice" | "image" | "video";
  storylineId: string;
  chatId?: string;
  messageId?: string;
  speakerId?: string;
  prompt: string;
  style?: string;
  voiceText?: string;
  provider: string;
  model: string;
  status: "queued" | "running" | "completed" | "failed" | "blocked";
  safetyFlags: SafetyFlag[];
  assetId?: string;
  ledgerEntryId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};
```

`MediaGenerationJob` 是 Scene Mode 语音/图片/视频生成的本地任务队列。MVP 已让图片任务在存在用户 API key 时走 AI SDK `generateImage` + Glosc One `openai/gpt-image-2`，Tauri 端写入真实 `MediaAsset` 文件；无 key、浏览器预览、语音和视频任务继续降级为 mock 占位资产。生成资产写入 `MediaAsset`，成本写入 `CreditLedgerEntry`；语音和图片会回填同一条 `Message.sceneHints`，视频先挂入故事媒体列表，避免 UI 层孤立状态。Glosc One 模型路由为 image `openai/gpt-image-2`、video `bytedance/doubao-seedance-2-0`、voice `alibaba/qwen3-tts-instruct-flash`。

### CreditLedger 与 EngagementStats

```ts
type CreditLedgerEntry = {
  id: string;
  chatId?: string;
  provider: string;
  model: string;
  operation: "chat" | "summary" | "scene" | "image" | "voice" | "video";
  estimatedTokens: number;
  estimatedCost: number;
  actualCost?: number;
  currency: "local_estimate" | "credit";
  createdAt: string;
};

type EngagementStats = {
  entityId: string;
  starts: number;
  messages: number;
  lastPlayedAt?: string;
  localRating?: number;
  cloud?: {
    views: number;
    likes: number;
    favorites: number;
  };
};
```

MVP 使用本地估算，不做真实扣费。
本地互动统计由 `recordEngagementStats` 维护：启动故事时增加 Storyline、Scenario 和 Cast Character 的 `starts` 与 `lastPlayedAt`，成功生成聊天回复时增加对应实体的 `messages`，Library 的 `played` 和 `heat` 排序直接读取该快照。云端 `views/likes/favorites` 后续再合并到同一结构。

### CreatorEarning 与 CreatorPayoutRequest

```ts
type CreatorEarning = {
  id: string;
  creatorId: string;
  sourceEntityId: string;
  status: "estimated" | "pending" | "available" | "withheld" | "paid" | "reversed";
  amount: number;
  currency: "credit";
  note: string;
  createdAt: string;
};

type CreatorPayoutRequest = {
  id: string;
  creatorId: string;
  earningIds: string[];
  amount: number;
  currency: "credit";
  status: "requested" | "approved" | "paid" | "rejected" | "blocked";
  riskFlags: string[];
  note: string;
  requestedAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
};
```

MVP Account Preview 已落地 payout 本地演练：只有 `available` 且金额大于 0 的收益可被加入 payout request；创建 request 后关联收益转为 `pending`；`paid` 会把收益标为已支付，`rejected` 会退回 `available`，`blocked` 会把收益转为 `withheld` 并记录风控标记。该流程不处理真实付款、KYC、税务或银行信息。

`SummaryChapter` 支持 `updatedAt` 和 `revisionHistory`。用户在 Chat 侧栏编辑摘要时，旧版本写入 revision；回滚时恢复旧摘要、事实、关系变化和未解线索，并把当前版本也保存为新的 revision，保证长程记忆可人工修正且可撤销。

## 审核与可见性

```ts
type ContentRating = "SFW" | "M17" | "AdultLocked";
type ModerationState =
  | "draft"
  | "local_ready"
  | "submitted"
  | "approved"
  | "published"
  | "needs_changes"
  | "rejected"
  | "appealed";
type Visibility = "private" | "unlisted" | "public";

type ModerationStatus = {
  rating: ContentRating;
  state: ModerationState;
  reasons: string[];
  safetyFlags: SafetyFlag[];
  reviewedAt?: string;
  reviewerId?: string;
};

type ModerationAppeal = {
  id: string;
  reason: string;
  status: "open" | "upheld" | "denied";
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
};

type ModerationCase = {
  id: string;
  targetType: "storyline" | "character" | "media" | "chat" | "creator";
  targetId: string;
  reason: string;
  status: "open" | "reviewing" | "actioned" | "dismissed" | "appealed";
  appeal?: ModerationAppeal;
  createdAt: string;
  updatedAt: string;
};
```

MVP 不做云端人审，但所有内容必须有 rating 和 state。默认创建内容为 `private/draft/SFW`。本地发布模拟会把提交内容置为 `submitted`；审核通过后可进入 `approved/published`，要求修改时进入 `needs_changes`，拒绝时进入 `rejected`。本地 Cloud Preview 已支持 `ModerationCase.appeal`：被处置的 case 可进入 `appealed`，申诉有理由、状态、处理时间和处理备注；申诉成功会把目标重新置为公开就绪占位，申诉失败保持拒绝。

## 索引

JSON MVP 维护轻量索引：

- `storylineByUpdatedAt`
- `storylineByTag`
- `characterByStoryline`
- `chatByStoryline`
- `messageByChat`
- `mediaByPurpose`
- `draftsWithErrors`

SQLite Beta 增加：

- FTS：标题、摘要、角色名、标签。（已完成 Tauri 技术预览：`search.sqlite3` 的 `search_items` 和 `search_items_fts` 镜像 Storyline、Character、Scenario、MediaAsset、Message，支持桌面端重建与搜索）
- 消息分页：`chat_messages(chat_id, message_id, message_index, created_at, role, mode, content, payload)`，按 `(chat_id, message_index)` 建索引，返回完整 Message payload。
- 关系索引：Storyline-Cast、Chat-Message、Arc-Beat。
- 同步索引：`serverId`、`syncVersion`、`updatedAt`。

## 迁移

迁移函数：

```ts
type Migration = {
  from: string;
  to: string;
  description: string;
  run(input: SaveEnvelope): SaveEnvelope;
};
```

迁移规则：

- 迁移前创建备份。
- 迁移必须幂等或可检测已执行。
- 迁移失败不得覆盖原存档。
- 大版本迁移需要 UI 确认。

## 示例数据原则

- 使用原创世界，如“星烬边境”“雾港契约”“苍白学院”，不改写竞品故事。
- 示例角色不使用受版权保护的动漫、游戏、小说人物。
- 每个示例故事至少包含 3 个角色、2 个 Scenario、1 张原创封面占位、1 个可玩开场。
- 示例数据要覆盖 SFW、M17 锁定提示、Fate 预留、Scene 预留。

## 关键决策

- MVP 使用 JSON workspace，因为可调试、可导出、迁移成本低。
- 数据模型从第一版预留审核、成本、摘要和 Fate Engine，避免后续大改。
- 资产与结构化数据分离，便于备份、压缩和未来 CDN。
- 重试和分支不覆盖历史，确保叙事可追溯。
- 删除采用软删除和恢复优先，避免创作者误删导致内容包或同步冲突不可恢复。

## 验收标准

- 所有核心模型可序列化为 `SaveEnvelope` 并通过 schema 校验。
- 创建故事、启动聊天、发送消息、摘要、导出导入不需要云端字段。
- 示例数据原创且不引用竞品素材。
- 迁移和索引策略能支持 JSON MVP 到 SQLite Beta。
