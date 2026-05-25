# VOID RUNNER — Art & Visual Design Guidelines v1.0

> All visuals in Void Runner are **procedurally generated in code** using HTML5 Canvas 2D. There are no external image assets. Every sprite, background, icon, and effect is drawn algorithmically from game data. This document defines the rules, palettes, and construction logic that keep everything visually coherent.

---

## 1. Core Aesthetic Principles

**Readable silhouettes (mixed media).** Flight **ships** are flat Canvas paths — meant to read clearly at Small-tier size. **Inorganic** and **energy** families lean geometric (facets, arcs, orb clusters); **organic** families deliberately use curves, lobes, and wave wings. **Planets and moons** are shaded spheres built from procedural **noise** (not flat vector fills — see §5). **Bullets** and some UI previews use soft radial glows where the spec calls for it. This is not a single “everything is hard-edged vector” rule; it is “right technique per layer, no muddy painterly hull texture.”

**Data-driven appearance.** A ship looks like what it is — size tier, species silhouette vocabulary, and tech tradition read at a glance. Faction identity accents **procedurally chosen** hull colours; species define **shape** families. Equipment-on-hull drawing is planned but not yet part of the flight renderer.

**Lonely vastness.** The background is dark. Ships and landables are high-contrast against it. Empty space dominates the screen — this is intentional. The universe should feel large and sparse.

**Consistent perspective.** Everything is viewed **top-down**, looking straight down into the plane of travel. Ships are flat silhouettes. Planets and moons read as shaded spheres (procedural texture). Stations use a separate legacy top-down module draw until redesigned. No pseudo-3D.

---

## 2. Colour System

### 2.1 Base Palette

The game uses a small fixed base palette for UI and non-faction elements:

```
SPACE_BLACK     #080810    // background
STAR_DIM        #2a2a3a    // distant stars
STAR_MID        #6a6a8a    // mid stars
STAR_BRIGHT     #c8c8e8    // near stars
NEBULA_BASE     #0a0a1a    // nebula shadow
UI_PRIMARY      #e8e8f0    // primary text and lines
UI_SECONDARY    #6060a0    // secondary text, inactive elements
UI_ACCENT       #40c0ff    // highlights, selection, active states
DANGER          #ff4040    // HP critical, radiation warning
WARNING         #ffaa00    // HP medium, fuel low
SAFE            #40ff80    // HP full, fuel full
CREDITS         #ffd700    // currency, mission payoff
```

### 2.2 Faction Colours

Each faction is assigned at world-gen time:
- A **primary colour** (hull fill, station accent)
- A **secondary colour** (engine glow, detail lines)

These tint faction-owned ships and stations. **Hull silhouette variety** comes from species (generator-chosen body/wing subsets and **`techArchetype`**), not from separate faction geometry fields.

**Ship colour (target model):** each ship gets a **procedural base colour** from world-gen / species seeds. Faction **`primaryColour`** / **`secondaryColour`** add **detail and accents** on top of that base (fill, stroke, engine glow). Until procedural hull colour fully ships, some flight code still paints hulls directly from faction primary.

**Pirates** always use desaturated, mixed colours — deliberately mismatched, as if their ships are salvaged from multiple factions. No coherent palette.

### 2.3 Colour usage rules *(placeholder — not law)*

*Target rules when procedural hull colour and VFX land. Today only part of this is true in code.*

| Area | Today (runtime) | Target |
|------|-----------------|--------|
| Ship hull fill/stroke | Faction `primaryColour` on cached silhouette | Procedural base + faction accent |
| Engine glow | **Not implemented** (`engineGlow.ts` stub) | Faction secondary radial gradient, thrust-scaled |
| UI chrome | Base palette (`COLOURS`) | Same |
| Radiation fringe | Red-violet vignette / tint (flight screen) | Same intent |
| Nebulae | Sector `hsla` blobs from world ambient config | Avoid faction palette clash |

Do not treat the bullets below as enforced art law until re-verified against `src/renderer/`.

---

## 3. Background Rendering

### 3.1 Star Field (Parallax)

Four layers of stars, each scrolling at a different speed relative to ship movement:

| Layer | Count per sector | Size | Scroll factor | Colour |
|---|---|---|---|---|
| Deep (galaxy) | 300 | 1px | 0.02 | STAR_DIM |
| Far | 150 | 1px | 0.08 | STAR_DIM to STAR_MID |
| Mid | 60 | 1–2px | 0.20 | STAR_MID |
| Near | 20 | 2px | 0.50 | STAR_BRIGHT |

Stars are seeded per-sector using the sector's world-gen seed — they are consistent on revisit. A small fraction of near-layer stars have a very slow 0.5s brightness pulse (twinkle).

### 3.2 Nebulae

Nebulae appear in roughly 1 in 4 sectors, pre-determined at world-gen. A nebula is rendered as 3–5 overlapping radial gradients:
- Colours drawn from a narrow hue range (e.g. blue-violet, or amber-red), never clashing with faction palettes in that sector
- Opacity: 0.04–0.12 (very subtle — background atmosphere, not a foreground element)
- Centre offset randomly within the sector bounds
- Scroll factor: 0.01 (nearly static — they are effectively infinitely distant)

### 3.3 Radiation Zone

When the player is within the radiation fringe:
- A red-violet vignette gradient grows from the screen edges inward, opacity scaling with proximity to centre
- Faint particle streaks drift toward screen centre (simulating radiation particles)
- The star field shifts toward red-violet tinting at maximum proximity
- A pulsing warning ring appears on the mini-map

---

## 4. Ship Rendering

### 4.1 Overview

Ships are drawn procedurally in **top-down flight view**. No sprite sheets. The ship points **upward** at angle 0; rotation uses a canvas transform. Silhouettes are built from paths and cached to offscreen canvases where practical.

**World-gen / the species ship generator** (in development) chooses, per species line:

| Choice | Purpose |
|--------|---------|
| **Size tier** | One of five classes (see §4.2) |
| **`techArchetype`** | From the species record — biases organic / inorganic / energy hull families (see GDD § Species) |
| **Body + wing subset** | Which procedural primitives that species may roll — gives **visual identity** without unique art per hull JSON row |
| **Base colour** | Seed-driven procedural palette entry per ship or hull line |

Individual **`HullSpec`** entries in `WorldFile` will carry generated silhouette parameters plus **`dimensions`** for hitbox and muzzle math. Design and tuning use the standalone **ship silhouette explorer** (`tools/ship-silhouette-explorer/`) at the **Small** tier.

### 4.2 Size tiers

Five size classes exist for spacing, camera, and hitboxes. Only **Small** is defined today; the rest will be assigned as the project proceeds.

| Tier | Hitbox (length × width) | Status |
|------|-------------------------|--------|
| **Tiny** | **30 × 18** | **Defined** — silhouette explorer; 1–2 wing pairs |
| **Small** | **40 × 24** | **Defined** — silhouette explorer; 2–3 wing pairs (Courier-class reference) |
| Medium | TBD | — |
| Large | TBD | — |
| Capital | TBD | — |

`HullSpec.dimensions` stores the tier box used for **muzzle offset**, **hit radius**, and scaling the drawn hull to that target.

### 4.3 Procedural silhouette generator

Hull art is composed from **body** primitives (e.g. lens, spade, facet, dart, rect, trapezoid, polygon, larva, orb) and optional **wing** shapes, filtered by three **style families** (combinable for hybrids):

| Family | Typical content |
|--------|-----------------|
| **Organic** | Soft hulls; fins, insect, tentacle, lobe wings |
| **Inorganic** | Mechanical hulls; swept, delta, rect, blade wings |
| **Energy** | Field bodies (e.g. orb); geometric wings (e.g. **node** orb clusters, **halo** body-centered arc bands) |

The generator picks body type, wing count/shape, attach zones along the hull, and numeric params from seeded ranges. Species identity = **allowed pools** + coherence, scoped by **`techArchetype`** (`organic` · `inorganic` · `energy` · `void` · `hybrid` · `robotic` · `biolume` · `compound` — see `techArchetypeToStyleFilters`).

Energy wings **attach on the hull edge**. Node and halo layouts use **body-centered circular geometry** (equal-angle orb placement, concentric arc lines) — intentional contrast with organic swept-wing forms.

### 4.4 Colour

1. **Base** — procedural per ship/hull from seeds (species + hull id).
2. **Faction layer** — `primaryColour` / `secondaryColour` (HSL at world-gen) add accents on hull stroke and related UI; **secondary** reserved for future engine glow. Not a full replacement palette per faction.

Pirates: desaturated, incoherent mixes (unchanged).

### 4.5 Equipment on hull (not defined yet)

Drawing installed gear on the silhouette (thruster nozzles, armour rim, weapon hardpoints, sensor dish, hyperspace ring, etc.) is **future work**. It is **not** specified here and **not** implemented for procedural hulls.

Combat weapons today fire from muzzle offsets derived from **`HullSpec.dimensions`** only. When equipment visuals ship, rules will live under `plan/procedural/` (`HULLS_FLIGHT.md`, `EQUIPMENT_IMAGERY.md` — see README there and Phase 6 backlog).

### 4.6 Legacy silhouettes (interim runtime)

Until generator output is wired into every hull, the game still supports fixed canvas paths on **`HullSpec.silhouette`**: `fighter`, `interceptor`, `shuttle`, `courier`, `freighter`, `heavy`, each scaled by **`dimensions`**. These named classes are **interim** — not the long-term art direction.

### 4.7 Engine glow *(placeholder — not implemented)*

*For now only.* `src/renderer/ships/engineGlow.ts` is a stub. Ships draw hull fill/stroke only; no thrust-linked exhaust in flight.

*Sketch for when implemented:* soft radial gradient in faction **secondary**; radius/opacity scale with forward/reverse/rotate thrust; additive blend against space.

### 4.8 Hull damage visuals *(placeholder — not implemented)*

*For now only.* Damage is communicated by a **world HP bar** above damaged ships and **DoT burn** overlay (green tint re-draw of hull) — not cracks, strobing hull, or debris on the silhouette.

*Sketch for when implemented:* tiered crack lines / flicker / red strobe by HP band — exact thresholds and art TBD.

### 4.9 Scale note

At base zoom, 1 canvas unit ≈ 1 px. The **Small** tier (40 × 24) is the reference for the silhouette explorer and current player-facing Courier-scale hulls. Other tiers will scale proportionally once defined.

---

## 5. Landables (planets, moons, stations)

### 5.1 Planets and moons

**Do not use** the old “filled circle + a few ellipses” description from early drafts. Planets and moons use a **dedicated procedural sphere renderer**:

- **Spec:** `plan/procedural/void_runner_planets.md`
- **Runtime:** `src/renderer/planets/` — noise-based `ImageData` pass, atmosphere/rings composited in Canvas 2D, textures cached per landable
- **PRNG:** `SplitMix64` (`src/core/prng.ts`), not the mulberry32 examples in the reference doc
- **Colour:** driven by landable procedural params (`rocky`, `chaos`, `cloudDensity`, etc.) — **not** faction primary tint on the body (minimap still uses faction dots)

### 5.2 Stations

Stations in **flight view** still use the **legacy station renderer** until Phase 6 station documentation and a new module system land (`STATIONS_FLIGHT.md` in `plan/procedural/README.md` backlog). Tiered “core + ring + spokes” tables in older versions of this file were **aspirational** — not current implementation law.

### 5.3 Landing radius indicator

When the player is within approach range of a landable, a dashed circle appears at the landing radius boundary. Colour: UI_ACCENT. Opacity scales with proximity (faint at edge, solid when close). Disappears once inside the radius.

---

## 6. Weapons and combat visuals

### 6.1 Current model (runtime)

Weapons are **`WeaponItem`** equipment rows referencing a **`BulletSpec`**. Firing: `WeaponSystem`. Drawing: `BulletLayer` (flight) and small previews in the weapon strip HUD.

**`BulletSpec`** (see `src/types/bullet.ts`) — fields that affect look and behaviour:

| Field | Role |
|-------|------|
| `visualType` | Canvas template: `bolt`, `beam_pulse`, `orb`, `missile` (`mine` on enum — reserved / may be incomplete) |
| `colour` | Hex string for fill/glow |
| `speed`, `mass`, `lifespan`, `damage`, `matterType` | Simulation |
| `abilities` | Optional: `seeking`, `dot`, `knockback`, `ballistic`, `explosive` — affect logic, not a separate art table |

Do **not** treat old world-gen “bullet flavour paragraphs” or fixed template tables in this doc as authoritative. **Re-align this section with code** when a dedicated weapon VFX pass is scheduled (`plan/BACKLOG.md` Phase 6+).

### 6.2 Impact effects *(placeholder — not law)*

*For now only.* On hit: brief particle burst and/or hull flash — counts, timing, and colours **TBD** when combat VFX are designed.

### 6.3 Ship destruction *(placeholder — not law)*

*For now only.* Older multi-phase explosion / debris notes here were a **sketch**; implementation may differ entirely.

---

## 7. UI Visual Language

### 7.1 Typography

Single font throughout: a monospace system font stack (`'Courier New', 'Lucida Console', monospace`). This gives a retro-technical feel without a custom font dependency.

- Large labels: 16px, UI_PRIMARY
- Body/data: 12px, UI_PRIMARY
- Secondary/inactive: 12px, UI_SECONDARY
- Alerts: 12px bold, DANGER or WARNING

### 7.2 UI Panels

All panels use:
- Background: SPACE_BLACK at 85% opacity (panels feel like part of the ship's HUD, not floating windows)
- Border: 1px solid UI_SECONDARY at 60% opacity
- Corner style: sharp (no border radius — fits the geometric aesthetic)
- Padding: 8px

### 7.3 HUD Elements

HUD elements are minimal and information-dense. No decorative chrome. Data is the design.

Bars (HP, fuel) are thin rectangles (4px tall, variable width). They do not have labels by default — icon glyphs identify them. Colour transitions from SAFE to WARNING to DANGER as value decreases.

The mini-map is a square panel, 160×160px, with a subtle border. It renders:
- All landables as faction-coloured dots (size proportional to landable size)
- Player ship as a small white triangle (always centred)
- Escort ships as small faction-coloured triangles
- NPC ships as small dim dots (hostile ships pulse red)
- Mission targets as pulsing UI_ACCENT dots
- Current ship and landable targets outlined with a selection ring

### 7.4 Equipment icons *(interim — not law)*

Until `EQUIPMENT_IMAGERY.md` lands, the UI uses simple 24×24px geometric glyphs on Canvas as a **stand-in**:
- Thruster: chevron/arrow shape
- Weapon: small diamond or crosshair
- Armour: shield outline (hexagon)
- Fuel tank: cylinder outline (rectangle with rounded top)
- Hyperspace drive: H-field ring glyph
- Sensor array: concentric arcs (radar symbol)
- Neural brain: small grid of connected dots
- Memory card: small rectangle with horizontal lines

All glyphs use UI_PRIMARY stroke, no fill. Equipped items gain a UI_ACCENT background tint.

### 7.5 Landable Screen

The landable screen is a full-panel overlay. Layout:
- Left column (30%): landable name, landable portrait (cached planet/moon texture at larger radius, or legacy station draw), faction name in faction primary colour, lore text in UI_SECONDARY
- Right column (70%): tab content area

Tabs use a simple horizontal tab bar. Active tab: UI_ACCENT underline. Inactive: UI_SECONDARY text.

---

## 8. Animation Guidelines

All animations are time-based (delta time), not frame-based. This ensures consistent speed regardless of frame rate.

| Element | Animation |
|---|---|
| Engine glow | Placeholder — not in flight renderer yet |
| Station rotation | Legacy station renderer only; constant angular velocity where implemented |
| Landing radius ring | Opacity lerps with proximity |
| Star twinkle | Sine wave brightness, 0.5–1.5s period, per-star random phase |
| Hull damage flicker | Placeholder — no on-hull damage art yet (HP bar + DoT overlay only) |
| Bullet trails | Previous position retained for 3 frames, faded |
| Seeking missile | Smooth turn toward target, turn rate from spec |
| Explosion particles | Placeholder — physics TBD when destruction VFX ship |
| HUD bar changes | Lerp over 0.1s to new value (no jarring snaps) |
| Hyperspace jump | 0.5s radial white flash, sector transition, 0.5s fade in |
| Radiation vignette | Smooth opacity lerp as player approaches core |

---

## 9. Renderer architecture notes

Engineering guidelines for the art stack:

- **Ship hulls:** offscreen cache per hull silhouette + faction colours where implemented; procedural generator params on `HullSpec` are backlog (`plan/BACKLOG.md` §6.3). Explorer tool is authoritative for **Small**-tier body/wing grammar until wired in.
- **Planets / moons:** texture cache per landable (`src/renderer/planets/`); flight draws via `drawImage`. See `void_runner_planets.md`.
- **Stations (flight):** legacy renderer — separate from planet pipeline.
- **Layer order** (back to front): nebulae → star layers → landables (cached planet textures / legacy stations) → bullet trails → bullets → ship hulls → (future: engine glow, hull damage, explosion VFX) → HUD → UI panels
- **World-to-screen:** one transform from world position; renderers receive camera, not screen coords.
- **`FactionVisual`:** built at load from faction HSL — used for ships, stations, minimap dots, accents.
- **Seeded PRNG:** sector stars, planet noise, and future hull generation use deterministic seeds (entity/sector id) for session-stable visuals.

**Related docs:** `plan/procedural/README.md` · `plan/GDD.md` (Species, `techArchetype`) · `tools/ship-silhouette-explorer/`

---

*Art & Visual Design Guidelines v1.0 — Procedural vector, top-down, geometric modern indie. No external image assets. Visuals derived from game data; several sections marked placeholder pending Phase 6+ implementation.*
