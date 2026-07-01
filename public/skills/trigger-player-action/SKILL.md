---
name: trigger-player-action
title: 触发玩家行为
description: 根据玩家行动和当前上下文生成 PlayerActionResult。AI 调用时可省略 action/context，程序会使用当前请求值。
runtime_context: 可使用当前玩家行动和上下文
---

# 触发玩家行为

根据玩家输入和当前场景上下文，生成可应用到世界状态的 `PlayerActionResult`。

使用规则：

- 先判断玩家行动是否被当前地点、角色关系、记忆和规则允许。
- 叙事必须回应玩家的具体行动，而不是泛泛推进剧情。
- `time_delta_minutes` 应体现行动耗时；短交谈可为 10-30，探索可为 30-120。
- 所有状态变化通过 events、character_updates、location_updates、relationship_updates 和 memory_writes 表达。
- 不允许通过 patch 改写角色姓名、已知地点描述、已知地点位置或世界当前时间。
- 如果调用上下文已有 action/context，调用 tool 时可以不传。

输出必须符合 `PlayerActionResult`，并给出 2-5 个后续 suggested_actions。
