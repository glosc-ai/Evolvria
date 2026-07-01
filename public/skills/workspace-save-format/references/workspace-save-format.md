# Evolvria Workspace Save Format Reference

## File Map

```text
app_data_dir/
  settings.json
  saves/
    active_world/
      AGENTS.md
      manifest.json
      state/payload.json
      world/OVERVIEW.md
      world/RULES.md
      memory/MEMORY.md
      maps/MAP.md
      maps/map_001.png
      characters/*.md
      locations/*.md
      history/TIMELINE.md
      threads/THREADS.md
    backups/
      active_world_*/
      ai_before_request/
  exports/
    world_id_YYYYMMDD_HHMMSS.zip
```

Legacy paths remain readable:

- `app_data_dir/saves/active_world.json`
- `app_data_dir/saves/backups/*.json`
- old export zips containing `payload.json`

## Frontend Responsibilities

- `src/services/world-workspace.ts` generates `AGENTS.md`, `manifest.json`, derived Markdown files, seed workspace context, and scoped player-action workspace context.
- `src/services/save.ts` validates `SavePayload`, writes browser fallback JSON and workspace bundles, imports both raw `SavePayload` JSON and `{ files: [{ path, content }] }` workspace bundles.
- `src/stores/world.ts` includes `workspace_context` in `buildAiContext`.
- `src/services/ai.ts` wraps `world_expand` as `{ seed, workspace_context }`.

## Native Responsibilities

- `src-tauri/src/lib.rs` reads `active_world/state/payload.json` first, then legacy `active_world.json`.
- `save_world` writes the folder workspace and migrates away from legacy active JSON.
- `save_ai_checkpoint` writes `backups/ai_before_request/`.
- `list_save_entries` returns active, checkpoint, and rolling backup folders; legacy JSON entries remain valid.
- `delete_save_entry` only deletes known save/checkpoint/backup paths.
- `export_world` writes workspace zip contents and map image assets.
- `import_world` prefers `state/payload.json`, falls back to `payload.json`, then restores supported map assets.

## AI Contract

`workspace_context` shape:

```json
{
  "workspace_format": "evolvria_workspace_v1",
  "instructions_path": "AGENTS.md",
  "instructions": "...",
  "loaded_files": [
    { "path": "AGENTS.md", "content": "..." }
  ],
  "available_files": ["AGENTS.md", "state/payload.json"],
  "loading_policy": "先遵循 AGENTS.md..."
}
```

Rules:

- `loaded_files[0].path` must be `AGENTS.md`.
- Do not load the full `state/payload.json` into normal player-action prompts.
- Use derived Markdown files to control context size.
- The remote model system prompt should say to follow `AGENTS.md` before other loaded files.
- The public skill `workspace-save-format` exposes these rules through `available_skills` and the deterministic `workspaceSaveFormat` tool.

## Documentation To Update

Update these when changing the format:

- `docs/save-load-and-sync.md`
- `docs/technical-architecture.md`
- `docs/prompt-and-response-contracts.md`
- `docs/data-model.md`
- `docs/map-import-and-annotation.md` if map asset paths change

## Test Coverage

Keep or add coverage for:

- workspace file generation includes `AGENTS.md` and `state/payload.json`
- AI context loads `AGENTS.md` first and only scoped files afterward
- browser bundle import reads `state/payload.json`
- Rust workspace export/import and save-entry behavior
- public skill manifest parsing for this skill
