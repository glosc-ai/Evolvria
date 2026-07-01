---
name: initialize-world
title: 初始化世界
description: 初始化一个 Evolvria 世界，返回完整 schema v1 SavePayload。AI 调用时可省略 seed，程序会使用当前请求 seed。
runtime_context: 可使用当前 world_expand seed
---

# 初始化世界

根据玩家提交的 `WorldSeed` 创建一个本地优先、schema v1 兼容的世界状态。

使用规则：

- 保留玩家明确填写的世界名、题材、基调、限制、主角和关键角色设定。
- 生成完整 `SavePayload`，包含 world、characters、locations、factions、timeline、memories、threads 和 suggested_actions。
- 开局必须有一条玩家可见时间线事件和一条世界级记忆。
- 不要提前剧透角色秘密；隐藏信息只进入角色内部字段。
- 如果调用上下文已有 seed，调用 tool 时可以不传 seed。

输出必须是可保存的 `SavePayload`，不得返回自由文本替代结构化状态。
