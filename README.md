# Evolvria

Evolvria 是一个基于 **Tauri 2 + Vue 3 + Vite + Pinia** 的本地优先 AI 互动叙事应用。当前实现按 `docs/` 中的 ISEKAI ZERO 同类产品复刻规划推进，但只做功能体验等效：使用自有品牌、原创示例故事和本地 workspace，不复制对方素材、代码、接口或用户内容。

## 当前 MVP

- 首页、内容库、故事详情、Persona 启动、聊天、创作工作台、存档、设置、Cloud Preview。
- 原创示例故事线：星烬边境、雾港契约。
- Glosc One + AI SDK provider 设置：默认 `https://one.gloscai.com/v1`，用户 API key 本地保存，无 key 时自动走 mock 聊天闭环。
- 内置项目 AI skills：叙事、内容审核、摘要 Arc、图片、视频、语音提示词，位于 `public/skills/`。
- 本地 JSON workspace、自动保存、备份、导出、Tauri commands。
- SummaryChapter 摘要、Arc 进度、Fate Engine 裁定和 Scene Mode 视觉小说渲染。
- Creator Studio：新建/编辑 Storyline、主角色、Scenario，媒体导入、版权确认、local_ready 校验。
- Account/Cloud Preview：私有同步状态、UGC 审核队列、提交审核、通过发布、Creator Share 占位账本。
- Saves：本地保存、备份、导出，以及浏览器 JSON workspace 导入。
- Vitest、Playwright 和 Rust command 测试。

## Commands

```bash
yarn install
yarn dev
yarn typecheck
yarn test
yarn e2e
yarn tauri:dev
yarn tauri:build

cd src-tauri && cargo test
```

## Docs

从 [docs/README.md](docs/README.md) 开始阅读完整产品、设计、架构、数据模型、测试和路线图文档。
