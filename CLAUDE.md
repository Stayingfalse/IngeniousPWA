# IngeniousPWA — Claude Guide

This file is a short, high-signal set of rules for AI assistants.
Prefer reading `AGENTS.md` first; this is the condensed version.

## Non-Negotiables

- Do not change game rules, scoring, or win conditions unless explicitly requested.
- Do not change the WebSocket protocol ad-hoc.
  - All message shapes and shared types live in `shared/types.ts`.
- Keep `shared/` pure: no I/O, timers, DB, or WebSocket imports.

## Repo Workflow

- Use pnpm workspaces.
- Validate with:
  - `pnpm test` (shared Vitest suite)
  - `pnpm build` (shared + server + client)

## Versioning

- Every commit must bump the root `package.json` version (semver).
  - Small refactors/docs/config: PATCH
  - New feature: MINOR
  - Breaking/overhaul: MAJOR

## Style

- Favor small modules over large files.
- Avoid `any` / `as any`.
- Prefer explicit, typed boundaries and simple control flow.

