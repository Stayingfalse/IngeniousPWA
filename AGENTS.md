# IngeniousPWA — AI Agent Guide

This repository is a small, self-contained monorepo for a multiplayer board game implemented as a PWA.
It is optimized for clarity, determinism, and ease of deployment.

If you are an AI agent working on this repo, your job is to preserve the existing game rules and network protocol while improving maintainability.

## Project Philosophy

### Authoritative State

- **Server authoritative**: the server is the source of truth for game state.
- **Shared rules**: core rules live in `shared/` and are reused by server and client.
- **Deterministic gameplay**: avoid adding non-determinism to scoring, legality, or turn logic.

### State Boundaries

- `shared/`: pure, side-effect free utilities and types.
- `server/`: side effects (WebSocket I/O, persistence, timers), lobby lifecycle, game orchestration.
- `client/`: UI, UX, and client-side state (Zustand). Client state is derived from server messages.

### DX Priorities

- Prefer **small, local modules** over “god files”.
- Prefer **explicit types** over implicit coercions.
- Prefer **boring, readable code** over cleverness.

## Structural Rules

### Workspace Layout

- Root scripts orchestrate the three packages (`shared`, `server`, `client`) via pnpm workspaces.
- Do not introduce new top-level packages unless the boundary is extremely clear.

### Where New Code Goes

- Shared domain logic or message shapes: `shared/`.
- Server orchestration, persistence, timers, WebSockets: `server/`.
- React components and client UX: `client/src/`.

### Import Rules

- `shared/` must not import from `server/` or `client/`.
- `server/` and `client/` may import from `shared/`.
- Avoid circular dependencies inside a package; if one appears, extract a small shared helper.

### File Naming

- TypeScript/TSX files: `camelCase.ts` and `PascalCase.tsx`.
- React components: `PascalCase.tsx`.
- Zustand stores: `camelCaseStore.ts` (existing pattern: `lobbyStore.ts`, `gameStore.ts`).
- Keep file names aligned with their primary export.

## Formatting & Syntax

### TypeScript Strictness

- Keep all new exported functions and public APIs typed.
- Avoid `any` and `as any`. If you must use an assertion, use the narrowest type possible and justify it in code structure (not comments).

### Functions and Data

- Prefer pure functions in `shared/`.
- Prefer passing explicit arguments instead of reading globals.
- Keep data shapes stable; any protocol changes must update `shared/types.ts`.

### Error Handling

- Server: return `{ error: 'CODE' }` style results from service methods (existing pattern in `LobbyManager`).
- WebSocket errors to clients must be sent as `{ type: 'ERROR', code, message }`.

### Comments

- Add comments only when encoding non-obvious rules or invariants.
- Prefer renaming/refactoring over explanatory comments.

## Never Do (Anti “AI Slop” Rules)

- Do not change game rules or scoring behavior unless explicitly requested.
- Do not add deeply nested ternaries.
- Do not add side effects to getters / computed state.
- Do not create “utility” modules that mix unrelated concerns.
- Do not introduce new state management libraries on the client.
- Do not bypass the shared message protocol by adding ad-hoc JSON shapes.

## Validation

- Use `pnpm test` (runs `shared` tests).
- Use `pnpm build` (builds `shared`, `server`, `client`).

