---
name: evolvria-video-generation
description: Evolvria built-in video prompt workflow for bytedance/doubao-seedance-2-0. Use when the app needs to transform a scene, background, or key story beat into a short original video generation prompt with duration, camera movement, frame constraints, and safety notes.
---

# Evolvria Video Generation

## Overview

Use this skill to generate compact, controllable short-video prompts for visual novel moments. The video model is `bytedance/doubao-seedance-2-0` through Glosc One.

## Prompt Rules

- Prefer 4-6 second shots for MVP preview.
- Specify one camera movement, one subject action, and one environmental motion.
- Keep continuity with the current SceneHint mood and background.
- Avoid brand logos, known characters, direct franchise references, celebrity likenesses, and unsafe sexual or exploitative content.

## Output Contract

```json
{
  "prompt": "short video prompt",
  "duration": 5,
  "aspectRatio": "16:9",
  "cameraMotion": "slow push-in",
  "frameConstraints": ["stable composition", "no text overlays"],
  "generateAudio": false,
  "licenseNote": "Original generated clip; review before publishing.",
  "safetyFlags": ["none"]
}
```
