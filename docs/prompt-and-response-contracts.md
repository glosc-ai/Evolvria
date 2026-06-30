# Prompt 与响应契约

## 目标

所有 AI 调用必须有明确目的、固定上下文结构和可校验响应。客户端不能依赖自由文本猜测状态变化。

当前实现的远端调用由 Tauri `call_glosc` 发送到 OpenAI-compatible `/v1/chat/completions` 接口；未配置 Glosc One 或远端玩家行动响应不可用时使用本地 mock。

## 请求类型

`AIPurpose` 当前包括：

- `world_expand`
- `player_action`
- `npc_simulation`
- `memory_extract`
- `summary_update`
- `consistency_check`

当前实际调用远端的路径：

- `world_expand`：新建世界时调用 `generateWorld`。
- `player_action`：探索中提交玩家行动时调用 `resolvePlayerAction`。

`npc_simulation` 当前由本地 `runNpcTick` 生成简短事件和 AI 日志；其他请求类型是 schema 和规划预留。

## 通用远端请求

Rust 端 `call_glosc` 构造：

```json
{
  "model": "deepseek/deepseek-v4-pro",
  "messages": [
    {
      "role": "system",
      "content": "你是 Evolvria 的叙事与世界模拟引擎。只返回合法 JSON，不要输出 JSON 以外的内容。"
    },
    {
      "role": "user",
      "content": "{\"purpose\":\"player_action\",\"payload\":{}}"
    }
  ],
  "response_format": {
    "type": "json_object"
  },
  "temperature": 0.7
}
```

`baseUrl` 会自动补齐为 `/v1/chat/completions`。

## player_action 上下文

`buildAiContext` 当前传入：

```json
{
  "world": {},
  "scene_state": {
    "current_location": {},
    "companion_character_ids": ["char_001"],
    "nearby_locations": []
  },
  "workspace_context": {
    "workspace_format": "evolvria_workspace_v1",
    "instructions_path": "AGENTS.md",
    "instructions": "# Evolvria 世界工作区...",
    "loaded_files": [
      { "path": "AGENTS.md", "content": "..." },
      { "path": "world/OVERVIEW.md", "content": "..." },
      { "path": "memory/MEMORY.md", "content": "..." },
      { "path": "locations/loc_start.md", "content": "..." },
      { "path": "characters/char_hero.md", "content": "..." }
    ],
    "available_files": ["AGENTS.md", "state/payload.json"],
    "loading_policy": "先遵循 AGENTS.md..."
  },
  "memory_context": [],
  "recent_events": []
}
```

其中 `recent_events` 取最近 8 条，`memory_context` 默认最多 8 条。`workspace_context.loaded_files[0]` 必须是 `AGENTS.md`；后续文件只加载当前请求相关的世界摘要、规则、长期记忆、地图索引、当前地点、参与角色、开放线索和历史索引，避免长上下文导致模型遗忘关键规则。完整机器状态只在需要导入导出或一致性校验时读取 `state/payload.json`。

## PlayerActionResult

玩家行动响应必须符合：

```json
{
  "status": "ok",
  "narrative": "",
  "time_delta_minutes": 45,
  "events": [],
  "character_updates": [],
  "location_updates": [],
  "relationship_updates": [],
  "memory_writes": [],
  "suggested_actions": [],
  "warnings": [],
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "total_tokens": 0,
    "cost_estimate": null
  },
  "request_id": "ai_req_001"
}
```

错误响应：

```json
{
  "status": "error",
  "narrative": "",
  "time_delta_minutes": 0,
  "events": [],
  "character_updates": [],
  "location_updates": [],
  "relationship_updates": [],
  "memory_writes": [],
  "suggested_actions": [],
  "warnings": [],
  "error": "错误说明"
}
```

当前远端 `player_action` 如果不是 `status = ok` 且包含 `narrative` 的结构，会降级为本地 mock，并在 `warnings` 中提示。

## world_expand

当前 `generateWorld` 只要求远端返回可记录的 summary/content 和 usage。请求 payload 会包装为 `{ seed, workspace_context }`，其中 `workspace_context` 包含新世界创建用的 `AGENTS.md` 和 `world/SEED.md`。结构化初始世界由本地 `createInitialPayload(seed)` 生成。

远端成功返回：

```json
{
  "status": "ok",
  "summary": "世界扩写摘要",
  "usage": {
    "input_tokens": 860,
    "output_tokens": 1080
  }
}
```

后续如果让远端直接返回结构化世界，必须同步更新：

- `WorldSeed` 输入说明。
- `SavePayload` 生成/迁移逻辑。
- 校验器和测试 fixture。

## StatePatch

```json
{
  "target_type": "character",
  "target_id": "char_001",
  "op": "set",
  "path": "current_location_id",
  "value": "loc_ruin",
  "reason": "角色前往白塔遗迹"
}
```

schema 中声明的操作：

- `set`
- `append`
- `remove`
- `increment`
- `link`
- `unlink`

当前 `applyStatePatch` 实际实现：

- `set`
- `append`
- `increment`

`remove`、`link`、`unlink` 尚未实现，AI 不应在当前版本依赖它们。

## 校验规则

应用 patch 前必须满足：

- `target_type`、`target_id`、`path` 存在。
- 目标对象存在。
- 角色 `name` 不可修改。
- 已知地点的 `description` 和 `position` 不可修改。
- 世界 `current_time` 不可由 patch 修改。

行动应用后可调用 `validateWorldConsistency` 检查：

- timeline 的 `location_id` 是否存在。
- timeline 的 `participant_ids` 是否存在。

## 失败策略

- AI 请求前先保存 checkpoint。
- 远端不可用时优先本地 fallback。
- `status = error` 的 PlayerActionResult 不修改世界状态。
- 所有调用写入 AI 日志摘要和 usage。
- 原始响应若写入日志，必须脱敏。
