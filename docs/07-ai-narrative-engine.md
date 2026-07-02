# AI 叙事引擎

## 目标

定义 Evolvria 的 AI 叙事系统：provider 选择、prompt 分层、上下文组装、记忆摘要、Arc 管理、内容安全、成本估算和失败降级。目标是让聊天稳定可玩，而不是把所有逻辑交给模型即兴发挥。

## 范围

- MVP：mock provider、OpenAI-compatible provider、聊天生成、摘要预留、成本估算、错误恢复。
- Beta：Arc 自动维护、Fate Engine 结果注入、Scene Mode 输出。
- Cloud：统一 AI 网关、模型路由、计费、内容安全和限流。

## Provider 策略

| Provider | 阶段 | 用途 | 要求 |
| --- | --- | --- | --- |
| `mock` | MVP | 无 key 演示、自动化测试、离线可玩 | deterministic、可快照测试 |
| `openai-compatible` | MVP | 用户自配模型 | 支持 base URL、API key、model、temperature、max tokens |
| `local-http` | Beta | 本机模型服务 | 同 OpenAI-compatible，增加超时提示 |
| `cloud-proxy` | Cloud | 平台代理 | 服务端密钥、计费、审核、限流 |

mock provider 不能只是“Lorem ipsum”。它应根据 Storyline、Character、Persona 和最近消息生成结构化、可预测、像故事的回复，方便无网络验收。

MVP provider 运行边界已落地：

- `openai-compatible` 只有在 Keychain/本地 secret 中存在 API key 时才调用远端，否则回退 mock，避免无意请求失败。
- `local-http` 允许无 API key 调用本机 OpenAI-compatible 服务，只接受 `localhost`、`127.0.0.1`、`::1` 或 `.localhost` 主机。
- provider 请求默认 45 秒超时，Abort 后映射为 `provider_timeout`，聊天层保留用户输入并提示可重试或切换 mock。
- base URL 只允许 HTTP/HTTPS，非法协议映射为 `provider_invalid_base_url`。
- provider 请求失败会把 Chat 标记为 `error` 但保留输入和上下文；Chat UI 允许直接 Retry，也提供 `Switch to mock` 快捷动作，Retry 成功后恢复为 `active`。

## Prompt 分层

```text
System Policy
  -> Product Safety Contract
  -> Storyline World Rules
  -> Character Voice Blocks
  -> Persona Block
  -> Current Scenario
  -> Summary Chapters
  -> Active Arc
  -> Recent Messages
  -> Fate Result / Tool Results
  -> User Input
  -> Output Contract
```

MVP 已落地 `src/services/ai/context.ts`：

- `buildNarrativePromptBundle(request)` 生成可测试的分层上下文，每层包含 `name`、`title`、`content`、`priority` 和 `locked`，并返回稳定的 `contractVersion`。
- `buildOpenAIChatMessages(request)` 把分层上下文转换成 OpenAI-compatible chat messages，并在 system message 顶部写入 `Prompt-Contract-Version`。
- `redactPromptPreviewContent(content)` 用于 Creator Studio 预览，隐藏 `sk-*` 和 Bearer token 形态的密钥，确保 prompt 可审计但不泄露 provider secret。
- Store 在调用 provider 时传入 `summaryChapters`、`activeArc`、`fateChecks` 和 `adultContentUnlocked`，让模型上下文不只依赖最近消息。
- `openai-compatible` provider 优先要求 JSON 输出，并在 JSON 无效时降级包装为普通 assistant message。
- `mergeNarrativeResponse` 会把 provider 返回的 `relationshipDeltas` 和 prompt contract version 写入消息 metadata；Chat 侧栏显示最近 contract version，方便调试和回放。

### System Policy

定义模型角色：叙事主持、角色扮演、保持世界一致、尊重内容分级。不写竞品名称，不引用竞品 prompt。

### Product Safety Contract

从 `ModerationStatus`、用户设置和平台规则生成：

- 禁止内容。
- 成人内容锁定状态。
- 未成年人保护。
- 用户边界。
- 模型失败时的拒绝方式。

### Storyline World Rules

只放必要规则，避免把全部设定塞进上下文：

- 世界基本规律。
- 玩家身份。
- 关键地点。
- 不可违背的事实。
- 当前 Scenario 开场。

### Character Voice Blocks

活跃角色最多 3 到 5 个，包含：

- 说话风格。
- 目标和动机。
- 与 Persona 的关系。
- 禁用行为或禁用语气。

### Memory 与 Arc

长期信息优先使用 `SummaryChapter` 和 `Arc`，最近 20 到 40 条消息保留原文。超过上下文预算时按重要度裁剪：

1. 安全规则不可裁剪。
2. 当前 Scenario 和世界硬规则不可裁剪。
3. 活跃角色 voice 不可完全裁剪。
4. 最近用户输入和最近回复不可裁剪。
5. 旧消息可由 Summary 替代。

## 输出契约

AI response 统一解析为：

```ts
type NarrativeResponse = {
  promptContractVersion?: string;
  messages: GeneratedMessage[];
  events?: NarrativeEvent[];
  relationshipDeltas?: RelationshipDelta[];
  sceneHints?: SceneHint[];
  summaryCandidate?: string;
  safetyFlags?: SafetyFlag[];
  usage?: UsageEstimate;
};
```

如果模型不支持 JSON，fallback 允许纯文本，但 reducer 必须包装为 `GeneratedMessage`。结构化 JSON 失败时：

1. 尝试修复一次。
2. 失败后用纯文本降级。
3. 标记 `invalid_json`，给用户可重试按钮。

## 聊天生成流程

1. 用户提交 `MessageDraft`。
2. 创建 checkpoint，写入用户消息草稿。
3. 运行安全预检查和预算检查。
4. 组装 `NarrativeRequest`。
5. 调用 provider。
6. 解析 `NarrativeResponse`。
7. domain reducer 写入 AI 消息、事件、关系变化、成本记录。
8. 判断是否需要摘要。
9. autosave。

用户可见状态：

- `thinking`：请求中。
- `streaming`：流式输出。
- `needs_retry`：失败可重试。
- `filtered`：内容安全拦截。
- `saved`：保存完成。

## 摘要策略

MVP 已落地自动摘要判定：

- `src/domain/summary.ts` 提供 `shouldCreateAutoSummary` 和 `messagesSinceLastSummary`。
- 手动 Summary 和自动 Summary 共用 `createSummaryChapter`，摘要写入 `SummaryChapter`，并记录本地 summary ledger。
- 自动摘要只处理上次摘要之后的新消息，避免重复压缩同一段对话。
- Store 在 AI 响应合并、Arc 推进和 retry 后调用 `maybeCreateAutoSummary`。
- `editSummaryChapter` 和 `revertSummaryChapter` 支持 Chat 侧栏手动修正摘要、事实和未解线索，并保留最多 12 条 revision history 作为回滚点。
- 当发送前只有 input context 超出预算、但输出和成本仍在上限内时，Chat 不直接阻断；Store 会把旧消息压缩成 `SummaryChapter`，仅携带最近消息向 provider 重试，并在侧栏显示本次上下文压缩提示。

触发条件：

- 每 20 条消息。
- 估算上下文超过预算 70%。
- Arc 状态变化。
- 用户手动点击“生成章节摘要”。

摘要输出必须包含：

- 章节标题。
- 已发生事实。
- 关系变化。
- 未解决线索。
- 玩家承诺或重要选择。
- 安全相关边界变化。

摘要不是文学润色，而是事实压缩；不能新增未发生事实。

## Arc 管理

Arc 是故事阶段，帮助 AI 保持目标：

```ts
type ArcBeat = {
  id: string;
  title: string;
  status: "open" | "done" | "skipped";
  evidenceMessageIds: string[];
};
```

Arc 更新来源：

- 创作者预设。
- AI response 的 `events`。
- 用户手动编辑。
- Fate Engine 结果。

规则：AI 可以建议 Arc 变化，但最终由 reducer 和用户确认写入，避免模型随意改变主线。
MVP 已落地手动 Arc 编辑：Chat 侧栏可修改当前 `Arc` 的 title、theme、goal、stakes、status 和 beat 标题/状态，并通过 `editArc` 写回同一 `Arc` 实体；已有 `evidenceMessageIds` 会保留，新建 beat 生成本地 ID，保证长程目标可以被玩家人工校正。

## Fate Engine 接入

Beta 中，Fate Engine 先于叙事模型：

1. 判断用户动作是否需要裁定。
2. 读取属性、技能、难度和状态。
3. 生成 `FateResult`：成功等级、代价、事实变化、可见性。
4. 把结果放入 prompt，让叙事模型只负责表达。

FateResult 是事实来源，叙事模型不得推翻骰点结果。

## 成本估算

MVP 本地估算：

- 输入 token 估算。
- 输出 token 上限。
- provider/model 单价占位。
- 本轮预计成本。
- 本聊天累计估算。

Cloud 阶段：

- 服务端返回真实 usage。
- 写入 `CreditLedgerEntry`。
- 支持预算上限和余额不足拦截。

## 失败降级

| 错误 | 用户提示 | 恢复 |
| --- | --- | --- |
| `auth` | API key 无效 | 打开设置，保留输入 |
| `network` | 网络不可用 | 重试或切 mock |
| `rate_limit` | 触发限流 | 延迟重试 |
| `timeout` | 模型超时 | 缩短上下文或切模型 |
| `content_filter` | 内容被拦截 | 修改输入或调整分级 |
| `invalid_json` | 响应格式异常 | 纯文本降级或重试 |
| `context_overflow` | 上下文过长 | 生成摘要、压缩旧消息后重试；如果用户输入本身超限才阻止 |

失败时不能丢失用户输入，也不能写入半截 AI 消息作为正式事实。

## 内容安全

安全分三层：

- 输入前检查：分级、用户边界、明显违规。
- 输出后检查：模型返回安全 flag、关键词、成人锁。
- 云端阶段人审和举报：公开内容、封面、角色、故事线。

MVP 默认成人内容锁定；即使本地使用，也要给用户清晰设置和提示。

## 关键决策

- AI 不是数据库；事实必须落到 Message、Summary、Arc、FateResult。
- mock provider 是一等能力，用于离线和测试。
- 结构化输出优先，纯文本可降级。
- 摘要和 Arc 是长程体验核心，不是装饰功能。

## 验收标准

- 无 API key 时可完成至少 10 轮 mock 聊天。
- provider 失败后用户输入不丢失，并可重试或切换 mock。
- 摘要不会新增未发生事实，摘要结果可在 UI 查看。
- 成本估算在发送前可见，超过预算时可阻止请求。
