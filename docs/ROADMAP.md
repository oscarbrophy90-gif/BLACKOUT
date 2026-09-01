# BLACKOUT — Development Roadmap

Build order follows one rule: a working playable game at every stage.

## Phase 1 — Prototype ✅ (this repo)
First-person movement (walk/sprint/jump/crouch/slide), one island, weapons
that feel good (recoil/spread/bloom/ADS/reload), health/armor, bots that
loot/rotate/fight/heal, pickups, simple inventory, full HUD.

## Phase 2 — Battle Royale ✅ (this repo)
100-slot match with bot backfill, the 8-district map, floor loot + crates
+ supply drops, the Deadgrid (7 collapse phases), eliminations + killfeed,
spectator, victory flow, **the Blackout Cycle** end to end.

## Phase 3 — Multiplayer
The plan is docs/NETWORKING.md; the protocol already exists in
`shared/src/protocol.ts`.
- [ ] Authoritative match server (imports `@blackout/shared` rules verbatim)
- [ ] WebSocket transport, prediction + reconciliation
- [ ] Matchmaker filling lobbies, bots backfilling empty slots
- [ ] Server-side Blackout snapshot culling (dark players are not sent)
- [ ] Accounts; server-computed XP/coins/results

## Phase 4 — Progression (base shipped, expand)
Shipped: XP/levels, salvage, 3 daily + 3 weekly contracts, lifetime stats,
profile. Next:
- [ ] Seasons: seasonal XP track, seasonal contract lines, season reset
- [ ] Leaderboards (server), match history browser
- [ ] Achievement wall + showcase on the profile

## Phase 5 — Cosmetics (base shipped, expand)
Shipped: 12 weapon skins, 10 suits, 8 charms, 6 emotes, rotating shop.
Next:
- [ ] Cosmetic crate opening ceremony (separate from gameplay crates)
- [ ] Per-piece character customization (head/body/legs/accessories)
- [ ] Animated Surge-Rated skin shaders; emote playback in-match
- [ ] Hundreds more charms/skins — the pipeline is data-only

## Phase 6 — Polish
- [ ] Weather fronts (rain that muffles emissions — design carefully!)
- [ ] Day cycle drifting the dusk; sunrise finale on the final circle
- [ ] Interior floors for the big Filament Row towers
- [ ] Vault event under Substation Zero; Golden/Mystery crates
- [ ] Duos/Squads, Quick Match (small circle), Training Range
- [ ] Gun attachments (scopes/mags/grips found as loot)
- [ ] Controller support, key rebinding, accessibility pass
- [ ] Object-pool audit, draw-call budget per district, mobile perf tier
