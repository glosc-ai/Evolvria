# MCP 工具参考

## 本地服务

运行 `yarn mcp:game` 启动 stdio MCP 服务。默认路径：

- macOS：`~/Library/Application Support/com.gloscai.evolvria`
- Linux：`$XDG_DATA_HOME/com.gloscai.evolvria` 或 `~/.local/share/com.gloscai.evolvria`
- Windows：`%APPDATA%/com.gloscai.evolvria`

可用 `EVOLVRIA_APP_DATA_DIR` 指定应用数据目录，或用 `EVOLVRIA_SAVE_DIR` 直接指定 `saves` 目录。

## 单次调用脚本

使用 `scripts/call_mcp_tool.mjs` 对 stdio MCP 服务发起一次 tool 调用。该脚本会自动完成 `initialize` 和 `tools/call`：

```bash
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs <tool-name> '<json-args>'
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs <tool-name> @args.json --save-dir /tmp/evolvria/saves
```

示例：

```bash
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_list_workspace_files '{}'
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_validate_payload '{}'
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_read_workspace_file '{"path":"state/payload.json"}'
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_backup_save '{"label":"before-character-update"}'
```

## 工具

- `evolvria_list_workspace_files`：列出 active world 工作区文件。
- `evolvria_read_workspace_file`：读取工作区内文本或二进制文件；文本返回 `content`，二进制返回 base64。
- `evolvria_write_workspace_file`：写入工作区文本文件；写 `state/payload.json` 时会校验 schema v1。
- `evolvria_backup_save`：复制 active world 到 `saves/backups/mcp_*`。
- `evolvria_create_world`：根据 seed 创建 schema v1 active world。覆盖已有世界前会要求 `overwrite: true` 并自动备份。
- `evolvria_modify_character_data`：修改角色受控字段并保存 payload。
- `evolvria_load_active_payload`：读取 active payload。
- `evolvria_validate_payload`：校验传入 payload 或当前 active payload。

## 安全规则

- 所有相对路径都解析在 `saves/active_world` 下。
- 拒绝绝对路径、`..`、空路径段、`settings.json`、`.env` 和 secrets 目录。
- 写操作默认先创建备份，除非明确传 `backup: false`。
- MCP 只维护 schema v1；schema 变化必须先更新项目数据模型和迁移逻辑。

## 常用 JSON 入参

创建世界：

```json
{
  "seed": {
    "world_name": "雾港纪事",
    "genre": "奇幻悬疑",
    "tone": "克制、紧张",
    "limits": "避免血腥细节",
    "narrative_detail": "适中",
    "npc_autonomy_frequency": "中频",
    "hero": { "name": "岚", "gender": "女", "description": "年轻调查员", "goal": "查清失踪案", "ability": "观察细节", "weakness": "不擅长信任他人" },
    "key_characters": []
  },
  "overwrite": false
}
```

修改角色：

```json
{
  "character_id": "char_001",
  "updates": {
    "player_notes": "需要追问旧档案来源。",
    "visibility": "met"
  },
  "backup": true
}
```
