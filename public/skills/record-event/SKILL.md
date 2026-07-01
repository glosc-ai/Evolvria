---
name: record-event
title: 记录事件
description: 把叙事事件写入时间线，返回更新后的 SavePayload。AI 调用时可省略 payload，程序会使用当前运行时 payload。
runtime_context: 可使用当前 SavePayload
---

# 记录事件

将一个已经发生或被揭示的事件追加到世界时间线。

使用规则：

- 事件必须有 `title`、`description`、`type`、`importance` 和 `visibility`。
- 未传 `world_time` 时使用当前世界时间。
- 未传 `location_id` 时使用当前或起始地点。
- `participant_ids` 只能引用现有角色。
- `effects` 写玩家能理解的后果，不写实现细节。
- 秘密事件可记录为 `hidden`，但最终给玩家的叙事不能泄露未发现内容。

输出是更新后的 `SavePayload`。
