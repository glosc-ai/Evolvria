---
name: evolvria-game-mcp
description: "说明 Evolvria 游戏 MCP 的受限权限、可用工具和安全边界。用于 AI 需要读取或编辑工作区、创建备份、创建世界、修改角色数据，或在写入前确认 MCP 风险边界时。"
---

# Evolvria 游戏 MCP

将高风险游戏操作收敛到受控 MCP 权限。不要让模型直接操作任意系统路径、密钥文件或未校验的存档 JSON。

## 工作流

1. 先确认当前任务是否需要 MCP 权限；纯叙事生成优先不用 MCP。
2. 写入、覆盖、创建世界或修改角色前，先调用 `backup-save` 或确认已有可恢复备份。
3. 读取工作区用 `read-workspace-file`；修改工作区文本或 `state/payload.json` 用 `edit-workspace-file`。
4. 从种子创建世界用 `create-world`；不要手写不完整的 `SavePayload`。
5. 修改角色资料用 `modify-character-data`；不要通过通用 patch 修改角色姓名或越过字段白名单。

## 权限边界

- 只处理 Evolvria active world 工作区、schema v1 payload、存档备份和可公开的工作区 Markdown。
- 禁止读取或写入 `settings.json`、Glosc token、`.env`、secrets 目录、绝对路径和工作区外文件。
- `state/payload.json` 是权威机器状态；写入前必须是合法 JSON 且通过 schema v1 校验。
- Markdown 工作区文件多为 payload 派生内容；长期有效的世界状态修改优先落到 `state/payload.json` 或专用数据 tool。
- MCP 调用只返回受控结果；最终 AI 响应仍必须符合外层 `output_contract`。

## 本地执行

项目内置 stdio MCP 服务：

```bash
yarn mcp:game
```

从 skill 脚本直接调用单个 MCP tool：

```bash
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_list_workspace_files '{}'
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_read_workspace_file '{"path":"AGENTS.md"}'
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_backup_save '{"label":"before-ai-edit"}'
```

使用临时或指定存档目录时，追加 `--save-dir /path/to/saves` 或 `--app-data /path/to/app-data`。

## 参考

读取 `references/mcp-tools.md` 获取本地服务启动方式、具体工具名、风险等级和路径安全规则。
