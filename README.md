# BLACKOUT

**A 100-player last-one-standing FPS built around a single original idea:
on a fixed clock the island goes pure black, and the only things anyone can
see are the light signatures your actions emit.** Fire and your tracers
hang in the dark. Sprint and you leave glowing footprints. Stand still and
your heartbeat still pulses once every four seconds. Light is information —
every reveal is a choice.

You are one of 100 **Linewalkers** dropped onto **Vantera**, a sealed
1980s "battery island" whose grid is dying in rhythmic seizures. Loot its
eight districts, survive the collapsing **Deadgrid**, learn light
discipline, and be the last light on the island.

Everything here is original — the island, the weapons (militarized grid
tooling from three fictional manufacturers), the fiction, the mechanic.
No real-world brands, no borrowed IP.

### Just play it

Open **`dist-standalone/BLACKOUT.html`** in any desktop browser. One
self-contained file — no install, no server, no network. Progress (XP,
salvage, cosmetics, contracts) saves to your browser.

The other 99 slots are filled by AI Linewalkers for now — they loot, gear
up, rotate with the zone, fight each other, and obey the same
light-visibility rules you do. The multiplayer architecture that replaces
them with people is designed and documented (see below).

### Controls

| | |
|---|---|
| WASD / mouse | move / look |
| Shift | sprint (leaves light trails in the dark) |
| Space | jump |
| C / Ctrl | crouch — sprint+C to slide |
| Mouse 1 / Mouse 2 | fire / aim |
| R | reload |
| E | loot / open crates |
| 1 / 2 / 3 | weapon slots / maul |
| 4 / 5 | heal health / recharge armor |
| Esc | pause |

### Run from source

```
npm install
npm run dev                # play at http://localhost:5173
npm test                   # 34 rule + server tests
npm run typecheck          # strict TS across all packages
npm run build:standalone   # regenerate dist-standalone/BLACKOUT.html
npm run serve              # node server: http://localhost:3000
```

### Repository

| | |
|---|---|
| `shared/` | every game rule as pure, tested TypeScript — the code a future authoritative server runs verbatim |
| `client/` | the game (Three.js + DOM, no other runtime deps) |
| `server/` | Node stub: hosting, profile-store seam, Phase 3 home |
| `docs/GAME_DESIGN.md` | the design bible — the Blackout Cycle's exact rules |
| `docs/ARCHITECTURE.md` | module map and the rules that keep it scalable |
| `docs/NETWORKING.md` | the 100-real-players plan (server authority, anti-cheat) |
| `docs/DATABASE.md` | persistent data schema |
| `docs/ROADMAP.md` | phases 1-6; what is shipped vs next |
