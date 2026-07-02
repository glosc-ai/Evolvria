# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Evolvria is a local-first AI interactive-narrative studio built on **Tauri 2 + Vue 3 + Vite + Pinia**. It reproduces the *product experience* of ISEKAI ZERO (storyline discovery, character cards, persona launch, AI chat, visual-novel scene mode, Dungeon Mind fate rolls, creator studio, credits, moderation) — but only as feature parity, never copying the competitor's brand, assets, private APIs, user content, or prompt text. Seed storylines are original Chinese content.

`AGENTS.md` is the authoritative agent guide (commands, boundaries, gotchas) and `docs/` holds the 16-part spec (research → product → design → engineering → ops → testing → roadmap). Read `docs/README.md` first when you need product/design detail. This file focuses on commands and the architecture that spans multiple files.

## Commands

Package manager is **Yarn 1** (`packageManager: yarn@1.22.22`); use `yarn install --frozen-lockfile` for CI-like repro.

```bash
yarn install
yarn dev                  # Vite dev server (browser preview)
yarn dev:tauri            # Same server, fixed 127.0.0.1:5174 --strictPort (used by Tauri + Playwright)
yarn typecheck            # vue-tsc --noEmit
yarn test                 # Vitest (jsdom, globals, tests/**/*.test.ts only)
yarn build                # typecheck + vite build
yarn e2e                  # Playwright (desktop + mobile projects)
yarn tauri:dev            # Full Tauri desktop app
yarn tauri:build          # Build desktop installer

cd src-tauri && cargo test         # Rust command tests
```

Focused runs:

```bash
yarn test tests/domain.test.ts
yarn test -g "creates seed content"          # by test name
yarn e2e tests/e2e/app.spec.ts --project=desktop   # single Playwright project
cd src-tauri && cargo test <name>            # single Rust test
```

Playwright's `webServer` runs `yarn dev:tauri` with `reuseExistingServer: true` on port 5174 — if E2E seems to run stale code, kill any lingering dev server first.

## Architecture

### Layered frontend (the critical boundary)

Strict layering — violating it is the most common mistake:

- **`src/domain/`** — *pure* business logic. Must stay DOM-, Tauri-, and network-free. This is where chat state machines (`chat-reducer`), summarization (`summary`), fate rolls (`fate-engine`), moderation (`moderation`), token/cost budgeting (`cost`), billing, creator-package validation, storyline duplication, and workspace package verify live. Covered by `tests/domain.test.ts`.
- **`src/services/`** — the only layer allowed to touch persistence, media, native commands, network, and secrets. Vue components must **never** call Tauri `invoke` directly — go through a service wrapper.
- **`src/stores/app.ts`** — one large Pinia store (`useAppStore`, ~80 KB) that orchestrates everything: wires domain functions to services and UI state. Its getters derive sorted/filtered lists from `envelope.entities.*` (storylines, chats, moderation queue, ledger, sync ops, …). Most cross-cutting state lives here.
- **`src/views/`** — route-level components, wired in `src/router/index.ts`.

### The data model: one envelope, persisted everywhere

Everything is a `SaveEnvelope` (`src/types/domain.ts`), `schemaVersion: "1.0.0"`, containing:
- `workspace` — id/name/timestamps
- `entities: EntityStore` — ~20 `Record<string, T>` maps (characters, storylines, scenarios, mediaAssets, personas, chats, chatCheckpoints, messages, summaryChapters, arcs, dungeonMindConfigs, fateChecks, creditLedger, creditAdjustments, moderationCases, creatorEarnings, engagementStats, mediaGenerationJobs, syncOperations, syncConflicts)
- `indexes`, `settings`, `audit`

This single envelope is the unit of persistence. Tauri writes it atomically as `save.json` under `appData/workspaces/{workspaceId}/` (plus `manifest.json`, `assets/`, `backups/`, `logs/`). Browser preview falls back to `localStorage["evolvria:workspace:active"]`. `normalizeEnvelope()` in `services/repositories/workspace.ts` is the migration/shape gate both paths go through.

### Dual-runtime: browser preview vs Tauri

Every service must work in **both** runtimes. The seam is `src/services/tauri.ts`:
- `isTauriRuntime()` checks `window.__TAURI_INTERNALS__`.
- `invokeOptional(cmd, args)` returns `undefined` in the browser (instead of throwing), so callers fall back to localStorage / download / mock behavior.

When you add a native command, update **three** places: the Rust `#[tauri::command]` + `generate_handler!` list in `src-tauri/src/lib.rs`, the frontend service wrapper, and `src-tauri/capabilities/default.json` if it needs a new permission scope (currently only `core`, `dialog`, `fs`, `opener` defaults).

### AI narrative pipeline

Provider routing is in `src/services/ai/index.ts` (`generateNarrative`):
- `mock` (default, offline, reliable for demos/E2E) → `services/ai/mock.ts`
- `openai-compatible` → runs only if a saved key exists
- `local-http` → runs without a key (localhost endpoints only)
- `cloud-proxy` → not yet implemented

Prompt assembly is layered in `services/ai/context.ts` (`buildNarrativePromptBundle`): 10 ordered layers — `system_policy → product_safety → storyline_world → character_voices → persona → scenario → memory → active_arc → fate_results → output_contract` — plus recent messages and the final user message. Contract version is `evolvria-narrative-v1.0.0` (`NARRATIVE_PROMPT_CONTRACT_VERSION`); the mock provider echoes it back. Don't leak prompt text or keys into prompt previews — `redactPromptPreviewContent` exists and is tested.

### Tauri commands (Rust side)

All native surface is in `src-tauri/src/lib.rs`: workspace list/create/read/write/backup, zip export+import (with entry/size/path-traversal limits), media import/pick/thumbnail/data-url, keychain-backed secret set/get/delete, log export, and `content_package_verify` (validates envelope schema, manifest consistency, asset references vs. physical files, and flags secret-like text like `sk-…`/`bearer`).

## Hard constraints (see AGENTS.md for full detail)

- **No API keys** in `save.json`, logs, prompt previews, exports, or tests. Browser preview secrets are `localStorage["evolvria:secret:*"]`; Tauri uses the OS keychain. The insecure file fallback only activates with `EVOLVRIA_ALLOW_INSECURE_SECRET_FILE=1`; `EVOLVRIA_OPENAI_COMPATIBLE_API_KEY` overrides the saved key.
- **Path safety**: workspace IDs, entity IDs, asset relative paths, and zip entries are validated in Rust to stay inside the workspace dir. When touching import/export or media paths, preserve these checks.
- **Original content only**: do not introduce ISEKAI ZERO brands/assets/private APIs/user content/prompt text. Tests assert seed titles never include `ISEKAI` and moderation blocks risky copyright/competitor references.

## UI / test quirks

- Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config`); shadcn-vue `new-york` style, neutral base color, aliases `@/components`, `@/lib`. Note: `@/components/ui` is not yet populated. Custom design tokens live in `src/styles.css` (dark-first palette).
- Vitest config (`vitest.config.ts`) only globs `tests/**/*.test.ts` — add new unit tests there or edit the config deliberately. It does not pick up `*.spec.ts`.
- Playwright covers `desktop` and `mobile` projects; pass `--project=` to scope. E2E state lives in browser localStorage within a flow, so tests create/reset data through the UI rather than assuming a fresh native workspace.
