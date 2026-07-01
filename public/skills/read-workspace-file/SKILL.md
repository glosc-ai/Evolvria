---
name: read-workspace-file
description: "通过 Evolvria 游戏 MCP 读取或列出当前世界工作区文件。用于查看 AGENTS.md、派生 Markdown、角色地点文件、时间线、线程、地图索引或必要时读取 state/payload.json。"
---

# 读取工作区文件

读取当前 `SavePayload` 可生成的工作区文件。调用上下文已经绑定 payload 时，调用 tool 可以不传 payload；省略 `path` 时列出可读取文件。

## 工作流

1. 先省略 `path` 列出文件，确认目标路径存在。
2. 优先读取 `AGENTS.md` 和派生 Markdown 获取上下文。
3. 只在需要权威机器状态、schema 校验或精确字段时读取 `state/payload.json`。
4. 使用读取结果时，遵循 `AGENTS.md` 的加载顺序和规则。

## 路径规则

- 路径必须相对 active world 工作区。
- 禁止绝对路径、`..`、空路径段、`settings.json`、`.env` 和 secrets 目录。
- 常见路径包括 `AGENTS.md`、`world/OVERVIEW.md`、`memory/MEMORY.md`、`maps/MAP.md`、`characters/*.md`、`locations/*.md`、`history/TIMELINE.md`、`threads/THREADS.md` 和 `state/payload.json`。

## 输出

- 未传 `path` 时返回文件列表。
- 传入 `path` 时返回 `path`、`content`、`summary` 和可能的 `warnings`。
- 读取 `state/payload.json` 后若要修改，必须先调用 `backup-save` 并使用 `edit-workspace-file` 校验。

## 执行方法

AI SDK tool 入参：

```json
{}
```

```json
{
  "path": "characters/char_001.md"
}
```

外部 MCP 单次调用：

```bash
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_list_workspace_files '{}'
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_read_workspace_file '{"path":"AGENTS.md"}'
```
