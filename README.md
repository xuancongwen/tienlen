# Tiến lên

A cozy desktop version of Tiến lên — Vietnam's favourite shedding card game ("Thirteen") — built with **Electron + TypeScript + PixiJS**, sharing its architecture with *Zhao Peng You / Card Friend Finder* and *Guan Dan*.

- **Single player** against one to three AI opponents (easy / normal / hard); bots fill any seat without a person.
- **Multiplayer** over **Steam** (lobbies + P2P via `steamworks.js`) or over the **local network**.
- **House rules** for the things real tables argue about: 2–4 players, how the first round opens, instant wins, what may chop a 2 and whether chops chain, Northern (miền Bắc) constraints, and every scoring knob.
- A warm, lamplit look with a jade cloth and vector-drawn cards — no pixel art.

## Getting started

```bash
npm install
npm run dev        # Electron with hot reload
npm test           # rules-engine, AI and networking tests (vitest)
npm run typecheck
npm run build      # compiles main/preload/renderer into out/
npm run package    # electron-builder installers into dist/
```

Requires Node 20+. `steamworks.js` is optional: without Steam running the Steam options simply hide.

## How it fits together

```
src/
  engine/      Pure rules engine — no DOM, no Pixi, unit-tested
    cards.ts     52-card deck; 3 low … A, 2 high; ♠ < ♣ < ♦ < ♥
    combos.ts    singles, pairs, triples, tứ quý, straights, đôi thông; beats(); chop rules
    moves.ts     every combo a hand can form / every legal play
    game.ts      rounds, tricks, pass-lock, 3♠ opening, chops & payouts, instant wins, scoring, match end
    rules.ts     the Rules object, defaults, and the settings-screen metadata
  ai/bot.ts    heuristic bots (easy / normal / hard) that decide from a per-seat view
  net/         host↔client protocol, authoritative GameHost, GameClient, transports (in-process / LAN / Steam)
  main/        Electron main process: window, settings file, LAN WebSocket server/client, Steam
  preload/     the typed `window.gd` bridge
  renderer/    PixiJS UI: menu, house rules, multiplayer, lobby, game table
tests/         vitest suites: combos, game flow & scoring, bot simulations, host/client
```

The **host is authoritative**: whoever hosts runs `GameHost` in their renderer and every seat — including their own — is a `GameClient` on a transport. Bots run on the host from the same view a remote human gets, so a bot quietly takes over any seat whose player disconnects.

## Rules implemented (Southern defaults)

Thirteen cards each. 3 is low, 2 is high; spades < clubs < diamonds < hearts. Shapes: single, pair, triple, four of a kind (tứ quý), straights of three or more (no 2s), and three or more consecutive pairs (đôi thông). You must beat the same shape and length with a higher top card; passing locks you out until the trick is cleared, and the last player to play leads the next trick.

A lone 2 is chopped by a four of a kind or three consecutive pairs; a pair of 2s by four consecutive pairs (or a four of a kind, by default); chops can be chopped and the penalty follows the chain. The 3♠ (or lowest card dealt) opens the first round and must be part of that play; afterwards the round winner leads. Instant wins at the deal: four 2s, six pairs, five consecutive pairs, a 3-to-A dragon, three four-of-a-kinds.

Scoring is zero-sum per round: losers pay the winner one point per card left, plus penalties for 2s (thối heo), leftover four-of-a-kinds and three-pair runs, doubled for a player who never got a card down (cóng). Chops pay immediately. A match is ten rounds by default.

Every one of those is a switch under **House rules** (`src/engine/rules.ts` → `RULE_OPTIONS`), including the Northern variants (pairs must share a colour, straights must be one suit, singles must follow suit) and whether a chop reopens the trick for players who had passed. The host's rules are pushed to everyone in the lobby before the deal.

## Steam setup

1. Put your App ID in `resources/steam_appid.txt` (480 — Valve's *Spacewar* — works for local testing while Steam is running) and, for packaged builds, set `STEAM_APP_ID` or edit `APP_ID` in `src/main/steam.ts`.
2. Run with the Steam client open; the Multiplayer screen shows *Signed in to Steam as …* when the native module loaded.
3. Host a lobby → *Invite friends* opens the overlay invite dialog; friends can also *Join game* from your profile.
4. Upload the unpacked `dist/*/` folder with SteamPipe; `electron-builder.yml` already unpacks `steamworks.js` from the asar and places `steam_appid.txt` next to the executable for local runs.

The Steam layer targets `steamworks.js` 0.4.x and cannot be exercised without a Steam client; verify on your machine that the sign-in line appears and that two clients see each other's plays.

## LAN play

*Host on this network* starts a WebSocket server on port 7777 and shows a join code such as `192.168.1.20:7777`; friends on the same network enter it under *Join by address*.

## Playing

- Click cards to raise them, **Enter** / *Play* to play, **Space** / *Pass* to pass, **H** / *Hint* to cycle through legal plays, **Esc** to clear.
- The card you must open with glows red; a play that would chop is labelled *chặt!*
- `?seed=123` on the renderer URL (during `npm run dev`) makes a solo game reproducible for debugging.

## Notes for shipping

- Settings live in Electron's `userData/settings.json`.
- The renderer never touches Node; everything goes through the typed `window.gd` bridge.
- `tests/simulation.test.ts` plays whole matches with bots under several rule variants and 2/3/4 players — run it after any rules change.
