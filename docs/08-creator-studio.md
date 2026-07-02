# 创作者工作台

## 目标

定义 Evolvria Creator Studio 的信息架构、编辑流程、数据校验、媒体管理、可见性、版本和审核策略。目标是让用户能在本地创建可玩的角色和故事线，并为后续云端发布、收益和审核留下结构。

## 范围

- MVP：本地角色、故事线、Scenario、媒体、标签、预览、导入导出。
- MVP+：版本、校验、摘要模板、Arc 模板。
- Cloud：发布、审核、创作者主页、统计、收益。

## 工作台入口

`/create` 默认展示创作仪表盘：

- 最近草稿。
- 校验失败内容。
- 本地可玩的故事线。
- 导入素材。
- 新建 Storyline、Character、Scenario 的快捷动作。
- 云端发布状态占位。

页面不做大段说明文案，使用空状态和 inline validation 引导。

## 编辑对象

### Storyline Editor

字段：

- 标题、tagline、简介、premise。
- 玩家扮演：用户进入故事时默认身份。
- 世界规则：不可违背的事实和限制。
- 开场语气：悬疑、轻松、史诗、日常等。
- 标签：题材、关系、玩法、节奏。
- 内容分级：SFW、M17、AdultLocked。
- 支持模式：Chat、Scene、Fate、Voice、Image。
- Casts：关联角色、角色定位、关系种子、出场条件。
- Scenarios：默认入口排序。
- 媒体：封面、背景、预览图。

校验：

- 标题 2 到 80 字。
- 简介 30 到 240 字。
- 至少 1 个 Scenario。
- 至少 1 个 Character 或明确“纯旁白故事”。
- 世界规则不能为空。
- 分级和标签必须匹配，如成人标签不能标 SFW。

### Character Editor

字段：

- 名称、subtitle、摘要。
- 人设 profile。
- 说话风格 voice：语气、词汇、节奏、禁用表达。
- 动机 goals、恐惧 fears、边界 boundaries。
- 关系：与 Persona、其他角色、组织。
- 媒体：头像、立绘、语音样本占位。
- 安全：内容分级、敏感点、禁止情节。

校验：

- 名称不为空且不包含平台保留词。
- profile 必须包含身份、动机、冲突。
- voice 必须至少描述一种说话特征。
- 头像必须有 alt text 和版权来源。

### Scenario Editor

字段：

- 标题、摘要。
- 开场文本。
- 地点、时间、天气、氛围。
- 初始角色。
- 触发条件。
- 初始状态 JSON。
- 推荐 Persona。

Scenario 是故事线可玩性的最小单元，必须能独立启动。

## 编辑体验

桌面布局：

- 左侧对象树：Storyline、Characters、Scenarios、Media、Validation。
- 中间编辑表单。
- 右侧预览与校验：卡片预览、prompt preview、mock run。
- MVP 已落地 Prompt Preview：Creator Studio 从当前 Storyline、首个 Scenario、默认 Persona、角色列表和安全设置生成分层 prompt，只展示结构化上下文，不展示 provider API key。

移动布局：

- 对象树折叠为顶部 select。
- 预览和校验进入 tabs。
- 长文本字段全屏编辑。

保存策略：

- 每 10 秒自动保存草稿。
- 离开页面前如果有未保存变更，提示。
- 每次从 `local_ready` 回到编辑状态，版本号加 draft suffix。

## 媒体管理

媒体库支持：

- 导入图片、音频、视频、文档引用。
- 自动生成缩略图：Tauri 桌面端把图片缩略图写入 `assets/images/variants/` 并回填 `MediaVariant`；浏览器临时素材只显示降级提示。
- 绑定用途：cover、avatar、background、sprite、voice、reference。
- alt text、版权来源、license、分级。
- 查找未引用资产并清理。

限制：

- MVP 不内置第三方素材库。
- 不允许粘贴竞品站图片 URL 并作为项目资产。
- 大文件导入前提示大小，导出时显示包体估算。

## 预览与试跑

预览类型：

- 卡片预览：内容库卡片。
- 详情预览：封面、Casts、标签、分级。
- Prompt 预览：查看最终上下文结构，但隐藏密钥。
- Mock run：创建临时 Chat，生成开场和 1 到 3 轮回复。

Mock run 的结果不自动写入正式故事，除非用户点击“保存为示例开场”。

## 版本管理

```ts
type ContentVersion = {
  version: string;
  changelog: string;
  baseVersionId?: string;
  status: "draft" | "local_ready" | "submitted" | "published" | "rejected";
};
```

规则：

- 本地草稿可以随时编辑。
- `local_ready` 表示校验通过，可导出或游玩。
- Cloud 阶段 `submitted` 后锁定发布版本，继续编辑会创建新 draft。
- 已发布版本的 breaking change 需要新版本号和 changelog。

## 审核状态

MVP 审核是本地自检：

- 字段完整性。
- 分级和标签一致性。
- 媒体来源填写。
- 明显违规关键词提示。

Cloud 阶段审核：

- 自动审核：文本、图片、标签、封面。
- 人审队列：M17/AdultLocked、举报高风险、收益内容。
- 结果：approved、rejected、needs_changes。
- `needs_changes` 会退回私有草稿修改流；创作者再次编辑后必须重新校验和提交。
- `rejected` 会阻止公开发布和收益，除非后续申诉成功或创建新版本。
- 申诉：创作者提交理由，保留审计日志。

## 可见性

| 状态 | MVP | Cloud |
| --- | --- | --- |
| `private` | 默认，仅本地可见 | 账号私有同步 |
| `unlisted` | 导出包分享 | 链接访问，不进搜索 |
| `public` | 不可用 | 审核通过后公开搜索 |

MVP 的“分享”本质是导出 zip，不是上传平台。

## 创作者统计预留

本地统计：

- 启动次数。
- 消息数。
- 最近游玩。
- 用户本地评分。
- 校验通过时间。

Cloud 统计：

- 浏览、开始、收藏、完成率。
- 模型消费、收益估算。
- 举报、下架、申诉状态。

## 关键决策

- 创作工具先服务“自己能玩”，再服务“公开发布”。
- 媒体必须有来源和 license 字段，避免未来平台化时补债。
- 每个 Storyline 至少有一个可启动 Scenario。
- Creator Studio 删除 Storyline package 时进入 Trash，不直接物理删除；Trash 中内容从 Library/Start/Search 隐藏，但保留恢复按钮。
- 发布、收益、审核作为状态预留，不在 MVP 假装已完成。

## 验收标准

- 用户能创建原创 Storyline、Character、Scenario 并进入聊天试跑。
- 草稿自动保存，校验错误可定位到具体字段。
- 导出包包含 save、manifest、assets 和 schema version。
- 不允许缺少版权来源的媒体进入 `local_ready`。
- Storyline package 可以软删除并恢复；软删除后 Library 不再展示，恢复后重新进入本地发现流程。
