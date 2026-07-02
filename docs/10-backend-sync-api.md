# 后端同步 API

## 目标

定义 Evolvria 从本地优先 MVP 到可选云端平台的 API 边界。MVP 不依赖后端，但前端 service、数据模型和 Tauri commands 要为账号、同步、UGC、搜索、审核、积分和收益预留扩展点。

## 范围

- 本地 repository API。
- Tauri commands 与前端 service 边界。
- Cloud 阶段 REST/JSON API 草案。
- 同步、搜索、UGC 发布、AI 网关、积分账本。
- 不实现具体云厂商选型。

## 本地优先原则

MVP 数据流：

```text
Vue components
  -> Pinia stores
  -> repositories
  -> Tauri commands
  -> app-data/workspaces
```

原则：

- 无账号可用。
- 无网络可用。
- 无 API key 可用 mock。
- 用户数据默认不上传。
- 导入导出是 MVP 的分享方式。

前端组件不得直接调用 Tauri command 或 HTTP API，必须经过 repository。这样本地和云端可以共享接口。

Saves 页面已经通过 repository 完成备份闭环：Tauri 端使用 `workspace_backup`、`workspace_list_backups`、`workspace_restore_backup` 管理 `backups/` 目录；浏览器预览使用 `localStorage` fallback。恢复前必须尽量创建 `pre_restore` 备份，避免导入或误操作造成不可逆覆盖。

## Repository 接口

```ts
interface WorkspaceRepository {
  list(): Promise<WorkspaceMeta[]>;
  create(input: CreateWorkspaceInput): Promise<WorkspaceMeta>;
  read(id: string): Promise<SaveEnvelope>;
  write(id: string, envelope: SaveEnvelope): Promise<WorkspaceMeta>;
  backup(id: string, reason: BackupReason): Promise<BackupMeta>;
  listBackups(id: string): Promise<BackupMeta[]>;
  restoreBackup(id: string, backupId: string): Promise<SaveEnvelope>;
  exportZip(id: string): Promise<ExportResult>;
  importZip(path: string): Promise<WorkspaceMeta>;
}

interface ContentRepository {
  search(envelope: SaveEnvelope, query?: ContentSearchQuery): ContentSearchResult;
  getStoryline(envelope: SaveEnvelope, id: string): Storyline | undefined;
  saveStoryline(envelope: SaveEnvelope, storyline: Storyline): Storyline;
  saveCharacter(envelope: SaveEnvelope, character: Character): Character;
  saveScenario(envelope: SaveEnvelope, scenario: Scenario): Scenario;
}

interface SyncRepository {
  status(envelope: SaveEnvelope): SyncStatusSnapshot;
  updateSettings(envelope: SaveEnvelope, input: SyncSettingsInput): SyncStatusSnapshot;
  queueOperation(envelope: SaveEnvelope, input: SyncQueueInput): SyncOperation;
  push(envelope: SaveEnvelope): SyncPushResult;
  createStorylineConflict(envelope: SaveEnvelope, storylineId: string): SyncConflictResult;
  resolveConflict(envelope: SaveEnvelope, conflictId: string, resolution: ConflictResolution): SyncResolveResult;
}
```

MVP 已落地 `src/services/repositories/sync.ts` 的 `LocalSyncRepository`：它不访问网络，但集中负责同步状态、operation queue、模拟 push acknowledgement、确定性字段冲突和冲突解决。Pinia store 只调用 repository 并持久化 workspace，不再直接硬编码同步队列和冲突状态。Cloud 阶段替换同一接口实现，保留 UI 和 store 调用面。

本地实现结果：

| 方法 | MVP 行为 | Cloud 替换点 |
| --- | --- | --- |
| `status` | 从 `SaveEnvelope` 计算 pending operation 和 open conflict | 拉取服务端会话、quota、设备状态 |
| `updateSettings` | 更新本地 endpoint/enabled/status | 验证 endpoint 与账号权限 |
| `queueOperation` | 写入本地 operation log | 继续本地排队，等待网络 push |
| `push` | 将 queued/pushed 标记为 `acked` | 调用 `POST /sync/push` 并处理服务端 ack/conflict |
| `createStorylineConflict` | 生成可测试的 title 字段冲突 | 被真实 pull/push conflict 替代 |
| `resolveConflict` | 支持 keep local/use cloud/make copy | 调用服务端 conflict resolution 并返回新版本 |

`src/services/repositories/content.ts` 已落地 `LocalContentRepository`。Library 页面通过 store 调用 repository 查询，不再在组件里直接构建索引。MVP repository 以 `SaveEnvelope` 为输入，返回统一的 `ContentSearchResult`：`items`、`total`、`page`、`pageSize`、`facets` 和 `source`。Cloud 阶段可以在同一接口后面接 `/content/search`，并把本地草稿和云端公开内容合并或分区展示。

本地内容实现结果：

| 方法 | MVP 行为 | Cloud 替换点 |
| --- | --- | --- |
| `search` | 从本地 entities 构建统一 LibraryItem，支持 query、kind、rating、mode、language、tag、sort、page/pageSize | 调用云端搜索并保留本地草稿 overlay |
| `getStoryline` | 从本地 workspace 读取故事线 | 根据 visibility/serverId 读取本地或云端详情 |
| `saveStoryline` | 写入本地 storylines map | 写入本地草稿并排队同步 operation |
| `saveCharacter` | 写入本地 characters map | 写入本地草稿并排队同步 operation |
| `saveScenario` | 写入本地 scenarios map | 写入本地草稿并排队同步 operation |

## Cloud API 概览

Cloud 阶段 API 前缀：`/api/v1`。

| 领域 | Endpoint | 说明 |
| --- | --- | --- |
| Auth | `POST /auth/session` | 登录/刷新会话 |
| Account | `GET /me` | 用户资料、年龄门槛、权限 |
| Workspaces | `GET /sync/workspaces` | 可同步 workspace |
| Sync | `POST /sync/pull` / `POST /sync/push` | 增量同步 |
| Content | `GET /content/search` | 公开内容搜索 |
| Storylines | `POST /storylines` | 创建/发布故事线 |
| Characters | `POST /characters` | 创建/发布角色 |
| Media | `POST /media/upload-url` | 上传签名 URL |
| Moderation | `POST /moderation/submit` | 提交审核 |
| Reports | `POST /reports` | 举报 |
| AI | `POST /ai/narrative` | 云端 AI 网关 |
| Credits | `GET /credits/balance` | 积分余额 |
| Ledger | `GET /credits/ledger` | 消费账本 |
| Creator | `GET /creator/earnings` | 创作者收益 |

MVP Account Preview 已落地本地 `CloudAccountSession`：用户可在 Account 页输入 display name、email 与年龄门槛，得到本地权限快照；这不是云端 token，不上传任何私密数据。启用 Private Sync 前需要本地 session，Cloud 阶段替换为 `POST /auth/session` 和 `GET /me`。

## 同步模型

增量同步使用 operation log：

```ts
type SyncOperation = {
  id: string;
  workspaceId: string;
  entityType: keyof EntityStore;
  entityId: string;
  op: "create" | "update" | "delete";
  patch: unknown;
  baseVersion?: string;
  clientId: string;
  createdAt: string;
};
```

冲突策略：

| 场景 | 默认处理 |
| --- | --- |
| 不同实体 | 自动合并 |
| 同一实体不同字段 | 字段级合并 |
| 同一字段冲突 | 保留两份，用户选择 |
| 删除与更新冲突 | 创建恢复副本 |
| 媒体缺失 | 标记 broken asset，允许重新上传 |

MVP 已采用本地 repository 和 operation log 预留同步语义：Storyline package 软删除会写入 `deletedAt`，并排队一个 `delete` 类型 sync operation；恢复会清空 `deletedAt` 并排队 `update`。云端阶段遇到“删除与更新冲突”时仍按上表创建恢复副本，不静默覆盖。

## 搜索 API

```http
GET /api/v1/content/search?q=academy&kind=storyline&rating=SFW&mode=chat&page=1
```

响应：

```ts
type ContentSearchResult = {
  items: ContentCardDTO[];
  facets: SearchFacet[];
  page: number;
  pageSize: number;
  total: number;
};
```

搜索字段：

- 标题、简介、角色名、标签、创作者。
- 筛选：kind、rating、mode、language、updatedAt、creatorId。
- 排序：relevance、trending、new、updated、starts。

## UGC 发布 API

发布流程：

1. 本地校验通过。
2. 上传媒体，得到 asset ids。
3. 提交 Storyline/Character DTO。
4. 服务端创建 `submitted` 版本。
5. 自动审核。
6. 人审或直接通过。
7. 公开搜索可见。

发布 DTO 不包含用户私有 Persona、私有聊天和本地 notes。

## AI 网关 API

```http
POST /api/v1/ai/narrative
```

请求：

```ts
type CloudNarrativeRequest = {
  chatId: string;
  modelPreference: string;
  storyline: StorylineContextDTO;
  persona: PersonaContextDTO;
  messages: MessageContextDTO[];
  summaries: SummaryDTO[];
  arc?: ArcDTO;
  fateResult?: FateResultDTO;
  safety: SafetyContextDTO;
  budget: BudgetLimitDTO;
};
```

响应：

```ts
type CloudNarrativeResponse = {
  response: NarrativeResponse;
  usage: UsageActual;
  ledgerEntry: CreditLedgerEntry;
  safety: ModerationSignal[];
};
```

服务端职责：

- 模型路由。
- 密钥保护。
- token 统计。
- 内容安全。
- 限流。
- 成本入账。

## 积分与账本 API

MVP 使用本地估算。Cloud 阶段：

- `GET /credits/balance`：可用余额、赠送余额、付费余额。
- `GET /credits/ledger`：消费、赠送、退款、收益分成。
- `POST /credits/estimate`：发送前预估。
- `POST /billing/checkout`：购买。
- `POST /creator/payout/request`：提现申请。

账本必须不可变，只能追加冲正记录。

## 审核与举报 API

```ts
type ModerationCaseDTO = {
  id: string;
  targetType: "storyline" | "character" | "media" | "chat" | "creator";
  targetId: string;
  reporterId?: string;
  reason: string;
  status: "open" | "reviewing" | "actioned" | "dismissed" | "appealed";
  appeal?: {
    id: string;
    reason: string;
    status: "open" | "upheld" | "denied";
    createdAt: string;
    resolvedAt?: string;
    resolutionNote?: string;
  };
  audit: AuditEntry[];
};
```

公开发布前必须有审核状态；被举报内容可进入降权、隐藏或下架。MVP Cloud Preview 已提供本地 `appealModerationCase` 和 `resolveModerationCaseAppeal` store action，用同一 DTO 形状演练申诉、维持目标状态和审计备注；云端阶段替换为 `/moderation/appeals` API。

## 安全与隐私

- API 使用 HTTPS。
- Access token 短期，refresh token 安全存储。
- 不上传本地私有聊天，除非用户启用同步。
- AI 网关日志默认脱敏。
- 删除账号需要处理公开内容、收益账本和法务保留期。

## 关键决策

- MVP 不需要后端，repository 抽象先行。
- Cloud API 以同步、UGC、AI 网关和账本为核心，不为本地功能增加硬依赖。
- 公开发布不包含 Persona 和私有聊天。
- 同步采用增量 operation log，避免整包覆盖。
- 软删除状态必须参与搜索过滤、包校验和同步冲突策略。

## 验收标准

- MVP repository 可以用 Tauri、本地浏览器 fallback 两种实现。
- 前端组件不直接依赖 HTTP 或 Tauri command。
- Cloud API 草案覆盖账号、同步、搜索、发布、审核、AI、积分和收益。
- 同步冲突有可解释策略，不能静默覆盖用户数据。
