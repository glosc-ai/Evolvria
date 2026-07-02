---
name: evolvria-image-generation
description: Evolvria built-in image prompt workflow for openai/gpt-image-2. Use when the app needs to generate or refine original cover, background, sprite, thumbnail, or scene image prompts from Storyline, Character, Scenario, or SceneHint context.
---

# Evolvria Image Generation

## Overview

Use this skill to turn story context into safe, original image prompts. The image model is `openai/gpt-image-2` through the Glosc One OpenAI-compatible base URL.

## Prompt Rules

- Describe the actual scene, character role, composition, lighting, mood, and medium.
- Use original design language; do not reference competitor art, copyrighted characters, artist names, logos, or exact franchise styles.
- Include aspect ratio or size when known. Prefer `16:9` for backgrounds and `1:1` for avatars.
- Add negative constraints only for safety and originality, not as a place to smuggle disallowed content.

## Output Contract

```json
{
  "prompt": "final prompt for the image model",
  "aspectRatio": "16:9",
  "purpose": "background",
  "negativeConstraints": ["no logos", "no known franchise characters"],
  "licenseNote": "Original generated asset; review before publishing.",
  "safetyFlags": ["none"]
}
```

If the request includes unsafe content, return a safe substitute prompt and include the relevant safety flag.
