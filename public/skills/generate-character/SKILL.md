---
name: generate-character
description: "生成符合 Evolvria schema v1 的 Character 对象。用于新增 NPC、同伴、对手、目击者、势力代表，或需要先构造角色对象再写入 SavePayload 时。"
---

# 生成角色

生成单个符合 `Character` schema 的角色对象。该 tool 不需要运行时 payload，但调用方应提供当前场景中真实的地点 ID 和已有角色背景，避免重复或悬空引用。

## 输入规则

- 必须提供 `name`、`role` 和 `description`。
- `gender` 缺省为 `未指定`。
- `personality`、`goals`、`secrets` 使用逗号、顿号或换行分隔，tool 会拆为数组。
- `current_location_id` 默认 `loc_start`，但应优先使用场景中真实地点 ID。
- `visibility` 只能是 `met`、`heard` 或 `hidden`。
- 需要画像相关细节时，把稳定可见特征写进 `description`，或后续使用 `create-character-card` 与 `modify-character-data` 补全。

## 输出规则

- 输出必须是单个 `Character` 对象，不要返回数组或自由文本。
- 不要生成与现有角色重复的姓名和身份，除非剧情明确要求。
- `secrets` 可包含内部秘密，但玩家可见叙事不得直接泄露。
- `companion` 只在角色确实会跟随或协助玩家时设为 true。

## 执行方法

AI SDK tool 入参：

```json
{
  "name": "洛安",
  "gender": "男",
  "role": "档案员",
  "description": "在边境驿站整理旧档案的年轻学者。",
  "personality": "谨慎、好奇",
  "goals": "查清白塔徽记来源",
  "secrets": "曾替白塔学社转交密信",
  "current_location_id": "loc_start",
  "visibility": "heard"
}
```

校验生成结果：

```bash
node public/skills/generate-character/scripts/validate_character.mjs character.json
```
