# 数据模型

## 命名约定

- 世界：`world_*`
- 角色：`char_*`
- 地点：`loc_*`
- 事件：`evt_*`
- 记忆：`mem_*`
- 势力：`fac_*`
- 地图：`map_*`

ID 应由系统生成，不依赖名称。

## World

```json
{
  "id": "world_001",
  "name": "苍星纪元",
  "genre": "fantasy",
  "tone": ["adventure", "political"],
  "current_time": {
    "day": 1,
    "hour": 8,
    "calendar_label": "第一纪元 1001 年 春"
  },
  "summary": "世界阶段摘要",
  "rules": [],
  "themes": [],
  "content_limits": [],
  "created_at": "2026-06-29T00:00:00Z",
  "schema_version": 1
}
```

## Character

```json
{
  "id": "char_hero",
  "name": "主角",
  "role": "player",
  "description": "",
  "personality": [],
  "goals": [],
  "secrets": [],
  "current_location_id": "loc_start",
  "status": "active",
  "traits": [],
  "relationships": {
    "char_001": {
      "type": "ally",
      "trust": 0.5,
      "affection": 0.3,
      "tension": 0.1,
      "notes": ""
    }
  },
  "memory_summary": "",
  "known_event_ids": []
}
```

## Location

```json
{
  "id": "loc_start",
  "name": "黑石镇",
  "type": "town",
  "description": "",
  "map_id": "map_001",
  "position": {
    "x": 0.42,
    "y": 0.58
  },
  "connected_location_ids": [],
  "controlling_faction_id": null,
  "state_tags": ["safe", "market"],
  "event_ids": []
}
```

## Event

```json
{
  "id": "evt_001",
  "type": "player_action",
  "title": "城门相遇",
  "description": "主角在城门外遇见艾琳。",
  "world_time": {
    "day": 1,
    "hour": 9
  },
  "location_id": "loc_start",
  "participant_ids": ["char_hero", "char_001"],
  "cause_event_ids": [],
  "effects": [],
  "importance": 0.7,
  "visibility": "known_to_player"
}
```

## Memory

```json
{
  "id": "mem_001",
  "scope": "character",
  "owner_id": "char_001",
  "text": "艾琳记得主角帮她摆脱了追兵。",
  "event_id": "evt_001",
  "importance": 0.8,
  "confidence": 1.0,
  "tags": ["relationship", "rescue"],
  "created_world_time": {
    "day": 1,
    "hour": 9
  }
}
```

## AIRequestLog

```json
{
  "id": "ai_req_001",
  "world_id": "world_001",
  "purpose": "player_action",
  "prompt_hash": "sha256",
  "model": "glosc-one-default",
  "started_at": "2026-06-29T00:00:00Z",
  "finished_at": null,
  "status": "pending",
  "error": null,
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "cost_estimate": null
  }
}
```

## Save Manifest

```json
{
  "schema_version": 1,
  "world_id": "world_001",
  "display_name": "苍星纪元",
  "updated_at": "2026-06-29T00:00:00Z",
  "files": {
    "world": "world.json",
    "characters": "characters.json",
    "locations": "locations.json",
    "timeline": "timeline.jsonl",
    "memories": "memories.jsonl"
  }
}
```

