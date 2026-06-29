# Evolvria 开发文档索引

Evolvria 是一个由 AI 驱动的开放世界叙事模拟游戏。玩家先创建主角、关键角色和基础世界观，AI 负责扩写世界、推动事件、维护长期记忆，并让 NPC 在玩家视野之外继续行动。

本文档目录用于支撑后续开发，所有实现前应优先阅读这里的规格。

## 文档列表

- [产品需求](product-requirements.md)：目标、玩家体验、核心玩法、范围边界。
- [游戏设计规格](game-design.md)：核心循环、角色、地图、时间线、事件、结局方向。
- [跨平台支持](platform-support.md)：桌面端、移动端、平板端的体验目标、输入方式和适配要求。
- [技术架构](technical-architecture.md)：Godot 客户端、AI 编排层、本地存档、可扩展后端的职责划分。
- [Godot 客户端架构](godot-client-architecture.md)：场景、Autoload、资源、信号和模块拆分建议。
- [AI 记忆系统](ai-memory-system.md)：长期记忆、摘要、检索、世界观更新、防遗忘策略。
- [世界模拟系统](world-simulation.md)：时间推进、NPC 自主行动、事件生成和一致性约束。
- [数据模型](data-model.md)：角色、地点、事件、记忆、时间线、存档的核心字段。
- [Prompt 与响应契约](prompt-and-response-contracts.md)：AI 请求类型、JSON 输出格式和校验规则。
- [地图导入与标注](map-import-and-annotation.md)：玩家导入地图、地点标记、路径和 NPC 移动。
- [Glosc One API 集成](glosc-one-api-integration.md)：付费调用模型、请求封装、错误处理、用量展示。
- [存档与同步](save-load-and-sync.md)：本地存档、版本迁移、备份和未来云同步。
- [UI/UX 流程](ui-ux-flows.md)：主要页面、创建流程、探索界面、AI 等待态。
- [测试策略](testing-strategy.md)：单元测试、模拟测试、叙事一致性测试和手动验收。
- [安全、隐私与内容策略](security-privacy-content.md)：API Key、玩家输入、AI 输出和数据保护。
- [开发工作流](development-workflow.md)：目录约定、提交前检查、版本和文档维护。
- [开发路线图](development-roadmap.md)：MVP、Alpha、Beta、发布阶段。

## 当前约束

- 项目目标改为跨平台客户端，覆盖桌面端、移动端和平板端。
- Godot 当前项目文件仍是早期骨架，导出模板和平台参数需要在实现阶段逐步补齐。
- README 只有产品想法，尚未包含具体实现。
- 默认优先做单机可运行 MVP，AI 通过 Glosc One 远程调用。
- 所有复杂后端能力先设计接口，不在 MVP 阶段强制实现。

## 建议开发顺序

1. 搭建 Godot 基础场景、Autoload 和存档结构。
2. 完成角色与世界观创建流程。
3. 实现本地世界状态、时间线和事件历史。
4. 接入 Glosc One，完成 AI 世界观扩写与下一事件生成。
5. 加入记忆摘要、检索和世界观更新。
6. 加入地图导入、地点标记和 NPC 移动模拟。
7. 扩展跨平台 UI、测试、内容安全和用量展示。
