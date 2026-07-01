---
name: workspace-save-format
description: Evolvria workspace save-format guidance for maintaining folder-based world saves. Use when changing save/load/export/import logic, AI workspace_context prompts, AGENTS.md loading, state/payload.json compatibility, map asset persistence, browser workspace bundles, or docs/tests for the Evolvria save system.
---

# Workspace Save Format

Use this skill before touching Evolvria save persistence or AI context assembly.

Core rule: a world save is a folder-style workspace. `AGENTS.md` is the AI entrypoint; `state/payload.json` is the authoritative machine-readable `SavePayload`; Markdown files are derived context for AI and humans.

## Workflow

1. Inspect the current implementation before editing:
   - `src/services/world-workspace.ts`
   - `src/services/save.ts`
   - `src-tauri/src/lib.rs`
   - `src/stores/world.ts`
   - `src/services/ai-skills.ts`
2. Preserve compatibility with legacy single-file JSON saves.
3. Keep `AGENTS.md` first in any `workspace_context.loaded_files`.
4. Keep `state/payload.json` schema v1 as the source of truth.
5. Update docs and tests when changing paths, workspace files, prompt contracts, import/export behavior, or generated Markdown.
6. Verify with `yarn typecheck && yarn test` and `cd src-tauri && cargo test`.

## Implementation Rules

- Tauri active save path is `app_data_dir/saves/active_world/`.
- Tauri active payload path is `app_data_dir/saves/active_world/state/payload.json`.
- AI checkpoint path is `app_data_dir/saves/backups/ai_before_request/`.
- Backups are folder snapshots under `app_data_dir/saves/backups/active_world_*/`.
- Browser fallback stores both `evolvria.active_world` and virtual workspace bundle `evolvria.active_workspace`.
- Export zip must include `AGENTS.md`, `manifest.json`, `state/payload.json`, generated Markdown files, and supported `maps/` assets.
- Import zip must prefer `state/payload.json` and remain compatible with legacy `payload.json`.
- `workspace_context` for player actions must load only scoped files: `AGENTS.md`, world/rules, memory, map index, current location, participating characters, threads, and timeline index.

## Detailed Reference

Read `references/workspace-save-format.md` when changing the file layout, generated Markdown contents, native import/export behavior, runtime skill registration, or docs/tests.
