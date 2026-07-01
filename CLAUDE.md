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
- `src/domain/world.ts` owns **pure** world-state transitions: `createInitialPayload`, `applyPlayerAction`, `applyStatePatch`/`validatePatch`, `validatePayloadSchema`, `validateWorldConsistency`, `recordAiLog`, `movePlayerTo`, memory retrieval, timeline filters. Every function `structuredClone`s its input and returns a new payload — no mutation, no I/O. `src/domain/azgaar-map.ts` deterministically generates map regions/locations/routes from a `WorldSeed` (seeded RNG over `stableHash`), attributing the Azgaar generator (MIT).
- `src/services/ai.ts` is the AI entrypoint and the remote/local fork. `isGloscConfigured(settings)` (base URL + token both non-empty) gates remote calls; otherwise a deterministic local mock from `src/domain/fixtures.ts`. Request `purpose`s (`PURPOSE_LABELS`): `world_expand`, `player_action`, `npc_simulation`, `memory_extract`, `summary_update`, `consistency_check`, `character_image`. Remote calls go through the internal `callGlosc()`, which is **JS-first, native-fallback** — see the AI provider section.
- `src/services/ai-sdk.ts` is the primary AI path: the **Vercel AI SDK** (`ToolLoopAgent` from the `ai` package + `@ai-sdk/openai` provider) runs a bounded tool loop (`stopWhen: isStepCount(6)`) against the OpenAI-compatible Glosc endpoint, validates the final JSON output against a Zod schema (`playerActionAiSchema` for `player_action`, otherwise `aiSdkJsonObjectSchema`), and returns structured usage.
- `src/services/ai-skills.ts` registers the built-in skills the agent may call (`initializeWorld`, `createWorld`, `advanceWorldProgress`, `triggerPlayerAction`, `recordEvent`/`logEvent`, `generateCharacter`, plus workspace/MCP helpers). Each skill is pre-bound to the current request's seed/action/context/payload at runtime — agents pass minimal args, never the whole payload. Public skill docs are discovered from `public/skills/manifest.json`, which Vite generates by scanning `public/skills/*/SKILL.md`; custom skill folders without built-in implementations are exposed as reference tools that return their markdown content.
- `src/services/game-mcp.ts` is a **restricted in-process game MCP** (server script `scripts/evolvria-mcp.mjs`) scoped to the active world workspace, schema-v1 payload, save backups, and a controlled character-fields allowlist. `gameMcpCapabilityManifest()` advertises permissions by risk (`read`/`write`/`destructive`).
- `src/services/world-workspace.ts` projects a `SavePayload` into a virtual `evolvria_workspace_v1` file tree (`AGENTS.md`, `manifest.json`, `world/`, `memory/`, `maps/`, `history/`, `threads/`, per-character/location markdown, `state/payload.json`) and `buildWorkspaceAiContext()`/`buildSeedWorkspaceAiContext()` inject only the files relevant to the current request. The agent must follow `AGENTS.md`'s loading order before other files.
- `src/services/save.ts` and `src/services/settings.ts` provide the Tauri-backed persistence with `localStorage` fallback; both validate schema before writing. `src/services/ids.ts` (`makeId`, `stableHash`) and `src/services/text.ts` (`splitTags`, `clamp`, `nowIso`, `redactSensitive`) are small shared utilities.
- `src/stores/*` are Pinia stores. **`world.ts` is the orchestrator**: it wraps the pure domain functions, calls the AI service, records an AI log, and persists after each mutation. It enforces the *checkpoint-before-AI* rule — `submitPlayerAction` calls `saveAiCheckpoint` *before* `resolvePlayerAction`. `settings.ts`, `platform.ts` (capability detection via `get_platform_capabilities` + `reveal_or_share_path`), and `app.ts` (error/notice banners, focus state) round out the stores.
- `src/views/*` are routed Vue views (hash history, 12 routes — see `src/router/index.ts`). Hash history is deliberate so deep links work under Tauri's `file://`/asset loading.
- `src-tauri/src/lib.rs` owns native app data paths, atomic saves (`write_json_atomic`), rotating backups (`MAX_BACKUPS = 5`), AI checkpoints, zip export/import, map image handling, platform capability detection, opener integration, and the Glosc One HTTP call. All commands are registered in one `generate_handler!` in `run()`.

Path alias: `@` → `src` (configured in both `vite.config.ts` and `vitest.config.ts`).

## UI layer (shadcn-vue + Reka UI + Tailwind v4)

The UI is a **shadcn-vue** design system (style `new-york`, base color `neutral`, `components.json`) built on **Reka UI** primitives and **Lucide** icons, themed via `src/styles.css` (dark theme with an Emerald accent, CJK font stack). Tailwind v4 is loaded through `@tailwindcss/vite` (`@import "tailwindcss"` in `src/styles.css`); `tailwind.config.ts` remains for theme tokens/animations. Note `package.json` lists both `@lucide/vue` and `lucide-vue-next` — use `lucide-vue-next`.

- `src/components/ui/<component>/` holds the shadcn-vue generated primitives (button, card, dialog, alert-dialog, input, select, textarea), each re-exported via `src/components/ui/index.ts`. These are owned/edited files, not a versioned dependency — regenerate with the shadcn-vue CLI rather than hand-rolling equivalents. The single-file `src/components/ui/<Name>.vue` style is the old layout and is being removed (see git status).
- `src/lib/utils.ts` exports `cn(...)` (`clsx` + `tailwind-merge`) — use it to merge Tailwind classes; `class-variance-authority` powers the component variants.
- App-specific wrappers like `src/components/AppSelect.vue` compose the `ui/select` primitives and accept a `class` prop forwarded through `cn`. Prefer building on the `ui/*` primitives over writing raw form controls in views.

## AI provider

Glosc One (`https://one.gloscai.com` default base URL) is an OpenAI-compatible chat-completions gateway; the default model is `deepseek/deepseek-v4-pro` (`DEFAULT_GLOSC_MODEL` in `src/services/settings.ts`). The token is **not** read from an env var — it lives in settings (`glosc_token`), persisted via `save_settings`, and is passed into each request. `check_glosc_connection` is a small test request for the settings UI.

When Glosc is configured, `src/services/ai.ts`'s internal `callGlosc(purpose, payload, settings, maxOutputTokens)` runs a **three-tier** path, in order, returning the first success:

1. **JS-first — Vercel AI SDK** (`callAiSdkJson` in `src/services/ai-sdk.ts`): `ToolLoopAgent` against the OpenAI-compatible Glosc endpoint, with the built-in skills + game MCP as tools and a Zod-validated JSON output contract. Runs entirely in JS, so the browser (non-Tauri) build gets real AI calls — this is why the SDK is the primary path, not the native command.
2. **Native fallback** — if the SDK call errors, `safeInvoke("call_glosc", { request: { baseUrl, token, model, purpose, payload, timeoutSeconds } })` hands off to Rust, which normalizes the base URL to `…/v1/chat/completions` (`chat_endpoint` in `lib.rs`) and sends `response_format: json_object`. Under non-Tauri `safeInvoke` returns `null`, so this tier is desktop-only.
3. **Local mock** — `mockPlayerAction`/`localWorldExpansion` (and friends) from `src/domain/fixtures.ts`, with a warning attached.

So the browser build can still reach real AI via tier 1; tiers 2–3 only matter on desktop / when the SDK fails. `generateWorld` and `resolvePlayerAction` fall back to the mock with a warning on any failure. `character_image` reuses the same configured-vs-mock gate.

## Key invariants

- Every AI request type must have a deterministic local mock or graceful local fallback; tests must not require real Glosc One. The AI SDK `ToolLoopAgent` must stay bounded (`isStepCount`) — never unbounded loops.
- AI responses must be JSON-parseable and validated before mutating world state: Zod schema in the SDK path (`callAiSdkJson`), `isPlayerActionResult`/schema checks when normalizing, and `validate_payload` on the Rust path. The TS (`validatePayloadSchema`) and Rust (`validate_payload`) schema checks must stay in sync.
- Skills are pre-bound to the current request's seed/action/context/payload at runtime; agents pass minimal args and must not copy the whole payload into a tool call. The game MCP is restricted to the world workspace, schema-v1 payload, backups, and the character-field allowlist — never expose the Glosc token, `settings.json`, or arbitrary system paths to it.
- The workspace context (`buildWorkspaceAiContext`/`buildSeedWorkspaceAiContext`) loads only request-relevant files; the agent must follow `AGENTS.md`'s loading order first and must not fabricate facts from unloaded files.
- `validatePatch` rejects patches that overwrite player-confirmed facts: character `name` (always), location `description`/`position` when `known_to_player`, and world `current_time`.
- Save payloads must remain schema v1 (`schema_version === 1` + the required array fields) unless `docs/data-model.md` and migration logic are updated.
- AI usage logging is privacy-tiered: `recordAiLog` stores a `prompt_hash` (via `stableHash`), not the raw prompt, and `redactSensitive(...)` scrubs `Bearer …`/`sk-…` tokens. Never log the Glosc token.
- Desktop and mobile share the same save schema. Platform differences belong in Tauri commands and UI adaptation, not domain logic.

## Documentation

`docs/` is the product and technical spec. Update it when changing data structures, AI contracts, platform behavior, save format, or core gameplay.
