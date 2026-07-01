---
name: create-world
description: "通过 Evolvria 游戏 MCP 从 WorldSeed 创建完整 schema v1 SavePayload。用于新游戏世界创建、导入前草稿、需要受控 MCP 创建世界而不是手写 payload 时。"
---

# 创建世界

通过 Evolvria 游戏 MCP 创建一个完整的 schema v1 世界 payload。它和 `initialize-world` 的目标相近，但优先用于需要 MCP 权限边界、备份策略或本地服务一致性的创建流程。

## 工作流

1. 读取或使用当前 `world_expand` 上下文中的 `WorldSeed`。
2. 确认 seed 中的玩家设定完整，尤其是世界名、题材、基调、限制、主角和关键角色。
3. 调用 `create-world` 生成 `SavePayload`，不要手写局部 payload。
4. 若当前流程会覆盖已有 active world，先调用 `backup-save` 或确认 MCP 已自动备份。
5. 返回 payload 后仍由外层保存流程决定是否持久化，不要假设 tool 调用本身已经完成最终保存。

## 质量要求

- `schema_version` 必须为 1，所有必需数组字段必须存在。
- 主角、关键角色、地点、势力、线程和时间线事件要使用稳定 ID 且互相引用有效。
- 保留玩家 seed 中的明确事实，不要擅自改名、改关系或改内容限制。
- 角色秘密可以进入 `secrets`，但不要写进玩家可见开场叙事。
- 起始地点、开局事件、世界摘要和 2-5 个 `suggested_actions` 要能直接驱动第一回合。

## 失败处理

如果 seed 缺失或 schema 校验失败，返回清晰错误，不要输出半成品世界。需要具体 MCP 边界时，先使用 `evolvria-game-mcp`。

## 执行方法

AI SDK tool 入参可以省略 `seed`，由当前 `world_expand` 运行时注入；显式调用时传：

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

外部 MCP 创建 active world：

```bash
node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_create_world @seed-args.json
```
