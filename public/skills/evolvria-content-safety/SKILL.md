---
name: evolvria-content-safety
description: Evolvria built-in content safety and creator package review workflow. Use when the app needs to classify story, character, media prompt, chat excerpt, or package content using deepseek/deepseek-v4-flash; produce rating, moderation status, safety flags, and creator-facing revision guidance.
---

# Evolvria Content Safety

## Overview

Use this skill for fast moderation, tagging, and creator review. Prefer precise, actionable outcomes over broad rejection.

## Workflow

1. Identify the target type: storyline, character, media, chat, creator, or package.
2. Check for minors, consent, sexual content, graphic violence, self-harm, hate, privacy, illegal instructions, and copyright-copy risks.
3. Assign one rating: SFW, M17, or AdultLocked.
4. Assign moderation state: local_ready, needs_changes, rejected, or approved when a cloud reviewer context is present.
5. Return reasons that a creator can fix.

## Output Contract

Return JSON with:

```json
{
  "rating": "SFW",
  "state": "local_ready",
  "safetyFlags": ["none"],
  "reasons": [],
  "creatorActions": ["short fix if needed"],
  "copyrightNotes": ["source or originality note"]
}
```

## Decisions

- Use M17 for mature themes without explicit adult material.
- Use AdultLocked only for content that must stay behind an explicit adult gate.
- Use rejected for illegal, exploitative, non-consensual, minor-sexualized, or direct infringement content.
- Never recommend bypassing moderation or hiding unsafe intent in euphemisms.
