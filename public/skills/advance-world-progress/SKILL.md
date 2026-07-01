---
name: advance-world-progress
title: 推进世界进度
description: 推进世界时间并生成一条世界进度事件，不直接覆盖玩家已确认事实。AI 调用时可省略 payload，程序会使用当前运行时 payload。
runtime_context: 可使用当前 SavePayload
---

# 推进世界进度

用于玩家行动之外的世界自然演化，例如 NPC 行动、势力移动、线索发酵、天气或局势变化。

使用规则：

- 只推进时间和追加事件，不直接覆盖玩家已经确认的角色姓名、已知地点描述、地图位置或世界当前时间 patch。
- `minutes` 表示推进的分钟数；不确定时使用 60。
- 事件必须包含清晰的 `title` 和 `description`。
- `visibility` 默认为 `known_to_player`；秘密进展应使用 `hidden`。
- 参与者必须使用现有角色 ID，地点必须使用现有地点 ID。

输出是更新后的 `SavePayload`。最终 AI 响应仍要按外层 `output_contract` 汇总。
