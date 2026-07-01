---
name: record-event
description: "把已经发生或被揭示的叙事事件追加到 Evolvria 时间线并返回更新后的 SavePayload。用于记录玩家行动后果、世界事件、秘密事件或调查发现。"
---

# 记录事件

将一个已经发生、被揭示或需要追踪的事件追加到世界时间线。调用上下文已经绑定 payload 时，调用 tool 可以不传 payload。

## 输入规则

- 事件必须包含 `title`、`description`、`type`、`importance` 和 `visibility`。
- 未传 `world_time` 时使用当前世界时间。
- 未传 `location_id` 时使用当前或起始地点。
- `participant_ids` 只能引用现有角色。
- `cause_event_ids` 只引用已经存在的时间线事件。
- `effects` 写玩家能理解的后果，不写实现细节。

## 可见性

- 玩家已知事件使用 `known_to_player`。
- 传闻或半公开信息可以使用项目现有的可见性标签。
- 秘密事件可记录为 `hidden`，但最终给玩家的叙事不能泄露未发现内容。

输出是更新后的 `SavePayload`。

## 执行方法

AI SDK tool 入参：

```json
{
  "event": {
    "type": "clue_found",
    "title": "发现白塔徽记拓印",
    "description": "玩家在公告板背面发现一枚旧徽记拓印。",
    "location_id": "loc_start",
    "participant_ids": ["char_hero"],
    "effects": ["开启白塔遗迹线索"],
    "importance": 0.8,
    "visibility": "known_to_player"
  }
}
```
