---
name: edit-workspace-file
description: "通过 Evolvria 游戏 MCP 校验并准备工作区文本文件编辑。用于修改 Markdown、JSON、txt 或 state/payload.json，尤其需要 schema v1 校验和路径安全检查时。"
---

# 编辑工作区文件

校验并准备对 active world 工作区文本文件的编辑。调用上下文已经绑定 payload 时，调用 tool 可以不传 payload。

## 工作流

1. 先用 `read-workspace-file` 确认目标路径和当前内容。
2. 对重要写入先调用 `backup-save`。
3. 只传入完整的新文件内容，不要传差异片段。
4. 修改 `state/payload.json` 时，内容必须是合法 JSON 且通过 schema v1 校验。
5. 检查返回的 `warnings`；若 `persisted` 为 false，由外层保存流程决定是否真正写入。

## 路径与格式

- 只允许工作区内 `.md`、`.markdown`、`.json`、`.txt` 和 `AGENTS.md`。
- 禁止绝对路径、`..`、空路径段、`settings.json`、`.env` 和 secrets 目录。
- Markdown 工作区文件通常由 payload 派生；若修改需要长期生效，优先修改 `state/payload.json` 或使用专用数据 tool。

## 状态安全

- 不要写入不完整的 payload。
- 不要绕过 `validatePayloadSchema`。
- 不要用 Markdown 编辑替代角色、地点、线程等权威字段更新。
- 写入失败时停止后续操作并报告错误。

## 执行方法

AI SDK tool 入参：

```json
{
  "path": "state/payload.json",
  "content": "{...完整 JSON 字符串...}"
}
```

外部 MCP 单次调用。复杂内容建议写入临时 args JSON，然后用 `@args.json`：

```json
{
  "path": "world/RULES.md",
  "content": "# 世界规则\n\n- 已确认事实不可覆盖。\n",
  "backup": true
}
```

```bash
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_write_workspace_file @args.json
```
