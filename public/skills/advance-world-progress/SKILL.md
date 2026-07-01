---
name: advance-world-progress
description: "推进 Evolvria 世界时间并追加一条世界进度事件。用于 NPC 自主行动、势力推进、线索发酵、天气局势变化，且不应直接覆盖玩家已确认事实时。"
---

# 推进世界进度

用于玩家行动之外的世界自然演化，例如 NPC 行动、势力移动、线索发酵、天气变化或局势升级。调用上下文已经绑定 payload 时，调用 tool 可以不传 payload。

## 输入要点

- `minutes` 表示推进分钟数；不确定时使用 60。
- `title` 和 `description` 必须清晰说明发生了什么。
- `location_id` 必须引用现有地点；不确定时使用当前或起始地点。
- `participant_ids` 只能引用现有角色。
- `visibility` 默认为 `known_to_player`；秘密进展使用 `hidden`。

## 约束

- 只推进时间并追加 `world_progress` 事件，不直接覆盖角色姓名、已知地点描述、地图位置或世界当前时间 patch。
- 事件后果写在 `effects`，用玩家能理解的语言描述影响。
- 隐藏事件可以进入时间线，但最终玩家叙事不得泄露未发现秘密。
- 输出更新后的 `SavePayload`；最终 AI 响应仍要按外层 `output_contract` 汇总。

## 执行方法

AI SDK tool 入参：

```json
{
  "minutes": 60,
  "title": "雾林守望调整巡逻",
  "description": "雾林守望在旧路标附近增加巡逻，阻止外人接近遗迹线索。",
  "location_id": "loc_forest",
  "participant_ids": ["char_001"],
  "visibility": "hidden"
}
```
