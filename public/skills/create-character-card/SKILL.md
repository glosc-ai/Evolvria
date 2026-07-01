---
name: create-character-card
description: "生成 Evolvria 内部角色形象卡和画像提示词。用于角色图片生成前、稀疏角色输入补全、刷新外貌描述、修复画像提示词，或把可复现的外貌细节保存回角色资料时。"
---

# 创建角色形象卡

为世界模拟和角色画像生成内部角色卡。该 skill 面向程序内部 AI 调用，尤其用于 `character_image` 流程和 `gpt-image-2` 出图前的外貌补全。

## 输出契约

只返回合法 JSON，不要包裹 Markdown。

```json
{
  "appearance_description": "具体、可保存到角色卡的中文形象描写。",
  "portrait_prompt": "可直接发送给 gpt-image-2 的中文出图提示词。",
  "card_notes": ["用于程序内部的简短设计注记"],
  "warnings": []
}
```

## 工作流

1. 读取提供的角色字段：name、gender、role、description、用户外貌、personality、traits、goals、世界名、genre、tone 和 content limits。
2. 将用户填写的外貌视为约束，而不是最终 prompt；保留明确事实，再补全发型、脸部、服装、配饰、姿态、色彩和可见气质。
3. 若外貌为空，根据角色身份、性格、目标、世界题材、基调和当前故事上下文保守推断。
4. 让 `appearance_description` 足够具体，使后续模型不看图片也能复现同一角色。
5. 从补全后的外貌描述构建 `portrait_prompt`，不要直接复制原始用户文本。
6. 除非调用方明确标记可用于视觉设计，不要使用隐藏秘密。

## 外貌描述规则

- 使用中文，80 到 180 字。
- 只描述稳定且可见的视觉特征：表观年龄、体态、发型、面部、服装、配饰、材质、颜色和氛围。
- 保留所有用户指定的视觉事实，除非与安全或世界约束冲突。
- 不要提到 `AI`、`prompt`、`生成`、`模型`、`图片`、`立绘` 或实现细节。
- 不要包含 `可能`、`或许`、`大概` 等不确定表述。
- 不要包含镜头、比例、水印或 UI 规则；这些只放入 `portrait_prompt`。

## 画像提示词规则

为 `gpt-image-2` 创建单角色画像提示词：

- 使用中文，并以 `appearance_description` 为基础。
- 包含角色身份、世界题材和基调、视觉风格、半身构图、清晰面部、发型、上半身服装、关键配饰、简单背景和情绪。
- 明确禁止文字、水印、logo、边框、UI、额外人物，以及变形的手或脸。
- 优先使用 `叙事游戏角色半身像，正面或三分之二视角` 作为构图描述。

## 失败与警告

输入稀疏时，从角色身份和世界题材生成保守、可识别的设计。若安全或一致性问题导致某个细节不能使用，在 `warnings` 写入简短说明，并选择中性替代。

## 执行方法

AI SDK tool 入参：

```json
{
  "name": "洛安",
  "gender": "男",
  "role": "档案员",
  "description": "在边境驿站整理旧档案的年轻学者。",
  "appearance_description": "戴圆框眼镜，常穿深灰长外套。",
  "personality": ["谨慎", "好奇"],
  "goals": ["查清白塔徽记来源"],
  "world_name": "雾港纪事",
  "genre": "奇幻悬疑",
  "tone": ["克制", "紧张"],
  "content_limits": "避免血腥细节"
}
```

校验角色卡输出：

```bash
node public/skills/create-character-card/scripts/validate_character_card.mjs card.json
```
