---
name: trigger-player-action
description: "根据玩家行动和当前上下文生成 PlayerActionResult。用于 player_action 请求、需要本地确定性行动模拟、或已绑定 action/context 可让 tool 自动读取时。"
---

# 触发玩家行为

根据玩家输入和当前场景上下文，生成可应用到世界状态的 `PlayerActionResult`。调用上下文已经绑定 action 或 context 时，调用 tool 可以省略这些参数。

## 决策顺序

1. 先判断玩家行动是否被当前地点、角色关系、记忆、规则和内容限制允许。
2. 让叙事明确回应玩家的具体行动，不要泛泛推进剧情。
3. 根据行动性质设置 `time_delta_minutes`：短交谈通常 10-30，调查或移动通常 30-120。
4. 将状态变化放入 events、character_updates、location_updates、relationship_updates、memory_writes 和 thread_updates。
5. 给出 2-5 个后续 `suggested_actions`，且都应与当前场景可执行。

## 禁止事项

- 不要通过 patch 改写角色姓名。
- 不要覆盖玩家已知地点的描述或地图位置。
- 不要直接覆盖世界当前时间。
- 不要泄露 `hidden` 角色秘密，除非行动明确发现了线索。

输出必须符合 `PlayerActionResult`，最终响应仍必须满足外层 JSON 契约。

## 执行方法

AI SDK tool 入参可以省略 `action` 和 `context`，由当前 `player_action` 请求注入。显式调用时传：

```json
{
  "action": "调查公告板上的白塔徽记",
  "context": {
    "current_location_id": "loc_start",
    "participant_ids": ["char_hero", "char_001"]
  }
}
```

返回结果只作为结构化行动解析；最终远端响应仍应按外层 `output_contract` 重新汇总。
