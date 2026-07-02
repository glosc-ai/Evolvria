---
name: evolvria-summary-arc
description: Evolvria built-in long-context summarization and Arc maintenance workflow. Use when the app needs to compact chat history, create or revise SummaryChapter records, update relationship deltas, or plan next Arc beats using deepseek/deepseek-v4-flash.
---

# Evolvria Summary Arc

## Overview

Use this skill to preserve durable narrative memory while keeping prompts small. Summaries must be factual, auditable, and useful for future turns.

## Workflow

1. Separate durable facts from mood, prose, and speculation.
2. Record relationship changes only when supported by message evidence.
3. Keep unresolved threads short and actionable.
4. Update Arc beats by status: open, done, skipped.
5. Never invent facts to make a cleaner summary.

## Output Contract

```json
{
  "title": "short chapter title",
  "summary": "compact factual summary",
  "facts": ["durable fact"],
  "relationshipDeltas": [
    {
      "sourceId": "persona-or-character-id",
      "targetId": "character-id",
      "summary": "relationship change",
      "weight": 1
    }
  ],
  "unresolvedThreads": ["thread to remember"],
  "arcBeats": [
    { "title": "beat", "status": "open" }
  ]
}
```
