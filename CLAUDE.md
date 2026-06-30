# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Evolvria is an AI-driven, local-first narrative/world-simulation game rebuilt on **Tauri 2 + Vue 3 + Vue Router + Tailwind CSS**. The player seeds a world and characters; AI expands it into structured state, resolves player actions, simulates autonomous NPC/faction activity, and preserves memory, timeline, maps, saves, and AI logs across sessions.

Most docs and all user-facing strings are in **Chinese**. Keep UI text, errors, and logs in Chinese.

## Commands

```bash
yarn install
yarn dev            # browser-only Vite dev server (no Tauri shell)
yarn tauri:dev      # full native app; runs beforeDevCommand `yarn dev:tauri` then opens the Tauri window
yarn tauri:build
yarn typecheck      # vue-tsc --noEmit
yarn build          # typecheck + vite build (also used as Tauri beforeBuildCommand)
yarn test           # vitest run (unit tests in tests/, jsdom, excludes tests/e2e)
yarn test:ui        # playwright test (e2e in tests/e2e; auto-starts `yarn dev` on :5174)

cd src-tauri && cargo test
```

Run a single test:

```bash
yarn test tests/domain.test.ts              # one vitest file
npx vitest run -t "rejects patches"         # one vitest test by name
yarn test:ui tests/e2e/app.spec.ts          # one playwright file
yarn test:ui --grep "pattern"               # playwright by title pattern
```

`yarn dev:tauri` (note: not `tauri:dev`) is the custom Vite server manager at `scripts/tauri-dev-server.mjs`. It reuses an already-running Evolvria Vite server on port 5174 or starts `vite --host 127.0.0.1 --port 5174 --strictPort`, restarting it when Vite's optimized-dep cache goes stale. It exists because Tauri's `devUrl` is pinned to `http://127.0.0.1:5174` (see `src-tauri/tauri.conf.json`); call it only via `tauri:dev`, not directly.

Mobile scaffolding uses Tauri 2 mobile:

```bash
yarn tauri android init
yarn tauri ios init
```

Android/iOS signing and store distribution are outside the current MVP.

## Architecture

The app is dual-targeted: it runs natively under Tauri 2 *and* as a plain browser app. **`src/services/tauri.ts` is the seam.** `isTauriRuntime()` checks for `__TAURI_INTERNALS__`, and `safeInvoke(command, args)` returns `null` when not under Tauri. Every persistence/AI service calls `safeInvoke(...)` and, on `null`, falls back to `localStorage` (or a local mock). Never call `@tauri-apps/api/core`'s `invoke` directly from services — go through `safeInvoke` so the browser fallback keeps working.

- `src/types/domain.ts` defines the schema v1 contracts (`SCHEMA_VERSION = 1`): world, character, location, faction, timeline, memory, thread, AI request log, settings, save payload, state patch, player-action result, platform capabilities.
- `src/domain/world.ts` owns **pure** world-state transitions: `createInitialPayload`, `applyPlayerAction`, `applyStatePatch`/`validatePatch`, `validatePayloadSchema`, `validateWorldConsistency`, `recordAiLog`, `movePlayerTo`, memory retrieval, timeline filters. Every function `structuredClone`s its input and returns a new payload — no mutation, no I/O.
- `src/services/ai.ts` owns usage estimation (`estimateUsage`) and the remote/local fork. `isGloscConfigured(settings)` (base URL + token both non-empty) gates remote calls: configured → `safeInvoke("call_glosc", ...)`, otherwise a deterministic local mock from `src/domain/fixtures.ts`. Remote `player_action` failures fall back to the mock with a warning. Request types (`purpose`): `world_expand`, `player_action`, `npc_simulation`, `memory_extract`, `summary_update`, `consistency_check`.
- `src/services/save.ts` and `src/services/settings.ts` provide the Tauri-backed persistence with `localStorage` fallback; both validate schema before writing.
- `src/stores/*` are Pinia stores. **`world.ts` is the orchestrator**: it wraps the pure domain functions, calls the AI service, records an AI log, and persists after each mutation. It enforces the *checkpoint-before-AI* rule — `submitPlayerAction` calls `saveAiCheckpoint` *before* `resolvePlayerAction`. `settings.ts`, `platform.ts` (capability detection via `get_platform_capabilities` + `reveal_or_share_path`), and `app.ts` (error/notice banners, focus state) round out the stores.
- `src/views/*` are routed Vue views (hash history, 12 routes — see `src/router/index.ts`). Hash history is deliberate so deep links work under Tauri's `file://`/asset loading.
- `src-tauri/src/lib.rs` owns native app data paths, atomic saves (`write_json_atomic`), rotating backups (`MAX_BACKUPS = 5`), AI checkpoints, zip export/import, map image handling, platform capability detection, opener integration, and the Glosc One HTTP call. All commands are registered in one `generate_handler!` in `run()`.

Path alias: `@` → `src` (configured in both `vite.config.ts` and `vitest.config.ts`).

## AI provider

Glosc One (`https://one.gloscai.com` default base URL) is an OpenAI-compatible chat-completions gateway; the default model is `deepseek/deepseek-v4-pro` (`DEFAULT_GLOSC_MODEL` in `src/services/settings.ts`). Rust normalizes the base URL to `…/v1/chat/completions` (`chat_endpoint` in `lib.rs`) and sends `response_format: json_object`. The token is **not** read from an env var — it lives in settings (`glosc_token`), persisted via `save_settings`, and is passed into `call_glosc` per request. `check_glosc_connection` is a small test request for the settings UI.

## Key invariants

- Every AI request type must have a deterministic local mock or graceful local fallback; tests must not require real Glosc One.
- AI responses must be JSON-parseable and validated before mutating world state.
- `validatePatch` rejects patches that overwrite player-confirmed facts: character `name` (always), location `description`/`position` when `known_to_player`, and world `current_time`.
- Save payloads must remain schema v1 (`schema_version === 1` + the required array fields) unless `docs/data-model.md` and migration logic are updated. `validatePayloadSchema` (TS) and `validate_payload` (Rust) must stay in sync.
- AI usage logging is privacy-tiered: `recordAiLog` stores a `prompt_hash`, not the raw prompt, and `redactSensitive(...)` scrubs raw response content. Never log the Glosc token.
- Desktop and mobile share the same save schema. Platform differences belong in Tauri commands and UI adaptation, not domain logic.

## Documentation

`docs/` is the product and technical spec. Update it when changing data structures, AI contracts, platform behavior, save format, or core gameplay.
