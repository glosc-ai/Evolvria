---
name: generate-character
title: 生成角色
description: 生成一个符合 Evolvria schema 的角色对象，可用于新增 NPC、同伴或势力代表。
runtime_context: 无需运行时上下文
---

# 生成角色

生成符合 `Character` schema 的角色对象，可用于新 NPC、同伴、对手、目击者或势力代表。

使用规则：

- 必须提供 `name`、`role` 和 `description`。
- `personality`、`goals`、`secrets` 使用逗号、顿号或换行分隔为标签数组。
- `current_location_id` 默认 `loc_start`，但应优先使用场景中真实地点 ID。
- `visibility` 可为 `met`、`heard` 或 `hidden`。
- `appearance_description` 要能直接给角色形象生成流程使用。
- 不要生成与现有角色重复的姓名和身份，除非剧情明确要求。

输出必须是单个 `Character` 对象。
