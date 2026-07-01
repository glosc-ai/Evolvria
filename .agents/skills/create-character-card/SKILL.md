---
name: create-character-card
description: Generate Evolvria internal character cards for world simulation and portrait creation. Use when program-internal AI needs to create, enrich, repair, or refresh a character profile, especially before calling an image model such as gpt-image-2, when turning sparse user character input into a complete role card, or when saving concrete appearance details back into a character card.
---

# Create Character Card

## Output Contract

Return only valid JSON. Do not wrap it in Markdown.

```json
{
  "appearance_description": "具体、可保存到角色卡的中文形象描写。",
  "portrait_prompt": "可直接发送给 gpt-image-2 的中文出图提示词。",
  "card_notes": ["用于程序内部的简短设计注记"],
  "warnings": []
}
```

## Workflow

1. Read the provided character fields: name, gender, role, description, user appearance, personality, traits, goals, world name, genre, tone, and content limits.
2. Treat user-provided appearance as a constraint, not a final prompt. Preserve explicit details, then enrich hair, face, clothing, accessories, posture, palette, and visible mood.
3. If appearance is empty, infer details from role, personality, goals, world genre, tone, and current story context.
4. Keep the saved `appearance_description` concrete enough that a future model can reproduce the same character without seeing the image.
5. Build `portrait_prompt` from the enriched description, not directly from raw user text.
6. Avoid spoilers from hidden secrets unless the caller explicitly marks them safe for visual use.

## Appearance Description Rules

- Write in Chinese, 80 to 180 characters.
- Describe only visible, stable visual features: apparent age, body language, hair, face, clothing, accessories, materials, colors, and atmosphere.
- Preserve all user-specified visual facts unless they conflict with safety or world constraints.
- Do not mention "AI", "prompt", "生成", "模型", "图片", "立绘", or implementation details.
- Do not include uncertain alternatives such as "可能", "或许", "大概".
- Do not include camera instructions, aspect ratio, watermark rules, or UI rules in `appearance_description`; those belong in `portrait_prompt`.

## Portrait Prompt Rules

Create a single-character portrait prompt for `gpt-image-2`:

- Chinese prompt, grounded in `appearance_description`.
- Include role, world genre/tone, visual style, half-body framing, clear face, hairstyle, upper-body outfit, key accessories, simple background, and mood.
- Explicitly prohibit text, watermark, logo, border, UI, extra people, and disfigured hands or face.
- Prefer "叙事游戏角色半身像，正面或三分之二视角" as the framing.

## Fallback

If the input is sparse, create a conservative, recognizable design from the available role and world genre. If safety or consistency issues prevent using a detail, add a short warning in `warnings` and choose a neutral replacement.
