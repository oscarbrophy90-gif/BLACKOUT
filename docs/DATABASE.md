# BLACKOUT — Persistent Data

Today: the client persists a single profile to localStorage
(`client/src/meta/data.ts`), and the server has a JSON-file store behind a
four-method seam (`server/store.js`). Both intentionally share this schema
so Phase 3 lifts it into a real database without a migration puzzle.

## Entities

### Account
| field | notes |
|---|---|
| id | server-issued |
| name | callsign, 20 chars |
| createdAt | |

### Progression
| field | notes |
|---|---|
| xp | total, server-computed only |
| coins | salvage ⬡, server-computed only |
| level | derived from xp (`shared/src/xp.ts`) — never stored |

### Cosmetics
| field | notes |
|---|---|
| owned | cosmetic ids (weapon skins, suits, charms, emotes) |
| equipped | { weaponSkin, suit, charm?, emote } |

Purchases validate against `shared/src/cosmetics.ts` prices server-side.

### Lifetime stats
matches, wins, kills, top10s, bestPlacement, blackoutKills, cratesOpened,
distance, weaponKills (per weapon id — drives "favourite weapon").

### Challenges
| field | notes |
|---|---|
| daily | { dayKey, progress: MatchMetrics, claimed: ids } |
| weekly | { weekKey, progress, claimed } |

Windows roll by comparing keys — no cron needed. Challenge definitions are
deterministic per key (`shared/src/challenges.ts`), so client and server
always agree on what today's contracts are.

### Match history (server-only, Phase 3)
| field | notes |
|---|---|
| matchId, seed | seed + input log ⇒ replayable/auditable |
| placements[] | 100 rows: accountId, placement, kills, damage |
| events | compressed ServerEventMsg log |

## Rules

1. The server computes rewards from its own event log via
   `shared/src/xp.ts` — the client's numbers are display-only.
2. Derived values (level, win rate) are never stored.
3. The storage engine hides behind `Store` (get/put/all/load). A real
   database is a class with the same four methods.
