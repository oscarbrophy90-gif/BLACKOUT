# BLACKOUT — Multiplayer Architecture (Phase 3 plan)

The game ships today with 99 bots filling the lobby locally. This document
is the contract for replacing them with real players without rewriting the
game. The shapes it describes already exist in `shared/src/protocol.ts`,
and the client is written against them from day one.

## Topology

```
client (renderer + predictor)
   │  WebSocket (WSS)
dedicated match server (authoritative, 1 process per match, 100 slots)
   │
matchmaker (fills lobbies, assigns servers)
   │
persistence (accounts, inventory, stats — docs/DATABASE.md)
```

## Authority: the server owns everything that matters

The client is NEVER trusted with:

- damage (server raycasts against its own world state),
- inventory and pickups (server resolves contested grabs),
- currency, XP, match results (server computes from its own event log),
- loot rolls (server seeds the match; `shared` RNG makes it replayable),
- position beyond plausibility (server integrates inputs, rejects teleports).

The client sends **intents** (`ClientInputMsg`: move axes, jump, fire, aim
angles, at 60 Hz) and renders **snapshots** (`SnapshotMsg` at 20 Hz with
interpolation, plus `ServerEventMsg` for kills/crates/zone).

This split exists in the code today: everything the server must own already
lives in `@blackout/shared` as pure functions (damage in `combat.ts`, loot
in `loot.ts`, zone in `zone.ts`, rewards in `xp.ts`). Porting to the server
is importing, not rewriting.

## The Blackout over the wire

`PlayerSnap.lum` — the emitted-light scalar — is computed **server-side**
from movement/fire state and broadcast. During a Blackout the server can
cull enemy positions from snapshots entirely for players whose luminance
is below your detection threshold: dark-hidden players are not merely
not-rendered, they are **not sent**, which kills wallhacks during the
game's signature moments.

## Tick rates

| Loop | Rate |
|---|---|
| server simulation | 30 Hz |
| client input send | 60 Hz |
| snapshot broadcast | 20 Hz |
| abstract-bot backfill (during rollout, mixed lobbies) | 2 Hz |

## Prediction and reconciliation

- Local movement predicts immediately (the FPSController is deterministic);
  the server echoes `ackSeq`, the client rewinds and replays unacked inputs.
- Firing shows tracer + sound instantly; damage numbers wait for the
  server's `hit` event. Hit registration uses short server-side lag
  compensation (rewind ≤ 150 ms).

## Anti-cheat posture (Phase 3+)

1. Server authority (above) removes the profitable cheats first.
2. Plausibility gates: speed/accel caps, fire-rate caps from the weapon
   table, LOS checks on reported aim.
3. Seeded replayability: a match seed + input log reproduces the match
   bit-for-bit for audits.
4. Snapshot culling (dark players not sent) as both a feature and a
   defence.

## Matchmaking / social (Phase 3 backlog)

Accounts, parties, friends, duos/squads queue in the matchmaker service;
the match server stays dumb (100 slots, one match, dies after). Leaderboards
aggregate from the persistence layer.
