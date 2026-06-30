# Evolvria

Evolvria 是一个 AI 驱动、本地优先的叙事/世界模拟游戏。当前实现已重构为 **Tauri 2 + Vue 3 + Vue Router + Tailwind CSS**。

核心能力：

- 创建主角、关键角色和基础世界观。
- AI 或本地 mock 扩写世界并生成开局事件。
- 玩家行动会写入时间线、记忆、关系和线索。
- NPC 可按目标进行自主事件推进。
- 地图支持地点、路线、NPC 位置和玩家标注。
- 存档采用 schema v1，本地保存、备份、AI 请求前 checkpoint、导出 zip。
- 未配置 Glosc One 时完整使用本地模拟，不消耗远端额度。

## 开发

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

## 目录

```text
src/                 Vue 3 客户端
src/domain/          世界状态纯逻辑
src/services/        AI、存档、设置、Tauri 调用包装
src/stores/          Pinia 状态层
src/views/           Vue Router 页面
src-tauri/           Tauri 2 原生能力与打包配置
docs/                产品、数据、AI、平台和测试文档
tests/               Vitest 与 Playwright 测试
```
