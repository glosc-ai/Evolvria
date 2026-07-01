---
name: workspace-save-format
description: "查询和维护 Evolvria 文件夹式世界存档与 AI workspace_context 规则。用于修改保存加载、导入导出、备份、AGENTS.md 加载、state/payload.json 兼容、地图资源或相关测试文档时。"
---

# 工作区存档格式

在修改 Evolvria 存档持久化或 AI 上下文组装前使用本 skill。

核心规则：世界存档是文件夹式 workspace。`AGENTS.md` 是 AI 入口，`state/payload.json` 是权威机器状态，Markdown 文件是给 AI 和人类阅读的派生上下文。

## 工作流

1. 编辑前检查当前实现：
   - `src/services/world-workspace.ts`
   - `src/services/save.ts`
   - `src-tauri/src/lib.rs`
   - `src/stores/world.ts`
   - `src/services/ai-skills.ts`
2. 保持旧单文件 JSON 存档可读。
3. 任何 `workspace_context.loaded_files` 都必须让 `AGENTS.md` 排在第一位。
4. 让 `state/payload.json` 继续作为 schema v1 的权威来源。
5. 改动路径、工作区文件、prompt contract、导入导出行为或生成 Markdown 时，同步更新文档和测试。
6. 验证 TypeScript、单元测试和 Rust 测试。

## 实现规则

- Tauri active save 路径是 `app_data_dir/saves/active_world/`。
- Tauri active payload 路径是 `app_data_dir/saves/active_world/state/payload.json`。
- AI checkpoint 路径是 `app_data_dir/saves/backups/ai_before_request/`。
- 滚动备份是 `app_data_dir/saves/backups/active_world_*/` 文件夹快照。
- 浏览器 fallback 同时维护 `evolvria.active_world` 和虚拟 workspace bundle `evolvria.active_workspace`。
- 导出 zip 必须包含 `AGENTS.md`、`manifest.json`、`state/payload.json`、派生 Markdown 和支持的 `maps/` 资源。
- 导入 zip 必须优先读取 `state/payload.json`，并兼容旧的 `payload.json`。
- 玩家行动的 `workspace_context` 只加载 scoped files：`AGENTS.md`、世界规则、记忆、地图索引、当前地点、参与角色、线程和时间线索引。

## 详细参考

修改文件布局、生成 Markdown、Tauri 导入导出、runtime skill 注册或测试文档时，读取 `references/workspace-save-format.md`。

## 执行方法

查询内置规则：

```json
{
  "topic": "ai-context"
}
```

校验本地 workspace 文件夹或浏览器导出的 bundle：

```bash
node public/skills/workspace-save-format/scripts/validate_workspace.mjs ~/Library/Application\ Support/com.gloscai.evolvria/saves/active_world
node public/skills/workspace-save-format/scripts/validate_workspace.mjs exported-workspace-bundle.json
```

变更存档格式后，至少运行：

```bash
yarn typecheck
yarn test tests/domain.test.ts
cd src-tauri && cargo test
```
