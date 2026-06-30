# Evolvria 开发文档索引

Evolvria 是一个 AI 驱动、本地优先的叙事/世界模拟游戏。当前实现基于 **Tauri 2 + Vue 3 + Vue Router + Pinia + Tailwind CSS**：玩家创建世界种子，系统生成 schema v1 的结构化世界，并在探索中持续维护角色、地点、事件、记忆、线索、地图和 AI 日志。

文档原则：

- 文档描述必须以当前代码为准，规划能力需明确标注“后续”。
- 数据结构以 `src/types/domain.ts` 和 `docs/data-model.md` 为准。
- AI、存档、平台行为变化后必须同步更新相关文档。
- 用户可见文案、错误和日志默认使用中文。

## 文档列表

- [产品需求](product-requirements.md)：定位、MVP 范围、非目标和成功标准。
- [游戏设计规格](game-design.md)：核心循环、探索、时间、角色、事件和失败判定。
- [跨平台支持](platform-support.md)：桌面、移动、平板的当前实现和目标适配。
- [技术架构](technical-architecture.md)：Vue/Tauri 模块职责、数据流和 native 命令。
- [数据模型](data-model.md)：schema v1 的世界、角色、地点、事件、记忆、线索、地图和存档字段。
- [Prompt 与响应契约](prompt-and-response-contracts.md)：AI 请求类型、远端/本地 fallback、JSON 输出和 patch 规则。
- [AI 记忆系统](ai-memory-system.md)：当前关键词检索、记忆写入、摘要规划和冲突优先级。
- [世界模拟系统](world-simulation.md)：时间推进、NPC tick、事件重要度和一致性约束。
- [地图导入与标注](map-import-and-annotation.md)：当前地图 UI、结构化地点/路线和 native 图片命令边界。
- [Glosc One API 集成](glosc-one-api-integration.md)：配置、调用、用量估算、错误降级和日志。
- [存档与同步](save-load-and-sync.md)：当前单文件 SavePayload、备份、AI checkpoint、导出 zip 和未来同步。
- [UI/UX 流程](ui-ux-flows.md)：路由页面、主流程、响应式导航和设置入口。
- [视觉设计方向](visual-direction.md)：当前 Vue/Tailwind 暗色界面、字体和组件 token。
- [测试策略](testing-strategy.md)：Vitest、Playwright、Tauri Rust 测试和手动验收。
- [安全、隐私与内容策略](security-privacy-content.md)：Glosc Key、本地存储、日志脱敏、导出风险和内容边界。
- [开发工作流](development-workflow.md)：命令、目录、提交前检查和文档维护。
- [开发路线图](development-roadmap.md)：已完成能力和后续阶段。

## 当前已实现主线

- 12 个 Vue Router 页面：首页、引导、新建世界、探索、地图、地点、人物、时间线、线索、世界观、存档、设置。
- Pinia store 连接 UI、平台能力、设置、世界状态、AI 和存档。
- `SavePayload` schema v1 统一保存世界、角色、地点、势力、时间线、记忆、线索、AI 日志和计数器。
- Tauri 桌面端保存到应用数据目录；浏览器开发环境 fallback 到 `localStorage`。
- 每次覆盖 active 存档前保留最近 5 个备份；AI 请求前保存 `ai_before_request.json` checkpoint。
- 未配置 Glosc One 时完整使用本地 mock，不消耗远端额度。
- 地图页支持 SVG 底图、缩放、地点显示、隐藏未知、移动、手动添加地点和添加路线。
- Tauri native 已包含地图图片导入/生成命令，但当前 Vue 地图 UI 尚未接入文件选择入口。

## 常用命令

```bash
yarn install
yarn dev
yarn typecheck
yarn test
yarn test:ui
yarn tauri:dev
yarn tauri:build

cd src-tauri && cargo test
```
