# 数据模型

当前存档格式是 `schema_version = 1`，权威 TypeScript 定义位于 `src/types/domain.ts`。除非同步实现迁移逻辑，否则不得修改 schema 语义或删除字段。

## 命名约定

- 世界：`world_*`
- 角色：`char_*`，玩家主角固定为 `char_hero`
- 地点：`loc_*`
- 事件：`evt_*`
- 记忆：`mem_*`
- 势力：`fac_*`
- 地图：`map_*`
- 线索线程：`thread_*`
- AI 日志：`ai_req_*`

ID 由系统生成，不依赖显示名称。

## SavePayload

当前 active 存档是单个 JSON payload，而不是拆分成多个 `world.json` / `timeline.jsonl` 文件。

```json
{
  "schema_version": 1,
  "world": {},
  "characters": [],
  "locations": [],
  "factions": [],
  "timeline": [],
  "memories": [],
  "ai_logs": [],
  "threads": [],
  "suggested_actions": [],
  "event_counter": 0,
  "memory_counter": 0,
  "location_counter": 100,
  "thread_counter": 0,
  "updated_at": "2026-06-30T00:00:00.000Z"
}
```

浏览器 fallback 使用 `localStorage` 保存同一结构；Tauri 桌面端保存为 `saves/active_world/` 工作区文件夹，完整机器状态位于 `saves/active_world/state/payload.json`。旧版 `saves/active_world.json` 只作为兼容读取入口。

## World

```json
{
  "id": "world_001",
  "name": "苍星纪元",
  "genre": "奇幻",
  "tone": ["冒险"],
  "current_time": {
    "day": 1,
    "hour": 8,
    "calendar_label": "第一纪元 1001 年 春"
  },
  "summary": "世界阶段摘要",
  "phase_summaries": [],
  "summary_event_cursor": 0,
  "rules": [],
  "themes": [],
  "content_limits": [],
  "narrative_detail": "适中",
  "npc_autonomy_frequency": "中频",
  "map_image": {},
  "map_routes": [],
  "created_at": "2026-06-30T00:00:00.000Z",
  "schema_version": 1
}
```

`current_time` 由系统推进，AI patch 不允许直接覆盖。

## Character

```json
{
  "id": "char_001",
  "name": "璃安",
  "role": "旧友",
  "description": "熟悉边境传闻的人。",
  "personality": ["温和", "谨慎"],
  "goals": ["查清徽记来源"],
  "secrets": ["知道徽记与旧档案有关"],
  "current_location_id": "loc_start",
  "status": "active",
  "traits": ["温和", "谨慎"],
  "relationships": {
    "char_hero": {
      "type": "ally",
      "trust": 0.62,
      "affection": 0.42,
      "tension": 0.08,
      "notes": "愿意同行。"
    }
  },
  "memory_summary": "",
  "known_event_ids": [],
  "player_notes": "",
  "player_notes_updated_at": "",
  "action_tendency": "保护主角并暗中确认线索",
  "companion": true,
  "visibility": "met"
}
```

AI patch 不允许覆盖 `name`。`visibility` 当前使用 `met`、`heard`、`hidden`。

## Location

```json
{
  "id": "loc_start",
  "name": "黑石镇",
  "type": "town",
  "description": "边境贸易镇，公告板上反复出现陌生徽记。",
  "map_id": "map_001",
  "position": {
    "x": 0.42,
    "y": 0.58
  },
  "connected_location_ids": ["loc_forest"],
  "controlling_faction_id": "fac_001",
  "known_to_player": true,
  "visibility": "known_to_player",
  "state_tags": ["safe", "market"],
  "event_ids": [],
  "player_notes": "",
  "player_notes_updated_at": "",
  "biome": "temperate_grassland",
  "height": 0.48
}
```

坐标为归一化值。对已知地点，AI patch 不允许覆盖 `description` 或 `position`。

## Faction

```json
{
  "id": "fac_001",
  "name": "边境议会",
  "agenda": "维持商路和税收",
  "attitude": "谨慎合作",
  "controlled_location_ids": ["loc_start", "loc_harbor"]
}
```

## TimelineEvent

```json
{
  "id": "evt_002",
  "type": "player_action",
  "title": "追查线索",
  "description": "玩家行动产生的叙事描述。",
  "world_time": {
    "day": 1,
    "hour": 8
  },
  "location_id": "loc_start",
  "participant_ids": ["char_hero", "char_001"],
  "cause_event_ids": [],
  "effects": ["获得新线索"],
  "importance": 0.72,
  "visibility": "known_to_player",
  "outcome": "success",
  "outcome_reason": "行动符合当前场景线索。",
  "consequence": "获得指向白塔遗迹的新线索。"
}
```

一致性检查会验证事件引用的角色和地点存在。

## Memory

```json
{
  "id": "mem_002",
  "scope": "character",
  "owner_id": "char_001",
  "text": "璃安记得主角发现徽记线索。",
  "facts": ["徽记与白塔遗迹残墙符号吻合"],
  "event_id": "evt_002",
  "importance": 0.7,
  "confidence": 1,
  "tags": ["relationship", "clue"],
  "created_world_time": {
    "day": 1,
    "hour": 8
  }
}
```

当前检索使用关键词、地点、参与者和重要度加权；后续可增加 embedding。

## Thread

```json
{
  "id": "thread_001",
  "title": "徽记来源",
  "description": "查清公告板、白塔遗迹和旧档案之间的关系。",
  "kind": "main",
  "status": "open",
  "priority": 0.9,
  "tags": ["clue", "main"],
  "event_id": "evt_001",
  "progress": [
    {
      "event_id": "evt_002",
      "text": "玩家发现新的徽记线索。",
      "created_at": "2026-06-30T00:00:00.000Z"
    }
  ]
}
```

线程可在 UI 中标记为 `resolved`。

## MapImage 与 MapRoute

```json
{
  "id": "map_001",
  "name": "Azgaar 风格大陆地图",
  "image_path": "generated://map_001",
  "width": 960,
  "height": 640,
  "original_width": 2048,
  "original_height": 1536,
  "max_dimension": 2048,
  "resized_for_device": true,
  "scale_label": "未设置比例尺",
  "locations": ["loc_start"],
  "routes": [],
  "generator": {
    "source_project": "Azgaar/Fantasy-Map-Generator",
    "source_license": "MIT",
    "mode": "procedural"
  }
}
```

```json
{
  "id": "route_001",
  "from_location_id": "loc_start",
  "to_location_id": "loc_forest",
  "name": "雾林旧道",
  "type": "road",
  "danger": 0.28
}
```

当前 UI 使用 SVG 地形和结构化地点/路线渲染；native 图片导入/生成命令返回的 `image_path` 尚未接入地图视图。

## AIRequestLog

`purpose` 当前支持：

- `world_expand`
- `player_action`
- `npc_simulation`
- `memory_extract`
- `summary_update`
- `consistency_check`

```json
{
  "id": "ai_req_001",
  "world_id": "world_001",
  "purpose": "player_action",
  "prompt_hash": "stable_hash",
  "model": "deepseek/deepseek-v4-pro",
  "started_at": "2026-06-30T00:00:00.000Z",
  "finished_at": "2026-06-30T00:00:00.000Z",
  "status": "ok",
  "error": null,
  "usage": {
    "input_tokens": 620,
    "output_tokens": 420,
    "total_tokens": 1040,
    "cost_estimate": null
  },
  "summary": "本次 AI 或 mock 调用摘要",
  "raw_response": "可选，写入前必须脱敏"
}
```

不得记录 Glosc token。深度日志也必须先脱敏。

## Settings

设置包含 UI、Glosc、保存、日志和内容偏好：

- `theme`、`font_size`、`fullscreen`、`context_panel_width`
- `glosc_provider`、`glosc_base_url`、`glosc_token`、`model`、`timeout_seconds`
- `auto_retry`、`confirm_ai_calls`、`show_usage_estimate`
- `auto_save_enabled`、`debug_logs`、`log_level`、`developer_mode`
- `content_preferences`、`local_token_risk_acknowledged`、`onboarding_completed`

保存非空 `glosc_token` 前必须勾选本机存储风险确认。

## 导出 zip

Tauri `export_world` 当前会让用户选择保存位置并生成 zip，内部包含：

```text
manifest.json
AGENTS.md
state/payload.json
world/OVERVIEW.md
world/RULES.md
memory/MEMORY.md
maps/MAP.md
characters/*.md
locations/*.md
history/TIMELINE.md
threads/THREADS.md
```

`manifest.json` 描述工作区格式、schema、世界名和文件映射；完整机器可读世界数据仍在 `state/payload.json`。Markdown 文件用于 AI 按需加载和人工审阅，不替代 `SavePayload` schema v1。
