# BLACKOUT — Design Bible

A 100-player last-player-standing FPS. Not a copy of anything: the whole
game is built around one original mechanic, and every system feeds it.

## The signature mechanic: THE BLACKOUT CYCLE

**Pitch:** on a fixed clock the island cuts to pure ink, and the only things
anyone can see are the light signatures your actions emit — light is
information, and every reveal is a choice.

### Exact rules

1. Every 75 seconds a 12-second Blackout hits, telegraphed 5 seconds ahead
   (sky flicker + rising hum). The scene renders as flat ink-black with an
   emissive-only pass — never dimmed lighting. Flat black contains zero
   information, so cranking monitor gamma gains nothing. This is a hard
   render rule, not tuning.
2. **Emissions.** Firing paints a muzzle bloom and tracers that hang in the
   air (doubled hang in the dark). Sprinting leaves a cyan footstep trail.
   Taking damage flares red; healing pulses green. Slow-walking and
   crouching emit almost nothing.
3. **Heartbeat rule (mandatory).** Every player emits a faint involuntary
   pulse every 4 seconds regardless of movement — readable inside ~30 m.
   Perfect invisibility is never free; endgames always resolve.
4. **Navigation rule (mandatory).** World geometry carries a subtle emissive
   edge-glow during Blackouts (a wireframe whisper) and landmark lights
   persist. You are hidden in the dark, never lost in it.
5. **Escalation.** Each zone phase adds +2 s of Blackout and −5 s of
   interval, capped so darkness never exceeds 60% of a cycle mid-game. The
   final circle is one permanent Blackout — a light-discipline duel that
   cannot stalemate (the heartbeat rule guarantees it).
6. Blackouts are the aggressor's window: rarity loot-glows and Mil-Spec+
   light columns appear only in the dark; Blackout eliminations pay bonus
   contract progress.
7. **Bot sensory contract.** During a Blackout, bot target acquisition reads
   exactly one number per target — the emitted-luminance scalar (heartbeat
   ≈ 30 m, walking ≈ 90 m, sprinting ≈ 150 m, firing ≈ 250 m) — plus noise
   events. No bot perceives outside this scalar, ever. Learned light
   discipline provably works.

### Never do this

1. Never render darkness as dimmed lighting — always flat-black plus
   emissive-only. Any ambient concession reopens the gamma exploit.
2. Never allow zero-emission invisibility. The heartbeat ships everywhere.
3. Never let darkness delete navigation. Edge-glow and landmark lights are
   load-bearing, not polish.
4. Never give bots perception outside the luminance-scalar contract.
5. Never promise per-player dynamic shadowed lights. The budget is a pooled
   handful of real lights plus emissive billboards.

## World fiction

**Vantera** is a state-built "battery island" from a fictional 1980s energy
program — an entire landmass wired as one experimental grid. After the
catastrophic Ninth Surge it was sealed; decades later the automated grid is
dying in rhythmic seizures. Each cycle, 100 salvage-contract **Linewalkers**
drop in to strip it before the grid flatlines. One contract gets paid.

### Districts

| District | Archetype | Loot | Hook |
|---|---|---|---|
| Filament Row | city | ●● | Neon showroom city — brightest between Blackouts, blackest during them |
| The Coilworks | industrial | ●● | Turbine halls and capacitor stacks; the island's Blackout clock |
| Glasspine Reach | forest | ● | Surge-vitrified pines; footstep trails linger — tracker's paradise |
| Pylon Ridge | mountain | ● | Longest sightlines; watchtowers and the summit relay |
| Breakwater Terminal | coast | ●● | Container yard and piers reaching into black water |
| Substation Zero | military | ●●● | Best loot behind walls; won on light discipline alone |
| The Sinks | flooded suburb | ● | A drowned worker town, half-sunk houses |
| Hollowlight Quarry | open-pit mine | ●● | Heliostat mirror field; natural spotlight traps |

## The zone: THE DEADGRID

Vantera's grid dies sector by sector, permanently. Outside the ring your
contract suit browns out — then health drain as ground-fault arcs bleed
charge from your body. The live zone is literally where the power still is;
the final circle is the island's last live circuit. **The winner is the
last light on Vantera.**

The wall is the **Grid Shimmer** — an aurora curtain of scrolling cyan
ribbons tracing the live zone's edge, readable from anywhere (diegetic zone
UI). It reddens as the island dies: the sky is also the match clock. During
a Blackout the dusk collapses to a starfield and the Shimmer alone remains.

## Weapons

Militarized grid tooling from three defunct contractors. Naming convention:
**manufacturer + electrical component + wattage-style number.** Each marque
is a light-signature budget — your gun choice IS a Blackout strategy:

- **Voskaya Combine** — hits hardest; tracers hang longest (you are a beacon)
- **Halcyon Grid Authority** — precise and dim; signatures fade fast
- **Brant & Marrow** — scavenger pieces; brutal close stats, sparking blooms

Current arsenal (see `shared/src/weapons.ts` — the single source of truth):

| Class | Weapons |
|---|---|
| Assault rifle | Halcyon Filament-3 · Voskaya Rectifier-6 · B&M Jumpwire-8 |
| SMG | B&M Fusebox-9 · Halcyon Nocturne-5 · Voskaya Inductor-7 |
| Shotgun | Voskaya Breaker-12 · B&M Arcwelder |
| Sniper | Voskaya Kilovolt-1 · Halcyon Ohm-98 "Quiet Hour" |
| Marksman | Halcyon Ammeter-4 · Voskaya Commutator-3 |
| Pistol | Halcyon Diode-2 · B&M Short-Circuit |
| Melee | The Linesman's Maul (always carried) |

**Rarity = certification stamps:** Uncertified → Bench-Tested →
Line-Certified → Industrial → Mil-Spec → Prototype → Surge-Rated. Rarity is
an edge, never an auto-win: the balance tests cap a Surge-Rated weapon at
≤ 25% more DPS than its floor, and nothing one-shots a full kit to the body.

## Art direction

Flat-shaded low-poly, three-color discipline: indigo shadow, sodium-orange
practicals, cyan grid-glow. Chunky silhouette-first geometry (readability
in darkness is the art bar), heavy fog, vertex-color grain, emissives as
jewelry. Perpetual amber dusk under the Grid Shimmer. During a Blackout the
mechanic is the game's best-looking moment — that is on purpose.

## Economy and progression

- **XP** for placement, eliminations, headshot finishers, survival time,
  crates, and the win bonus ("LAST ONE STANDING"). Level curve in
  `shared/src/xp.ts`.
- **Salvage (⬡)** — the cosmetic currency. Earned only by playing.
- **Contracts** — 3 daily + 3 weekly challenges, seeded deterministically
  per day/week. Blackout eliminations get their own contracts.
- **Cosmetics are pure paint**: suits plus a 2,000-item catalogue — 500
  win celebrations, 500 emotes, 500 weapon skins, 500 accessories. No stat
  touches gameplay, ever.

### The catalogue (2,000 unique items)

Every item is a *recipe* over a fixed vocabulary, not a label: a
celebration or emote is 1–6 keyframed moves + props + layered effects + a
palette + a camera; a weapon skin is a procedural pattern + palette +
PBR finish + emissive behaviour + particle emitter; an accessory is a
slot + parametric shape + palette + motion + particles. Two items with the
same recipe are the same design, and the validator forbids it — recolours
are not items. Per category the rarity split is fixed: Common 200 ·
Uncommon 120 · Rare 80 · Epic 50 · Legendary 35 · Mythic 10 · Exotic 5.
Complexity climbs with rarity (commons are one or two moves; exotics stack
three cinematic effects and a signature prop). Prices are per rarity:
250 / 500 / 1,000 / 1,600 / 2,500 / 5,000 / 10,000 ⬡.

### The shop

Four categories, **20 items each**, and a **completely new draw every
15 minutes** — the countdown sits top-left ("SHOP REFRESHES IN 14:32"),
and at zero the grid flips through "REFRESHING SHOP...". The draw is
rarity-weighted Common → Legendary; a **Mythic** appears in one category
about one rotation in ten, an **Exotic** about one in forty, and both
together is a genuine event. Every rotation is seeded by its 15-minute
key, so every client (and a future server) agrees on the same shop.

## Buildings and the loot race

Structures are real interiors: doors, windows, rooms, stairwells and
upper floors, with loot on the floor and crates in the rooms. Different
kits carry different loot (houses: supplies; warehouses/hangars: crates;
bunkers: the good stuff). **Every Linewalker drops in empty-handed** —
the 99 rivals run the same loop you do: land → search buildings and
crates → find a weapon → gear up → fight → rotate → survive → win. Bots
enter through doors, search rooms, pick up what they find, upgrade to
better guns, and adapt their engagement range to the class they hold.
Floor weapons are the actual weapon model with a rarity-coloured outline
(a glow from Rare up, a dark-visible beam from Legendary up).

## Endings

- **Win** → a VICTORY card with your callsign (camera crane, fanfare,
  confetti) → the podium, your Linewalker on 1st performing your equipped
  win celebration → NEXT → the match summary (placement, eliminations,
  XP, salvage, weapons collected, stats) → RETURN TO MAIN MENU.
- **2nd / 3rd** → the same podium, the winner performing *their*
  celebration on 1st while you stand on your step; SKIP jumps straight to
  the summary.
- **Anything lower** → straight to the summary.
