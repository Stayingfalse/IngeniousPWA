# IngeniousPWA

A fully self-contained multiplayer implementation of the board game **Ingenious** (*Einfach Genial* by Reiner Knizia, 2004) as a Progressive Web App. Everything runs inside a **single Docker container** — no external services required. One command and the game is live.

---

## Quick Start

**Docker (recommended)**
```bash
docker run -p 3000:3000 -v ingenious_data:/data ingenious
```

**Docker Compose**
```bash
docker compose up
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

**Local development**
```bash
pnpm install
pnpm --filter @ingenious/shared build
pnpm --filter @ingenious/server build
pnpm --filter @ingenious/client build
```

---

## What Is Ingenious?

Ingenious is a 2–4 player abstract strategy game played on a hexagonal grid. Players take turns placing double-hex domino tiles, each bearing two coloured symbols. After each placement, you score points by tracing rays outward from each placed hex and counting matching-coloured symbols. The twist: **your final score is your *lowest* colour**, so you must balance all six colours while racing to hit 18. Hit 18 on any colour and you shout "INGENIOUS!" and earn a bonus turn.

---

## How To Play

1. **Create or join a lobby** using a 6-character code.
2. The **host starts the game** once at least 2 players have joined.
3. On your turn, **select a tile** from your rack of 6, then **click two adjacent empty hexes** on the board to place it.
4. Your first placement must be adjacent to one of the six pre-printed start symbols on the board edge.
5. **Scores update automatically.** If any colour reaches 18, you earn a bonus turn.
6. After placing, you may **swap your rack** if you hold no tiles matching your lowest-scoring colour.
7. Your rack refills to 6 from the bag automatically.
8. The game ends when no legal placements remain, or a player reaches 18 in all 6 colours. The winner is the player with the **highest minimum-colour score**.

---

## Architecture

```
Single Docker container
│
├── Node.js 22 (Alpine)
├── Fastify HTTP + WebSocket server  ── port 3000
│   ├── Serves pre-built Vite PWA static files
│   └── Handles all WebSocket game messages
├── SQLite (better-sqlite3)  ── /data/ingenious.db
│   └── Persisted via Docker volume
└── Pre-built React/Vite PWA  ── baked into image
```

**Multiplayer model:** Server-authoritative WebSocket. No WebRTC, no P2P. All live game state is held in server memory. SQLite is written only on lobby creation, player join, and game completion.

**Rack privacy:** Each player receives their own tiles via a `YOUR_NEW_RACK` message. The shared `STATE_UPDATE` broadcast contains only board, scores, turn info, tile bag count, and other players' rack *sizes* — never their actual tiles.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 Alpine |
| Server framework | Fastify v5 + @fastify/websocket + @fastify/static + @fastify/cookie |
| Database | SQLite via better-sqlite3 |
| Frontend | React 18 + TypeScript + Vite |
| State management | Zustand |
| Styling | Tailwind CSS |
| PWA | vite-plugin-pwa + Workbox |
| Build | pnpm workspaces, multi-stage Dockerfile |
| Board rendering | SVG (enables CSS transitions per hex) |

---

## Project Structure

```
ingenious/
├── Dockerfile                  # multi-stage: shared → client → server → runtime
├── docker-compose.yml
├── package.json                # pnpm workspace root
│
├── shared/                     # isomorphic — used by both server and client
│   ├── types.ts                # all shared TypeScript types & message shapes
│   ├── hexGrid.ts              # axial coord math, HEX_DIRS, key(), add(), hexDist()
│   ├── tileBag.ts              # 120-tile generation + Fisher-Yates shuffle
│   ├── scoring.ts              # ray-cast scoring algorithm
│   └── gameEngine.ts           # applyMove(), isLegalPlacement(), checkWinCondition()
│
├── server/
│   ├── index.ts                # Fastify entry, registers plugins and routes
│   ├── routes/
│   │   ├── api.ts              # REST: POST /api/lobbies, GET /api/lobbies/:id, POST /api/auth
│   │   └── websocket.ts        # WS /ws — routes messages to LobbyManager
│   └── services/
│       ├── lobbyManager.ts     # singleton Map<id, Lobby>, join/start/disconnect logic
│       ├── gameRoom.ts         # per-game state machine, move validation, broadcast
│       └── database.ts         # SQLite schema + prepared queries
│
└── client/
    ├── vite.config.ts          # Vite + PWA plugin config
    └── src/
        ├── components/
        │   ├── board/          # HexBoard (SVG), HexCell, TileGhost (placement preview)
        │   ├── screens/        # HomeScreen, LobbyScreen, GameScreen
        │   └── ui/             # ScorePanel, PlayerRack, TurnIndicator, GameOverModal, IngeniousBanner
        ├── store/              # Zustand stores (lobbyStore, gameStore)
        ├── lib/                # wsClient singleton
        └── hooks/              # custom React hooks
```

---

## Feature Checklist

### ✅ Completed

#### Game Rules
- [x] Hexagonal board with axial coordinates (radius scales with player count: 2p=6, 3p=7, 4p=8)
- [x] 120-tile bag: 6 colours, 5 same-colour doubles + 6 copies of each mixed pair
- [x] Tile placement validation (both hexes in-bounds, empty, and adjacent)
- [x] First-turn rule: placement must be adjacent to an unused start symbol
- [x] Six pre-printed start symbols at cardinal edge positions; each usable once
- [x] Ray-cast scoring for both tile halves in all 5 outward directions
- [x] Same-colour double tile edge case: shared hex counted by both rays
- [x] INGENIOUS! bonus turn on reaching 18 in any colour (chains supported)
- [x] Rack swap rule: discard and redraw 6 tiles if rack contains no lowest-colour tile
- [x] Rack refills to 6 from the bag after every turn
- [x] Win condition: instant win when any player scores 18 in all 6 colours
- [x] Win condition: game ends when no legal placements remain for the current player
- [x] Tiebreak: sort players by ascending colour scores, winner has highest minimum

#### Multiplayer & Networking
- [x] Server-authoritative WebSocket game loop
- [x] Lobby creation with configurable player count (2–4)
- [x] 6-character shareable lobby codes
- [x] Host/guest roles; only host can start
- [x] Player join and leave broadcasts
- [x] Rack privacy (each player only sees their own tiles)
- [x] Masked state broadcast (`STATE_UPDATE`) after every move
- [x] Player reconnect support (existing session re-attaches via cookie)
- [x] PING/PONG keep-alive

#### Persistence
- [x] SQLite database (single file, Docker volume)
- [x] Player identity persisted via secure HTTP-only cookie
- [x] Lobby and player records written on creation/join
- [x] Game results (winner, scores, move count, duration) persisted on game end

#### Frontend
- [x] Home screen: create or join game by lobby code
- [x] Lobby screen: player list, seat numbers, host indicator, Start button
- [x] Game screen: SVG hex board, score panel, player rack, turn indicator, tile bag count
- [x] Tile selection from rack with click-to-place on two adjacent hexes
- [x] Ghost preview of first selected hex during placement
- [x] Valid placement hexes highlighted when a tile is selected
- [x] Game Over modal with winner announcement and final scores
- [x] INGENIOUS! banner/notification
- [x] Swap Rack button (shown on player's turn)
- [x] Installable PWA (manifest + Workbox service worker)
- [x] Dark purple theme with Tailwind CSS
- [x] Copy lobby code to clipboard button (one-click copy with "Copied!" feedback)
- [x] Player name change in-lobby (pencil-icon inline edit, persisted via `PUT /api/player/name`, broadcasts live via `CHANGE_NAME` WebSocket message)
- [x] Direct-join shareable URL (`?join=LOBBY_CODE` auto-fills code and switches to Join mode)
- [x] Tile flip button in rack (↻ Flip swaps colour assignment; ghost preview reflects orientation)
- [x] Rack swap eligibility prompt (banner appears automatically when it is your turn and your rack contains no lowest-colour tile)
- [x] Turn timer (60 s per turn shown in header; server auto-advances turn on timeout)

#### Infrastructure
- [x] Single-container deployment (no external services)
- [x] Multi-stage Dockerfile (shared → client → server → slim runtime)
- [x] Docker Compose configuration with persistent volume
- [x] pnpm workspace monorepo (shared, server, client packages)
- [x] Fastify v5 (patched against Content-Type validation bypass CVEs)
- [x] Production-ready health-check endpoint (`GET /health`)
- [x] Lobby expiry: idle waiting lobbies cleaned up after 1 hour; idle in-progress lobbies after 24 hours
- [x] Game history / past results browser (`GET /api/history` — last 20 games with winner name and scores)
- [x] CI pipeline (GitHub Actions) — build all packages + run shared tests on push/PR
- [x] Rate limiting on REST endpoints (per-route limits via `@fastify/rate-limit`)

#### Game Correctness
- [x] Full end-of-game detection: skips players with no legal moves; game only ends when **all** players are out of moves

#### Multiplayer
- [x] Reconnect mid-game: client auto-rejoins lobby on WS reconnect and navigates back to the game screen; server re-sends masked game state including player's own rack

---

### 🚧 Work In Progress / Known Gaps

#### Game Rules
- [x] Rack swap eligibility prompt shown to player before turn automatically ends
- [ ] Spectator/observer mode (watch a game without playing)

#### Frontend Polish
- [x] Tile rotation / orientation selection before placement (Flip button swaps which hex receives each tile colour; ghost preview updates accordingly)
- [ ] Animated score increments
- [ ] Mobile touch drag-to-place support (board is currently click-only)
- [ ] Sound effects / audio feedback
- [ ] Responsive layout optimisation for small screens in landscape
- [x] Direct-join shareable URL (e.g. `?join=LOBBY_CODE` auto-fills the lobby code so players can click a link to join; lobby screen also has a "Copy invite link" button)

#### Multiplayer
- [x] Turn timer / time limit per turn to prevent stalled games (60 s countdown visible in header; turn auto-advances on timeout)
- [x] Broadcast player name changes to all lobby members in real time (via `CHANGE_NAME` WebSocket message)

#### Infrastructure & Quality
- [ ] Unit tests for server routes and WebSocket handlers
- [ ] Integration / end-to-end tests
- [ ] Player statistics / leaderboard page (win rates per player using the existing `/api/history` data)