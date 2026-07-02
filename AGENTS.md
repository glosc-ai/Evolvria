# Agent Notes

## Commands

- Use Yarn 1 (`packageManager` is `yarn@1.22.22`); install with `yarn install --frozen-lockfile` when reproducing CI-like setup.
- Frontend dev server is always `127.0.0.1:5174` with `strictPort`; `yarn dev` and `yarn dev:tauri` both use that port.
- Verification commands: `yarn typecheck`, `yarn test`, `yarn build`, `yarn e2e`, and `cd src-tauri && cargo test`.
- Focused tests: `yarn test tests/domain.test.ts`, `yarn e2e tests/e2e/app.spec.ts --project=desktop`, or add `-g "test name"`; Rust tests run from `src-tauri` with `cargo test <name>`.
- Playwright starts `yarn dev:tauri` via `webServer` and reuses an existing server on port `5174`; stop stale dev servers if E2E appears to run old code.

## Architecture Boundaries

- App stack is Tauri 2 + Vue 3 + Vite + Pinia; frontend entrypoints are `src/main.ts`, `src/App.vue`, and `src/router/index.ts`.
- `src/stores/app.ts` is the main orchestration store for workspace state, chat, creator flows, sync preview, billing, and moderation.
- Keep pure business logic in `src/domain/`; it should stay DOM/Tauri/network-free and is covered by `tests/domain.test.ts`.
- Access persistence, media, native commands, and secrets through `src/services/**`; Vue components should not call Tauri `invoke` directly.
- Tauri runtime detection is centralized in `src/services/tauri.ts`; browser preview returns `undefined` from `invokeOptional` and falls back to localStorage/download behavior.
- Native commands are registered in `src-tauri/src/lib.rs`; when adding one, update both the `generate_handler!` list and the frontend service wrapper.
- Review `src-tauri/capabilities/default.json` with native changes; it currently only grants core, dialog, fs, and opener defaults.

## Data And Security Gotchas

- Browser preview stores the active workspace under `localStorage` key `evolvria:workspace:active`; Tauri stores JSON workspaces under the app data `workspaces/{workspaceId}` directory.
- Browser preview provider keys are localStorage fallbacks (`evolvria:secret:*`); Tauri keys should use the OS keychain.
- Rust secret file fallback is disabled unless `EVOLVRIA_ALLOW_INSECURE_SECRET_FILE=1`; `EVOLVRIA_OPENAI_COMPATIBLE_API_KEY` can override the OpenAI-compatible key.
- `local-http` provider endpoints must stay localhost-only; `openai-compatible` may use remote HTTPS/http base URLs.
- Do not put API keys in `save.json`, logs, prompt previews, exports, or tests; existing tests assert prompt preview redaction.
- Import/export and media paths must remain path-traversal safe; Rust limits import entries, total zip bytes, media import bytes, and preview bytes in `src-tauri/src/lib.rs`.

## Product Constraints

- This repo intentionally implements Evolvria-owned content only; do not copy ISEKAI ZERO brands, assets, private APIs, user content, or prompt text.
- Seed storylines are original Chinese content; tests assert no seed title includes `ISEKAI` and moderation blocks risky copyright/competitor references.
- Mock AI is the default reliable path for offline demos and E2E; `openai-compatible` only runs when a saved key exists, while `local-http` can run without a key.

## UI And Test Quirks

- Tailwind CSS v4 is loaded via `@tailwindcss/vite`; shadcn-vue config is `components.json` with `new-york`, neutral base color, and aliases under `@/components` and `@/lib`.
- Vitest uses jsdom, globals, and only includes `tests/**/*.test.ts`; add new unit tests there or update `vitest.config.ts` deliberately.
- Playwright covers both `desktop` and `mobile` projects by default; use a project flag for quicker focused checks.
- E2E state persists in browser localStorage within a test flow, so tests generally create or reset data through app UI rather than assuming a fresh native workspace.
