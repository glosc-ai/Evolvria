# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Evolvria is an AI-driven, local-first narrative/world-simulation game built in **Godot 4.7 (Mobile renderer)** with **GDScript**. The player seeds a world and characters; AI expands it into a structured world, resolves player actions, simulates autonomous NPCs/factions, and maintains a memory + timeline that persists across sessions. The app is free; AI calls go through a paid **Glosc One** endpoint (OpenAI-compatible `/v1/chat/completions`). When Glosc One is not configured, every AI call falls back to a deterministic **local mock** baked into `ai_service.gd` so the game (and tests) run fully offline.

Most docs and all in-game/user-facing strings are in **Chinese** — match that when editing UI text or writing log messages.

## Commands

Godot binary on this machine: `/Applications/Godot.app/Contents/MacOS/Godot` (4.7.stable). There is no CI, build script, or package manager — run Godot directly with `--headless` and a test scene.

```bash
GODOT="/Applications/Godot.app/Contents/MacOS/Godot"

# Full offline smoke test — exercises world creation, player actions, memory,
# saves/backups, export/import, map gen. Exits 0 on pass, 1 on first failed _assert.
"$GODOT" --headless --path . res://scenes/smoke_test.tscn

# Other test scenes (each is a Node that self-runs in _ready and quits):
"$GODOT" --headless --path . res://scenes/ai_response_fixture_test.tscn   # AI response-contract validation
"$GODOT" --headless --path . res://scenes/ui_breakpoint_test.tscn         # renders every screen at desktop/phone/tablet sizes
"$GODOT" --headless --path . res://scenes/visual_screenshot_test.tscn     # writes PNGs to res://output/visual_screenshots/latest

# Live remote test against real Glosc One (needs a key; NOT offline):
EVOLVRIA_TEST_KEY="<token>" "$GODOT" --headless --path . res://scenes/remote_glosc_smoke_test.tscn

# Verify export presets / template install:
"$GODOT" --headless --path . --script res://tools/verify_export_presets.gd

# Run the actual app:
"$GODOT" --path .
```

There is no granular single-test runner — `smoke_test.gd` is one long sequence of `_assert(condition, message)` calls; to focus on one area, temporarily comment out later assertions or read the failing `push_error` message. Always re-run the full smoke test before considering a change to the autoloads done.

## Architecture

The app is a single `Control` scene (`scenes/app.tscn` → `scripts/ui/app.gd`) driven by **autoload singletons**. `app.gd` is a ~4000-line immediate-mode-ish UI that rebuilds screens based on `AppState.current_route`; all game logic lives in the autoloads, not the UI.

Autoloads (registered in `project.godot`, order matters — later ones depend on earlier):

- **AppState** (`app_state.gd`) — routing (`navigate`/`navigate_with_notice`), `current_world_id`, and global error/notice banners via signals. Route names are `StringName`s: `main_menu`, `onboarding`, `new_world`, `exploration`, `timeline`, `characters`, `locations`, `world_lore`, `threads`, `map`, `saves`, `settings`.
- **SettingsStore** (`settings_store.gd`) — flat `settings` Dictionary persisted to `user://settings.json`. Source of truth for Glosc config and behavior flags (`confirm_ai_calls`, `auto_retry`, `log_level`, `content_preferences`, etc.). `is_glosc_configured()` gates remote vs. local-mock everywhere. The Glosc token is stored in plaintext in `user://settings.json` — guarded by `can_store_glosc_token()` + a risk acknowledgement flag; do not loosen that.
- **SaveManager** (`save_manager.gd`) — JSON saves under `user://saves/`. Atomic active save (`active_world.json` via `.tmp`), rolling auto-backups (max 5), an **AI pre-request checkpoint** captured before each AI call for rollback, and ZIP world export/import under `user://exports/`. `validate_payload_schema()` enforces `schema_version` (currently 1) and required collections.
- **WorldStore** (`world_store.gd`) — the world state hub: `world`, `characters`, `locations`, `factions`, `timeline`, `memories`, `threads`, `ai_logs`. Owns the gameplay verbs (`create_world`, `submit_player_action`, `advance_day`, `run_*` for AI passes), `build_ai_context()` (memory retrieval + scene assembly sent to AI), and `apply_state_patches()` which **rejects patches that overwrite locked/player-confirmed fields** (character name, confirmed location descriptions). `SCHEMA_VERSION` lives here.
- **AIService** (`ai_service.gd`) — the AI orchestration layer. Each request type (`world_expand`, `player_action`, `npc_simulation`, `memory_extract`, `summary_update`, `consistency_check`) has a method that: estimates usage → optionally awaits user confirmation → if `is_glosc_configured()` calls `_call_glosc` (raw `HTTPClient`, retry, timeout, cancellation, 512 KB cap, OpenAI-shape parsing in `parse_response_body`), else returns a deterministic local-mock Dictionary. Emits `ai_request_started/finished/failed/confirmation_requested`.
- **SimulationEngine** (`simulation_engine.gd`) — small helper; given a snapshot, asks AIService to generate autonomous NPC events.

Map generation: `scripts/generation/fantasy_map_generator.gd` (`FantasyMapGenerator`, RefCounted) procedurally generates an Azgaar-style fantasy map (heightmap noise → biomes → coastlines/rivers → routes); also supports deriving a structured map from an imported reference image. Generated maps carry Azgaar/MIT attribution metadata that tests assert on.

### Key invariants (enforced by code + smoke test — preserve them)

- **Every AI request type must work in local-mock mode** and return the same Dictionary shape the remote path produces. Adding a request type means updating both branches in `ai_service.gd` and adding a fixture/assertion.
- **AI responses must be parseable JSON** and pass validation before mutating world state; invalid/conflicting responses leave the world unchanged.
- **State patches cannot overwrite player-confirmed facts** or run the timeline backwards.
- **Schema changes** require bumping `SCHEMA_VERSION` and updating `validate_payload_schema()` + docs in `docs/data-model.md`.
- **AI usage logging is privacy-tiered** by `log_level` (`default`/`debug`/`deep`); `deep` stores only `[已脱敏]` redacted raw responses. Never log the Glosc token.

## Documentation

`docs/` is the spec (Chinese). Treat it as authoritative for design intent and keep it in sync when behavior changes. Most relevant when coding:

- `docs/technical-architecture.md` — module map, data flow, local-first principle.
- `docs/data-model.md` — entity schemas and ID conventions (`world_*`, `char_*`, `loc_*`, `evt_*`, `mem_*`, `fac_*`, `map_*`; IDs are system-generated).
- `docs/glosc-one-api-integration.md` — Glosc One request/response contracts.
- `docs/prompt-and-response-contracts.md`, `docs/ai-memory-system.md`, `docs/world-simulation.md`, `docs/save-load-and-sync.md`, `docs/map-import-and-annotation.md`, `docs/testing-strategy.md`, `docs/development-workflow.md`.

`docs/development-workflow.md` defines the pre-commit checklist: app must launch, new data structures documented, AI fixtures updated when response shapes change, schema version bumped on save-format changes, and UI changes checked at desktop/phone/tablet sizes (the `ui_breakpoint_test` scene covers this).

## Conventions

- GDScript is statically typed throughout (typed vars, typed Dictionaries/Arrays, explicit casts). Match the surrounding `snake_case` style and the `_private` prefix for internal funcs/vars.
- Files are `eol=lf` (`.gitattributes`); indentation is tabs.
- `.godot/`, `output/`, and `Web-Prototype/` are gitignored. `Web-Prototype/` is a separate prototype, not the shipping client.
- Export targets (`export_presets.cfg`): Web, macOS, Windows Desktop, Linux. Web export excludes `scripts/tests/**`, `tools/**`, `docs/**`, and `*test.tscn`.
