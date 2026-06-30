# CLAUDE.md

This file provides guidance when working in this repository.

## Project

Evolvria is an AI-driven, local-first narrative/world-simulation game rebuilt on **Tauri 2 + Vue 3 + Vue Router + Tailwind CSS**. The player seeds a world and characters; AI expands it into structured state, resolves player actions, simulates autonomous NPC/faction activity, and preserves memory, timeline, maps, saves, and AI logs across sessions.

Most docs and all user-facing strings are in **Chinese**. Keep UI text, errors, and logs in Chinese.

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm test:ui
pnpm tauri:dev
pnpm tauri:build

cd src-tauri && cargo test
```

Mobile scaffolding uses Tauri 2 mobile:

```bash
pnpm tauri android init
pnpm tauri ios init
```

Android/iOS signing and store distribution are outside the current MVP.

## Architecture

- `src/types/domain.ts` defines the schema v1 world, character, location, timeline, memory, thread, AI log, settings, and save payload contracts.
- `src/domain/world.ts` owns pure world-state transitions: world creation, state patch validation, player action application, map annotations, relationships, memories, timeline filters, and consistency checks.
- `src/services/ai.ts` owns usage estimation, local deterministic mock fallback, and Glosc One invocation through Tauri commands.
- `src/services/save.ts` and `src/services/settings.ts` provide browser fallback plus Tauri-backed persistence.
- `src/stores/*` are Pinia stores that connect UI, persistence, AI, and platform capabilities.
- `src/views/*` are routed Vue views for menu, onboarding, new world, exploration, map, characters, locations, timeline, threads, world lore, saves, and settings.
- `src-tauri/src/lib.rs` owns native app data paths, atomic saves, backups, zip export/import, map image handling, platform capability detection, opener integration, and Glosc One HTTP calls.

## Key invariants

- Every AI request type must have a deterministic local mock or graceful local fallback; tests must not require real Glosc One.
- AI responses must be JSON-parseable and validated before mutating world state.
- State patches cannot overwrite player-confirmed facts such as character names or confirmed location descriptions.
- Save payloads must remain schema v1 unless `docs/data-model.md` and migration logic are updated.
- AI usage logging is privacy-tiered; never log the Glosc token. Deep logs must redact raw sensitive content.
- Desktop and mobile share the same save schema. Platform differences belong in Tauri commands and UI adaptation, not domain logic.

## Documentation

`docs/` is the product and technical spec. Update it when changing data structures, AI contracts, platform behavior, save format, or core gameplay.
