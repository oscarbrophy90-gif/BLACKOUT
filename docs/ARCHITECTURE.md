# BLACKOUT — Technical Architecture

Three npm workspaces with a hard dependency direction:

```
shared  ←  client
shared  ←  server
```

- **`shared/`** — pure TypeScript game rules: weapon table, damage model,
  loot tables, zone schedule, XP/levels, challenges, cosmetics, seeded RNG,
  wire protocol. No DOM, no Three.js, no Node APIs. Everything here is unit
  tested (`shared/test/`), and everything here is what the authoritative
  server will run in Phase 3.
- **`client/`** — the game: Three.js renderer + DOM UI. Knows how to draw
  and predict; owns no rules.
- **`server/`** — Node, no framework. Today: static hosting + profile-store
  seam + health endpoint. Phase 3: the authoritative match loop
  (docs/NETWORKING.md).

## Client module map

```
client/src/
  main.ts                state machine: DEPOT ↔ deploy ↔ match ↔ results
  config.ts              presentation/simulation-budget knobs (rules live in shared)
  core/
    engine.ts            renderer, camera, RAF loop, scene teardown
    input.ts             keyboard + pointer-lock mouse; systems read intents
    events.ts            typed event bus (kill, hitmarker, blackoutStart, …)
    audio.ts             every sound synthesized with WebAudio at runtime
  meta/
    data.ts              Profile: persistent save (localStorage), XP/coins/
                         catalogue cosmetics/challenges; mirrors docs/DATABASE.md
  character/
    rig.ts               the Linewalker rig: 11 joints, attachment sockets
    moves.ts             every MoveId as keyframed poses
    props.ts / accessories.ts / effects.ts
                         every PropId / ShapeId / EffectId as a small builder
    animator.ts          plays an AnimSpec: sequencing, props, effects, camera
  world/
    terrain.ts           analytic heightfield heightAt(x,z) + 8 districts;
                         the island is identical every match by design
    builder.ts           all structures as instanced primitives + AABBs +
                         loot/crate spawn points + Blackout edge-glow
    buildings.ts         the enterable-building kit: walls with doors and
                         windows, slabs with stairwells, rooms, door registry
    particles.ts         one configurable CPU particle emitter for everything
    collision.ts         hash-grid AABB world: capsule slide, ground snap,
                         raycast (bullets), line-of-sight (bots)
    sky.ts               dusk dome, stars, clouds, THE render switch to ink
    fx.ts                pooled tracers/flares/footsteps/rings/beams/sparks —
                         during Blackouts these ARE the game
  game/
    match.ts             MatchManager: drop → live → spectate → ended;
                         wires every system; builds MatchResult
    blackout.ts          BlackoutCycle (the clock) + Emissions (the one
                         luminance scalar per actor — the sensory contract)
    zone.ts              ZoneController: Deadgrid phases, Grid Shimmer wall
    loot.ts              floor loot (per-class weapon models + rarity outline
                         instances), crates, supply drops, bot pickup queries
  player/
    controller.ts        FPS movement: walk/sprint/crouch/slide/jump, bob
    player.ts            vitals, heal channelling, damage intake
    inventory.ts         2 weapon slots + melee + heals + ammo pools
  weapons/
    weapons.ts           firing, spread/bloom, recoil, reload, melee; hits
                         resolve against TargetField (bots today, snapshots later)
    viewmodel.ts         first-person gun, painted by the equipped skin
    models.ts            the one weapon part list behind viewmodel/floor/preview
    skins.ts             procedural skin textures, finishes, emissives, particles
  bots/
    bots.ts              99 Linewalkers; embodied (≤22 near you: full sim,
                         real raycasts) vs abstract (2 Hz: rotate, gear up,
                         statistical encounters). LOD is why 100 works at 60 fps
  ui/
    hud.ts               vitals/ammo/minimap/compass/killfeed/crosshair/…
    lobby.ts             DEPOT: play, loadout, shop, contracts, profile, settings
    shop.ts              4 categories × 20 items, 15-minute rotation + countdown
    loadout.ts           owned items by category, equip/unequip
    cards.ts             NAME / ★ RARITY / PRICE / [BUY] card markup
    preview.ts           the shared 3D viewport (rig or skinned weapon)
    podium.ts            VICTORY card → podium celebration → match summary
    screens.ts           deploy map, death, pause overlays
    map.ts               shared top-down island renderer
```

The catalogue itself lives in `shared/src/catalog/` (vocabulary, schema,
validator, four 500-item files) and the rotation logic in
`shared/src/shop.ts`; `shared/scripts/check-catalog.mjs <category>` runs
the validator standalone.

## The rules that keep this scalable

1. **Data-driven weapons.** A gun is a row in `shared/src/weapons.ts`.
   The WeaponSystem, the bots, the balance tests and the future server all
   read the same row. Adding a weapon = adding data.
2. **Analytic terrain.** `heightAt(x, z)` is a pure function; collision,
   bots, minimap and the deploy map never raycast the terrain mesh.
3. **Simulation LOD.** Only bots near the camera are embodied with full
   perception and hitscan. The rest advance on an abstract 2 Hz tick that
   preserves match narrative (kill feed, gear escalation, zone deaths).
   `MAX_EMBODIED` and `EMBODY_RADIUS` are the perf dials.
4. **Draw-call budget.** The whole island renders as a handful of
   InstancedMeshes (boxes, cylinders, trees, rocks, signs, loot) plus one
   LineSegments for the Blackout edge-glow. No per-building meshes.
5. **Emissions as the single perception channel.** Everything a Blackout
   reveals goes through `Emissions` — one scalar per actor. Renderer and
   bot AI both subscribe to it, so visuals and AI can never disagree about
   what the dark shows.
6. **Events, not references.** HUD and audio subscribe to the bus
   (`core/events.ts`); gameplay systems never touch DOM.
7. **Client trusts nothing it will later be lied to about.** XP, coins,
   loot rolls and damage all live in shared, seeded, replayable code — the
   exact code the server will run when the client stops being authoritative
   (docs/NETWORKING.md).

## Rendering the Blackout (the hard render rule)

Lambert materials with all lights at intensity 0 resolve to pure black —
so the Blackout switch is: sun+hemi off, background/fog to black, sky dome
off, stars on, edge-glow LineSegments on. Everything painted with
MeshBasicMaterial (neon signs, beacons, loot octahedra, tracers, fx pools)
is unlit and therefore survives — those are exactly the objects designated
as landmarks and emissions. There is no "dark ambient" anywhere to crank.

## Performance profile

- Instanced static world; zero dynamic shadow maps; one dynamic point
  light (player muzzle).
- Pooled FX (90 tracers, 140 footprints, 48 flares, 36 rings, 24 beams).
- Bot LOS raycasts at 4 Hz per embodied bot, against the AABB hash grid.
- Abstract bots: O(n²) pair check at ~2 Hz over ≤ 77 bots, trivial.
- `quality` setting maps to pixel-ratio caps (2 / 1.5 / 1).

## Testing

- `npm test` — shared rules (31 tests: zone containment over 3500 pulls,
  TTK bands per weapon, loot-tier monotonicity, reward math, shop
  determinism) + server (health, store round-trip).
- `npm run typecheck` — strict TS across all three packages.
- Browser smoke: Playwright drives lobby → deploy → drop → HUD assertions
  (see repo history / CI later).
