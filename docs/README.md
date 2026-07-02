# Evolvria 项目文档索引

Last reviewed: 2026-07-02 (Asia/Shanghai)

Evolvria 是一个自有品牌的跨平台 AI 叙事与角色互动应用。本文档集把 ISEKAI ZERO 的公开产品体验拆解为可执行的产品、设计、工程和运营规格：故事线发现、角色卡、启动身份、AI 聊天、视觉小说、Dungeon Mind 裁定、创作者工作台、积分消耗、创作者收益、内容分级和审核。复刻边界是“功能体验等效”，不是品牌、素材、代码、接口或内容复制。

## 目标

提供一套可直接指导开发的中文文档索引，串联竞品研究、产品需求、设计系统、Tauri 2 架构、数据模型、AI 叙事、创作者工具、审核商业化、发布测试和路线图。

## 范围

本文只负责文档导航、复刻边界、来源和维护规则；具体规格分散在后续 16 篇文档中。所有实现默认使用 Evolvria 自有品牌、自有素材和本地优先架构。

## 阅读顺序

1. [公开来源研究](00-source-research.md)：公开来源、页面观察、功能矩阵、合法边界。
2. [产品需求](01-product-requirements.md)：定位、用户、MVP、非目标、成功指标。
3. [功能映射](02-feature-parity-map.md)：竞品能力到 Evolvria 自有实现的映射。
4. [信息架构与用户流](03-ia-and-user-flows.md)：导航、首页、探索、详情、启动、聊天、创作、账户流程。
5. [视觉设计系统](04-visual-design-system.md)：色彩、字体、卡片、标签、媒体、图标、布局、动效。
6. [Tauri 2 技术架构](05-tauri-2-architecture.md)：前端、Rust、存储、权限、插件、平台边界。
7. [数据模型](06-data-model.md)：本地 schema、实体关系、索引、迁移、示例数据。
8. [AI 叙事引擎](07-ai-narrative-engine.md)：模型、prompt 分层、记忆、摘要、Arc、失败降级。
9. [创作者工作台](08-creator-studio.md)：角色、故事线、媒体、标签、可见性、版本、审核。
10. [聊天、视觉小说与 Dungeon Mind](09-chat-vn-dungeon-mind.md)：聊天控制、VN、语音/图片生成、DM 骰点与规则。
11. [后端同步 API](10-backend-sync-api.md)：本地优先 API、可选云账号、搜索、UGC、同步接口。
12. [商业化与审核](11-monetization-moderation.md)：Mana/Arcane 替代方案、创作者收益、分级、举报/申诉。
13. [安全、隐私与法律](12-security-privacy-legal.md)：密钥、存档、UGC、未成年人、版权和安全边界。
14. [平台发布](13-platform-release.md)：macOS、Windows、Linux、iOS、Android 发布、签名、更新。
15. [测试策略](14-testing-strategy.md)：单元测试、Tauri command、Playwright、内容安全、发布验收。
16. [路线图](15-roadmap.md)：MVP、Beta、云端平台阶段。

## 执行边界

- 允许借鉴：功能类别、信息架构、交互模式、公开文档描述的产品规则、跨平台工程思路。
- 必须重做：品牌名、Logo、角色、故事、封面、插画、视频、音频、UI token、示例数据、prompt 文案。
- 禁止依赖：对方私有 API、对方线上内容库、对方用户生成内容、对方未公开业务规则。
- 默认策略：本地优先 Tauri 2 MVP，用户自配 AI 或使用 mock provider；云端同步、UGC、收益和审核作为后续阶段。

## 主要公开来源

- ISEKAI ZERO 官网：https://www.isekaizero.ai/
- ISEKAI ZERO `llms.txt`：https://www.isekaizero.ai/llms.txt
- ISEKAI ZERO 用户指南：https://docs.isekaizero.ai/books/your-guide-to-isekai-zero
- ISEKAI ZERO Terms & Policies：https://docs.isekaizero.ai/books/terms-policies
- ISEKAI ZERO creator/guideline/reward pages：https://www.isekaizero.ai/creation 、https://www.isekaizero.ai/guideline 、https://www.isekaizero.ai/earn-mana
- Tauri 2 官方文档：https://v2.tauri.app/
- Vercel AI SDK 官方文档：https://ai-sdk.dev/

## 文档维护规则

- 产品、数据模型、AI 契约、Tauri command、审核政策或发布平台变化时，必须同步更新相关文档。
- 外部内容只做摘要和来源链接，不复制长文、图片、视频、用户内容或页面素材。
- 所有示例默认中文优先，并保留 `locale`、`i18n` 或 `localized` 扩展字段。
- 每篇文档必须包含目标、范围、关键决策和验收标准。

## 关键决策

- 文档按“研究 -> 产品 -> 设计 -> 工程 -> 运营 -> 测试 -> 路线图”阅读。
- 复刻只做功能体验等效，不做品牌、素材、代码、接口或内容复制。
- MVP 以本地优先 Tauri 2 应用为目标，云端平台能力后置。

## 验收标准

- README 能链接到所有新增规划文档。
- 所有文档都包含目标、范围、关键决策和验收标准。
- 来源链接集中可见，后续文档可追溯到公开研究。
- 文档更新不要求恢复或修改当前应用源码。
