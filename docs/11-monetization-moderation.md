# 商业化与审核

## 目标

定义 Evolvria 对 ISEKAI ZERO 类积分、模型成本、创作者收益、内容分级、举报和申诉机制的自有方案。MVP 只做成本可见和审核字段，云端阶段再实现真实支付和收益。

## 范围

- Mana/Arcane 类能力的替代命名和账本模型。
- 创作者收益机制预留。
- 内容分级、审核状态、举报、申诉。
- 不定义具体支付供应商、税务流程或法务条款。

## 命名策略

不使用 Mana、Arcane 等竞品命名。候选：

| 概念 | Evolvria 名称 | 用途 |
| --- | --- | --- |
| 免费/赠送积分 | `Spark` | 签到、活动、补偿、创作者测试 |
| 付费积分 | `Core Credit` | 模型调用、图片、语音、Scene 生成 |
| 成本预估 | `Cost Preview` | MVP 本地显示，不扣费 |
| 创作者收益 | `Creator Share` | Cloud 阶段按消费或净收入分成 |

MVP UI 文案使用“预计消耗”而不是“扣费”，避免误导。

## MVP 成本策略

MVP 没有真实支付：

- mock provider 免费。
- OpenAI-compatible provider 由用户自行承担第三方成本。
- 应用只显示估算 token 和估算费用。
- 用户可设置每轮上限、每日上限和上下文上限。
- 超过预算时阻止请求，用户确认后可继续。

`CreditLedgerEntry` 在 MVP 中记录 `currency: "local_estimate"`。

## Cloud 积分策略

云端阶段可实现：

- 余额：Spark、Core Credit。
- 消费：chat、summary、scene、image、voice。
- 赠送：注册、活动、补偿。
- 退款：失败请求、重复扣费。
- 冻结：风控或争议。

账本原则：

- 不可变追加。
- 每条记录有 request id、model、usage、价格快照。
- 余额由账本计算或通过可审计快照缓存。
- 创作者收益与消费记录关联。

## 创作者收益

公开来源显示 ISEKAI ZERO 有创作者收益分成机制，并以文本生成消费为收益来源之一。Evolvria 不复制其具体条款，只保留机制：

Cloud 阶段 Creator Share 可按以下数据计算：

- 内容被启动次数。
- 内容关联的 AI 消费。
- 退款和风控扣除。
- 平台费、模型成本、税费后的可分配金额。
- 创作者分成比例快照。

收益状态：

| 状态 | 说明 |
| --- | --- |
| `estimated` | 未结算估算 |
| `pending` | 结算中 |
| `available` | 可提现 |
| `withheld` | 风控或违规冻结 |
| `paid` | 已支付 |
| `reversed` | 冲正 |

MVP 不展示“可赚钱”承诺，只在文档和 schema 预留。

## 内容分级

| Rating | 说明 | 默认行为 |
| --- | --- | --- |
| `SFW` | 普通安全内容 | 可展示、可搜索 |
| `M17` | 成熟主题、暴力、复杂关系等 | 需要年龄提示和过滤 |
| `AdultLocked` | 成人内容或高风险内容 | 默认隐藏，需显式开启和云端审核 |
| `Rejected` | 违规内容 | 不可发布，不可收益 |

分级由创作者自标 + 自动检测 + 人审决定。MVP 只做自标和本地校验；Cloud 必须做人审队列。

## 零容忍方向

自有政策需要至少覆盖：

- 未成年人性化或诱导。
- 非自愿性内容和剥削。
- 现实伤害、恐怖主义、极端主义。
- 人肉、隐私泄露、骚扰。
- 版权侵权和冒充。
- 绕过平台安全机制。
- 未授权真实人物肖像、声音和身份使用。

具体政策文本需要法务审查，不能复制竞品 Guideline 原文。

## 审核流程

MVP：

1. 创作者填写分级和标签。
2. 本地校验字段完整性、媒体来源、明显冲突。
3. 内容状态为 `private/draft` 或 `private/local_ready`。
4. 导出包保留 moderation metadata。

Cloud：

1. 提交发布。
2. 自动文本/图片审核。
3. 低风险 SFW 可快速通过，高风险进入人审。
4. 人审给出 `approved`、`needs_changes` 或 `rejected`，并同步写回目标内容的 moderation/version 状态。
5. 创作者可申诉。
6. 审核结果写入 audit log。

## 举报与申诉

举报入口：

- 故事线详情。
- 角色详情。
- 聊天消息。
- 媒体资源。
- 创作者主页。

举报字段：

- 原因分类。
- 补充说明。
- 证据 message ids 或 asset ids。
- 是否涉及未成年人或现实伤害。

申诉：

- 创作者可对 rejected、下架、收益冻结申诉。
- 申诉必须有时限、状态和处理记录。
- 审核员操作必须可审计。

MVP Cloud Preview 已落地本地申诉演练：`ModerationCase.appeal` 记录理由、`open/upheld/denied` 状态、处理时间和备注；Account 页面可对被处置 case 发起申诉，并模拟 upheld/denied 决策。该功能不代表真实云端人审，只用于验证数据模型和 UX。

## 反作弊与收益风控

Cloud 阶段需要：

- 自刷启动和消息消费检测。
- 机器人流量过滤。
- 退款和拒付处理。
- 违规内容收益冻结。
- 多账号关联风险。
- 创作者 payout KYC/税务预留。

MVP 不实现，但数据模型要能记录 `withheld` 和 `reversed`。

## 关键决策

- MVP 不做真实支付、充值、提现，只做成本估算。
- 不使用竞品积分名和收益文案。
- 内容分级字段从 MVP 开始强制存在。
- 云端公开发布前必须有审核和举报闭环。

## 验收标准

- UI 中没有 Mana/Arcane 等竞品命名。
- 每次 AI 请求都能写入成本估算或 mock usage。
- Storyline、Character、Media 都有 moderation metadata。
- 云端阶段商业化前，账本、退款、冻结、申诉都有数据结构支撑；MVP 已覆盖本地账本调整和 moderation appeal 预览。
