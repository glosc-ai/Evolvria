---
name: initialize-world
description: "根据 WorldSeed 初始化完整 Evolvria schema v1 SavePayload。用于 world_expand 新游戏创建、从玩家种子生成本地开局、需要可保存的初始世界状态时。"
---

# 初始化世界

根据玩家提交的 `WorldSeed` 创建本地优先、schema v1 兼容的完整世界状态。调用上下文已经绑定 seed 时，调用 tool 可以不再传 seed。

## 输出契约

返回单个可保存的 `SavePayload`，至少包含：

- `schema_version: 1`
- 完整 `world`
- `characters`、`locations`、`factions`、`timeline`、`memories`、`ai_logs`、`threads`
- `suggested_actions` 和计数器字段

## 生成规则

- 保留玩家明确填写的世界名、题材、基调、内容限制、主角和关键角色设定。
- 为主角、关键角色、起始地点、势力、开局时间线事件和世界级记忆生成稳定 ID。
- 开局必须有至少一条玩家可见时间线事件和一条世界级记忆。
- 角色秘密只写入内部字段；不要在开场叙事或玩家可见记忆中剧透。
- 地点、角色、势力、线程之间的引用必须互相存在，避免悬空 ID。
- 输出结构化状态，不要用自由文本替代 `SavePayload`。

## 执行方法

AI SDK tool 入参可以省略 `seed`，由当前 `world_expand` 请求注入。显式调用时传完整 `WorldSeed`：

```json
{
  "seed": {
    "world_name": "雾港纪事",
    "genre": "奇幻悬疑",
    "tone": "克制、紧张",
    "limits": "避免血腥细节",
    "narrative_detail": "适中",
    "npc_autonomy_frequency": "中频",
    "hero": {
      "name": "岚",
      "gender": "女",
      "description": "年轻调查员",
      "goal": "查清失踪案",
      "ability": "观察细节",
      "weakness": "不擅长信任他人"
    },
    "key_characters": []
  }
}
```
