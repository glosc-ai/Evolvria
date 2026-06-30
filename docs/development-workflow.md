# 开发工作流

## 基本原则

- 先保证本地闭环，再扩展在线能力。
- 每个会改变世界状态的功能都必须考虑存档、备份和失败恢复。
- 每个 AI 调用必须有本地 mock 或优雅 fallback，自动测试不能依赖真实 Glosc One。
- 修改数据结构、AI 契约、平台行为、存档格式或核心玩法时，必须同步更新 `docs/`。
- UI 文案、错误和日志保持中文。

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

`package.json` 中还提供：

- `yarn dev:tauri`：运行 `scripts/tauri-dev-server.mjs`
- `yarn build`：`vue-tsc --noEmit && vite build`
- `yarn preview`：Vite preview

## 目录约定

```text
src/types/           类型和 schema
src/domain/          纯领域逻辑和 fixture/mock
src/services/        AI、存档、设置、Tauri invoke、工具函数
src/stores/          Pinia 状态层
src/views/           Vue Router 页面
src-tauri/           Tauri native 命令、配置和 Rust 测试
public/assets/       运行时静态资源
assets/              源资产和许可
tests/               Vitest 与 Playwright 测试
docs/                产品、架构、数据、AI、平台和测试文档
```

## 推荐实现顺序

1. 明确涉及的 schema、store、service 和 view。
2. 先在 domain/service 层实现可测试逻辑。
3. 更新 store 编排和持久化。
4. 接入 UI。
5. 增加或更新 Vitest/Playwright/Rust 测试。
6. 同步文档。

## 提交前检查

至少确认：

- `yarn typecheck`
- `yarn test`
- 涉及 UI 主流程时运行 `yarn test:ui`
- 涉及 Tauri native 时运行 `cd src-tauri && cargo test`
- 新增数据字段已更新 `docs/data-model.md`
- 修改 AI 请求/响应已更新 `docs/prompt-and-response-contracts.md`
- 修改存档行为已更新 `docs/save-load-and-sync.md`
- 修改平台适配已更新 `docs/platform-support.md`

## 文档维护触发

需要更新文档的情况：

- 新增核心玩法。
- 新增或修改数据模型字段。
- 新增 AI 请求类型或修改响应格式。
- 修改 Glosc One 调用方式。
- 修改存档格式、备份、导入导出。
- 修改地图导入/标注行为。
- 修改平台能力或响应式布局。
- 修改 MVP 范围或路线图。

## 调试建议

- AI 请求前先确认 checkpoint 已保存。
- patch 应在应用前校验，失败时不改状态。
- 存档加载失败时输出可读错误，不暴露堆栈给玩家。
- deep 日志必须脱敏，并在 UI 上二次确认风险。

## 版本命名建议

- `0.1.x`：本地闭环、创建、探索、存档和基础地图。
- `0.2.x`：远端 AI 契约完善、导入导出 UI、设置增强。
- `0.3.x`：摘要、记忆检索和一致性检查增强。
- `0.4.x`：地图图片导入、NPC 模拟和离线推进。
- `0.5.x`：公开测试前打磨、隐私清理、跨平台验收。
