---
name: modify-character-data
description: "通过 Evolvria 游戏 MCP 安全修改角色非姓名字段。用于更新描述、性格、目标、秘密、位置、状态、玩家笔记、画像字段、行动倾向、同伴标记或可见性。"
---

# 修改角色数据

在字段白名单内更新单个角色，并返回新的 `SavePayload`。调用上下文已经绑定 payload 时，调用 tool 可以不传 payload。

## 可更新字段

- 文本字段：`description`、`current_location_id`、`status`、`memory_summary`、`player_notes`、`appearance_description`、`portrait_prompt`、`portrait_image_url`、`action_tendency`
- 数组字段：`personality`、`goals`、`secrets`、`traits`
- 布尔字段：`companion`
- 枚举字段：`visibility`，只能是 `met`、`heard` 或 `hidden`

## 约束

- 永远不要修改 `name`。
- `character_id` 必须引用现有角色。
- `current_location_id` 必须引用现有地点。
- 数组字段会整体替换；只想追加时先读取现有值再合并。
- `player_notes` 会更新玩家笔记时间戳。
- `portrait_image_url` 会更新画像时间戳。
- 批量或高风险修改前先调用 `backup-save`。

## 使用建议

- 修改叙事事实前确认该事实没有和玩家已确认信息冲突。
- 外貌和画像提示词建议先用 `create-character-card` 生成，再通过本 skill 写回角色。
- 更新秘密时只写入内部字段，不要在玩家可见叙事中泄露。

## 执行方法

AI SDK tool 入参：

```json
{
  "character_id": "char_001",
  "updates": {
    "player_notes": "需要追问旧档案来源。",
    "visibility": "met"
  }
}
```

外部 MCP 单次调用：

```bash
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_modify_character_data '{"character_id":"char_001","updates":{"player_notes":"需要追问旧档案来源。"},"backup":true}'
```

离线修改 payload 文件时使用 bundled script；默认输出新 payload 到 stdout，传 `--write` 才写文件：

```bash
node public/skills/modify-character-data/scripts/apply_character_update.mjs state/payload.json char_001 '{"player_notes":"需要追问旧档案来源。"}' --write state/payload.next.json
```
