# 聊天、视觉小说与 Dungeon Mind

## 目标

定义 Evolvria 的三层互动体验：MVP 聊天、Beta Scene Mode 视觉小说、Beta Fate Engine（对应 Dungeon Mind 类能力）。三者共享同一故事状态，但 UI、输入方式和生成契约不同。

## 范围

- Chat：消息、输入模式、继续、重试、回滚、搜索、保存。
- Scene Mode：背景、角色、字幕、选择、语音/图片生成预留。
- Fate Engine：骰点、属性、难度、后果、可解释裁定。

## Chat 模式

Chat 是 MVP 第一核心体验。页面布局：

- 左侧或右侧 context panel：故事、角色、Arc、摘要、成本、分级。
- 主区域：消息流。
- 底部：输入框、模式切换、发送、继续、附件/设置。
- 顶部：返回详情、保存状态、provider、预算、搜索。

消息类型：

| 类型 | role | 用途 |
| --- | --- | --- |
| 玩家对白 | `user` + `say` | 角色内发言 |
| 玩家动作 | `user` + `act` | 描述行动 |
| 玩家请求 | `user` + `ask` | 要求模型解释或推进 |
| OOC | `user` + `ooc` | 修改偏好、询问系统 |
| 角色回复 | `assistant` | 角色对白和行动 |
| 旁白 | `narrator` | 场景、心理、过渡 |
| 裁定 | `fate` | Fate Engine 结果 |
| 系统 | `system` | 安全、错误、摘要 |

## Chat 控制

| 控制 | 行为 | 数据影响 |
| --- | --- | --- |
| Send | 发送用户消息并请求 AI | 创建 checkpoint、Message、Cost entry |
| Continue | 无新用户输入，让 AI 继续 | 创建 assistant request |
| Retry | 对上一条 AI 回复重试 | 新建分支，不覆盖旧消息 |
| Rollback | 回到某个 checkpoint | 归档后续消息或创建分支 |
| Bookmark | 标记重要消息 | 写入 message metadata |
| Summarize | 生成章节摘要 | 创建 SummaryChapter |
| Search | 搜索当前聊天 | 不改数据 |
| Export excerpt | 导出片段 | 生成本地 markdown/json |

所有破坏性操作都需要可撤销路径。`Clear chat` 不应永久删除，先归档或创建备份。
MVP 已落地 Bookmark：消息上可切换书签，`Message.bookmarkedAt` 记录本地标记时间，聊天侧栏显示最近书签并可用作快速定位/搜索入口。

## 输入体验

输入框支持：

- mode segmented control：Say、Act、Ask、OOC。
- 多行文本，移动端自动扩大到 40% 高度以内。
- 快捷建议：继续、观察、询问角色、检查物品。
- 安全提示：成人锁、预算超限、provider 未配置。
- 发送前预估：输入 token、上下文 token、预计成本。

用户输入不能因 provider 失败而丢失；失败后显示“重试”“切换 mock”“编辑输入”。
MVP 已落地失败恢复：provider failure 会显示错误横幅，Retry 在 `error` 状态仍可用，用户可一键切换 mock 后重试，成功后 Chat 回到 `active`。

## Scene Mode 视觉小说

Scene Mode 是 Chat 的另一种渲染，不是独立存档。它读取相同 `Chat`、`Message`、`SceneHint`。

### SceneHint

```ts
type SceneHint = {
  backgroundAssetId?: string;
  characterSprites?: SceneSprite[];
  camera?: "wide" | "medium" | "close";
  mood?: string;
  musicAssetId?: string;
  voice?: VoiceCue[];
  choices?: SceneChoice[];
};
```

### Scene UI

- 背景层：16:9 或 cover crop。
- 角色层：最多 3 个 active sprite。
- 字幕层：角色名、文本、继续按钮。
- 选择层：多选项，固定高度，避免遮挡字幕。
- 历史层：可展开查看最近消息。
- 设置层：自动播放、文字速度、语音、跳过已读。
- 编辑层：可编辑当前消息首个 `SceneHint` 的 mood、camera 和最多 3 个选择项，并写回同一条 `Message`。

MVP Scene Mode 先实现可读可验收的渲染层：读取 `sceneHints`、显示字幕/历史/选择、支持文字速度与自动播放，并在 Tauri 运行时通过受限 native command 读取 workspace 内 `assets/` 的背景图、角色 sprite 和语音引用。浏览器或 `browser://` 临时素材必须清晰降级，提示创作者使用桌面导入器重新导入。
MVP 已落地 SceneHint 手动编辑：Scene Mode 中的 `Edit Scene` 面板只修改当前消息的首个 `SceneHint`，保留背景、sprite 和 voice cue，不新建孤立存档；保存后选择按钮立即刷新，选择项仍通过 Chat 的 `sendMessage` 进入同一消息流。

## 语音、图片与视频生成预留

语音：

- `VoiceCue` 记录 speaker、text、voiceModel、assetId、status。
- MVP 不调用 TTS，只允许创作者导入 voice reference。
- Glosc One 语音模型固定路由为 `alibaba/qwen3-tts-instruct-flash`，提示词由 `evolvria-voice-generation` skill 约束。
- 已导入到 workspace assets 的音频引用可在 Scene Mode 中播放预览；浏览器临时引用只显示 license/source 与不可预览提示。
- MVP 已提供本地 `MediaGenerationJob` 队列：Scene Mode 可把当前消息排入 voice mock generation，运行后创建 generated `MediaAsset`、写入 `CreditLedgerEntry`，并把 voice cue 标记为 `generated`。
- Beta 可接入本地或云端 TTS，必须显示成本。

图片：

- `ImageGenerationRequest` 记录 prompt、style、safety、cost、assetId。
- Glosc One 图片模型固定路由为 `openai/gpt-image-2`，提示词由 `evolvria-image-generation` skill 约束。
- MVP 已接入 AI SDK `generateImage` + OpenAI-compatible `imageModel()`：当用户保存了 Glosc One API key 时，image job 会调用 `openai/gpt-image-2`，Tauri 端通过 `media_write_generated_image` 把结果写入 `assets/images/`，并创建 generated background `MediaAsset` 回填当前消息首个 `SceneHint.backgroundAssetId`。
- 无 API key、浏览器预览或非图片任务继续降级为 mock generation；浏览器生成资产会标记为 `browser://generated/...`，发布前必须用桌面端重新生成或导入。
- 生成结果必须经过媒体审核字段。
- 不允许把竞品封面作为参考图。

视频：

- `MediaGenerationJob.kind = video` 已预留到 Scene Mode 队列。
- Glosc One 视频模型固定路由为 `bytedance/doubao-seedance-2-0`，提示词由 `evolvria-video-generation` skill 约束。
- MVP 运行 mock video generation：创建 `video/mock-placeholder` 资产、写入成本账本和故事媒体列表；真实视频文件写入留到 Tauri 媒体持久化增强阶段。

## Fate Engine / Dungeon Mind

Fate Engine 负责可解释裁定：

```ts
type FateCheck = {
  id: string;
  chatId: string;
  actorId: string;
  intent: string;
  attribute: string;
  skill?: string;
  difficulty: number;
  roll: RollResult;
  modifiers: Modifier[];
  outcome: "critical_success" | "success" | "partial" | "failure" | "critical_failure";
  consequences: Consequence[];
  visibility: "hidden" | "summary" | "full";
};
```

流程：

1. 检测用户动作是否有不确定性和代价。
2. 读取 `DungeonMindConfig`。
3. 选择或计算属性、技能、难度、状态和环境 modifier。
4. 掷骰或使用 deterministic seed。
5. 输出 FateResult。
6. 写入 `fate` message。
7. 把 FateResult 传给叙事 AI 润色。

规则：叙事 AI 可以描述结果，但不能推翻 FateResult。

当前已落地 Chat 侧 Dungeon Mind 控制：顶部 `Fate` 按钮保留快速检定，侧栏 `Dungeon Mind Check` 表单可手动输入检定意图、选择属性/技能、选择难度 band 或直接修改目标值、填写 modifier，并可输入可复现 seed。`Run Check` 只写入 `fate` message；`Check + Continue` 先写入 FateResult，再调用叙事生成，让 AI 依据最近 FateResult 润色下一幕但不能改判定。`fateCheckToText` 会把属性/技能名称、可见性、骰点或摘要和后果写入消息流，后续上下文层 `fate_results` 会把最近检定作为强约束传给模型。

## Fate 可见性

| 模式 | 用户看到 | 用途 |
| --- | --- | --- |
| hidden | 只看到叙事结果 | 沉浸式小说 |
| summary | 看到成功/失败和主要代价 | 默认 |
| full | 看到骰点、难度、modifier | TRPG 用户 |

用户可以在 Storyline 或 Chat 设置中切换，但创作者可锁定最低可见性。

## 状态一致性

Chat、Scene 和 Fate 共享：

- `Chat.messageIds`
- `SummaryChapter`
- `Arc`
- `RelationshipDelta`
- `WorldState`
- `CreditLedgerEntry`

任何模式写入事实，都必须通过 domain reducer。Scene Mode 不能只在 UI 层改变状态。
MVP 中 `RelationshipDelta` 会随生成消息保存并在 Chat context panel 展示最近变化；后续可再汇总进可编辑关系图谱。

## 边界与安全

- AdultLocked 内容默认不可进入 Scene Mode 自动图像/语音生成。
- 语音生成不得模仿真实人物或未授权声音。
- 图片生成必须记录 prompt、模型、来源和分级。
- Fate Engine 不应用来鼓励现实伤害行为。

## 关键决策

- MVP 先把 Chat 做稳，Scene 和 Fate 作为数据结构与 UI 占位。
- Retry 创建分支，不覆盖历史。
- FateResult 是事实来源，AI 只负责叙事表达。
- Scene Mode 是聊天渲染层，不另建孤立存档。

## 验收标准

- Chat 能完成发送、继续、重试、回滚、摘要、保存。
- SceneHint 字段能从消息保存和读取。
- Fate Engine 的同一 seed 输出可复现。
- 视觉小说、语音、图片功能缺失时有清晰占位，不出现空白或崩溃。
