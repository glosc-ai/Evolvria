---
name: backup-save
description: "通过 Evolvria 游戏 MCP 为当前 SavePayload 创建可恢复备份。用于编辑工作区、覆盖 state/payload.json、创建或导入世界、修改角色数据等高风险写入之前。"
---

# 备份存档

在任何可能改变世界状态、工作区文件或角色数据的操作前创建 AI checkpoint 备份。调用上下文已经绑定 payload 时，调用 tool 可以不传 payload。

## 何时先备份

- 写入或替换 `state/payload.json`。
- 调用 `edit-workspace-file` 修改重要工作区文件。
- 调用 `modify-character-data` 批量更新角色字段。
- 创建、导入或覆盖 active world。
- 执行不可轻松人工还原的 AI 自动修改。

## 调用规则

- `payload` 必须是有效 schema v1 `SavePayload`；缺失时使用运行时绑定 payload。
- `reason` 用简短中文说明备份原因，例如 `修改角色画像前备份`。
- 备份成功后再继续后续写入。
- 不要把备份当作最终保存；它只提供回滚点。

## 执行方法

AI SDK tool 入参：

```json
{
  "reason": "修改角色画像前备份"
}
```

外部 MCP 单次调用：

```bash
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_backup_save '{"label":"before-character-portrait"}'
```

## 输出

返回 MCP 结果，包含 `status`、`summary`、`warnings` 和备份类型。若备份失败，停止后续高风险写入并报告错误。
