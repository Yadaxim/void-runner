# VOID RUNNER — Art & Visual Design Guidelines v1.0

> All visuals in Void Runner are **procedurally generated in code** using HTML5 Canvas 2D. There are no external image assets. Every sprite, background, icon, and effect is drawn algorithmically from game data. This document defines the rules, palettes, and construction logic that keep everything visually coherent.

---

## 1. Core Aesthetic Principles

**Geometric clarity.** Shapes are clean, intentional, and readable at small sizes. No texture noise, no painterly blur. Hard edges with occasional soft glows for light sources and engine exhaust.

**Data-driven appearance.** A ship looks like what it is. Heavy ships are wide and dense. Fast ships are narrow and tapered. Equipment installed on a ship is visible on its silhouette. Faction identity flows through colour, not iconography.

**Lonely vastness.** The background is dark. Ships and landables are high-contrast against it. Empty space dominates the screen — this is intentional. The universe should feel large and sparse.

**Consistent perspective.** Everything is viewed **top-down**, looking straight down into the plane of travel. Ships are flat silhouettes. Planets are circles. Stations are geometric constructions viewed from above. No pseudo-3D.

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
- A **geometry bias**: `angular` (sharp points, hard angles) or `rounded` (curves, blunt noses)
- A **density bias**: `sparse` (minimal detail, open hull shapes) or `dense` (many modules, complex outlines)

These four properties cascade automatically into all faction-owned ships and stations. A player can identify a faction's ships at a glance after encountering them once.

**Pirates** always use desaturated, mixed colours — deliberately mismatched, as if their ships are salvaged from multiple factions. No coherent palette.

### 2.3 Colour Usage Rules

- Ship hulls use faction primary at 70% opacity fill, with a 1px primary-colour stroke
- Engine glows use faction secondary as a soft radial gradient
- All UI chrome uses the base palette only — never faction colours
- Radiation zone uses a deep red-violet gradient, distinct from all faction palettes
- Nebulae use colours that do not appear in any faction palette in that sector (generated to avoid clash)

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

### 4.1 Construction System

Ships are drawn procedurally from their **hull spec parameters** and **installed equipment**. No sprite sheets. Each ship is a Canvas path constructed at initialisation and cached as an offscreen canvas for performance.

The ship is always drawn pointing **upward** (angle 0 = nose up). Rotation is applied via canvas transform.

### 4.2 Hull Silhouette

Each hull class has a **silhouette template** — a parametric path generator that takes hull parameters and outputs a closed polygon. Templates are defined per hull class:

**Fighter class** — narrow, forward-tapered:
- Long central fuselage (narrow rectangle, slightly tapered at nose)
- Two small swept wings, low aspect ratio
- Single engine node at rear centre

**Courier class** — balanced, slightly wider:
- Moderate fuselage width
- Two moderate wings, straight
- Two engine nodes at rear

**Freighter class** — wide, flat, boxy:
- Wide rectangular body with flat nose
- Short stubby wings or none
- Two to four engine nodes, spread

**Heavy class** — large, armoured, dense:
- Thick fuselage, blunt nose
- Short angular wings with notches
- Four engine nodes

**Geometry bias** from faction modifies all templates:
- `angular`: sharpen all curves to points, add notches to wings
- `rounded`: soften wing tips, round the nose

### 4.3 Equipment Visibility

Installed equipment modifies the drawn silhouette:

| Equipment | Visual change |
|---|---|
| Forward thruster (heavy) | Larger/wider engine node at rear |
| Rotate thrusters (rear-mount) | Small nozzles added at rear corners |
| Rotate thrusters (forward-mount) | Small nozzles added at wing tips |
| Armour (heavy) | Hull outline gains an outer offset stroke, slightly thicker |
| Weapon (each slot) | Small hardpoint protrusion on hull edge, positioned by slot index |
| Sensor array | Small dish or antenna at nose |
| Hyperspace drive | Faint H-field ring drawn around the hull at 1.5× hull radius |

These are subtle — not elaborate — but a veteran player can read a ship's loadout at a glance.

### 4.4 Engine Glow

Each engine node renders a soft radial gradient in the faction's secondary colour when the forward thruster is active. Glow radius and opacity scale with thruster force. Reverse thrust renders a smaller forward-facing glow. Rotation thrusters render tiny side-facing glows on their respective nozzles.

All engine glows are additive blend mode — they bloom correctly against dark space.

### 4.5 Hull Damage

As HP decreases:
- Below 75%: faint crack lines appear on the hull (thin, irregular strokes in a dark colour)
- Below 40%: crack lines darken and multiply; small flicker-particles emit from the hull
- Below 15%: hull strobes between normal and a dim red tint; larger particle emission

### 4.6 Ship Scale Reference

All sizes in canvas units (1 unit ≈ 1px at base zoom):

| Class | Hull length | Hull width |
|---|---|---|
| Fighter | 32 | 16 |
| Courier | 40 | 24 |
| Freighter | 48 | 36 |
| Heavy | 56 | 42 |

The player's ship is always rendered at these sizes regardless of zoom. Other ships scale correctly relative to distance (no zoom currently planned, but the system should support it).

---

## 5. Landable Rendering

### 5.1 Planets

Planets are circles. Radius defined by their mass parameter (range: 40–120px). Rendered as:
1. Base fill: a radial gradient from a slightly lighter centre to a darker edge (simulates curvature)
2. Surface layer: 2–4 overlapping ellipses at low opacity in a secondary colour (continent/cloud suggestion)
3. Atmosphere ring: a soft outer glow in a desaturated version of the base colour, 8–16px wide
4. Terminator: a subtle dark crescent on one edge (consistent direction per sector, as if lit by the sector's star)

Colour palette driven by: faction primary colour tinted toward the planet's region type.
- Core regions: blue-white, high-tech feel
- Mid-ring: varied, earthlike hues
- Outer rim: grey-brown, desolate
- Near radiation zone: sickly yellow-green

### 5.2 Moons

Same system as planets, smaller (radius 16–32px), no atmosphere ring, greyscale-shifted palette with subtle crater circles (3–5 small dark circles offset from centre).

### 5.3 Space Stations

Stations are geometric assemblies viewed top-down. Built from a small library of **modules**:

| Module | Shape | Use |
|---|---|---|
| Core | Octagon or hexagon | Always present, station centre |
| Ring | Thin annulus around core | Large stations |
| Spoke | Thin rectangle, radial | Connects core to ring or docks |
| Dock arm | Short rectangle, tangential | Landing pads |
| Module pod | Small square or circle | Additional facilities |
| Antenna | Thin line + dot | Communications, sensors |

Station complexity scales with service tier:
- Basic (moon outpost): core + 2 dock arms
- Standard (station): core + ring + 4 spokes + dock arms
- Full (shipyard/military): core + ring + 8 spokes + module pods + antennas

Faction geometry bias applies: `angular` stations have hexagon cores and pointed spokes; `rounded` stations have circle cores and curved spokes.

Stations rotate very slowly (0.5–2 RPM depending on type) — always in the same direction for a given station, seeded per world-gen.

### 5.4 Landing Radius Indicator

When the player is within approach range of a landable, a dashed circle appears at the landing radius boundary. Colour: UI_ACCENT. Opacity scales with proximity (faint at edge, solid when close). Disappears once inside the radius.

---

## 6. Bullet and Weapon Effects

### 6.1 Bullet Visuals

Each bullet spec defines its visual type. A small set of visual templates covers all cases:

| Visual type | Appearance | Typical use |
|---|---|---|
| `bolt` | Short elongated oval, bright core, short trail | Standard kinetic rounds |
| `beam_pulse` | Thin rectangle, no trail, short lifespan | Energy weapons |
| `orb` | Circle with soft glow, slow-moving | Plasma, energy orbs |
| `missile` | Small triangle with engine glow trail | Seeking missiles |
| `mine` | Small hexagon, no velocity, pulsing outline | Deployed mines |

Colour is defined per bullet spec (set at world-gen time by Claude alongside the weapon's name and description).

### 6.2 Impact Effects

On bullet collision with a ship or landable:
- Small burst of 6–10 particles in the bullet's colour
- Particles expand outward and fade over 0.3s
- A brief flash on the hit ship's hull (white, 2 frames)

### 6.3 Explosion (Ship Destruction)

Ship destruction plays a 1-second particle explosion:
- Phase 1 (0–0.3s): rapid outward burst of bright particles in faction secondary colour
- Phase 2 (0.3–0.8s): slower debris fragments (irregular polygons, hull colour)
- Phase 3 (0.8–1.0s): fade out, leave a brief dark smoke cloud (low-opacity dark circle, fades over 2s)

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

### 7.4 Equipment Icons

Equipment items in the UI are represented by small 24×24px geometric glyphs drawn on Canvas:
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
- Left column (30%): landable name, rendered landable visual (same procedural renderer, larger), faction name in faction primary colour, lore text in UI_SECONDARY
- Right column (70%): tab content area

Tabs use a simple horizontal tab bar. Active tab: UI_ACCENT underline. Inactive: UI_SECONDARY text.

---

## 8. Animation Guidelines

All animations are time-based (delta time), not frame-based. This ensures consistent speed regardless of frame rate.

| Element | Animation |
|---|---|
| Engine glow | Scales with thruster input, instant on/off, slight pulse at idle |
| Station rotation | Constant angular velocity, seeded per station |
| Landing radius ring | Opacity lerps with proximity |
| Star twinkle | Sine wave brightness, 0.5–1.5s period, per-star random phase |
| Hull damage flicker | Random interval strobe below 15% HP |
| Bullet trails | Previous position retained for 3 frames, faded |
| Seeking missile | Smooth turn toward target, turn rate from spec |
| Explosion particles | Physics-based (velocity + drag + fade) |
| HUD bar changes | Lerp over 0.1s to new value (no jarring snaps) |
| Hyperspace jump | 0.5s radial white flash, sector transition, 0.5s fade in |
| Radiation vignette | Smooth opacity lerp as player approaches core |

---

## 9. Renderer Architecture Notes

These are guidelines for the engineering implementation of the art system.

- **Offscreen canvas caching**: Ship silhouettes are drawn once to an offscreen canvas on initialisation and when equipment changes. The cached canvas is used for all subsequent renders. This avoids re-computing paths every frame.
- **Layer order** (back to front): nebulae → deep stars → mid stars → near stars → landable atmosphere glows → landables → bullet trails → bullets → ship engine glows → ship hulls → ship damage particles → explosion effects → HUD → UI panels
- **World-to-screen transform**: a single transform function converts world coordinates to screen coordinates given the player's world position. All rendering goes through this function — no object knows its own screen position.
- **Faction visual objects**: at world-gen load time, a `FactionVisual` object is constructed per faction containing its colours and geometry bias. This is passed to all renderers for faction-owned entities.
- **Seed-based randomness**: all procedural visual decisions (star positions, planet surface ellipses, station spoke counts) use a seeded PRNG keyed on the sector or entity ID. This guarantees visual consistency across sessions without storing visual state.

---

*Art & Visual Design Guidelines v1.0 — Procedural vector, top-down, geometric modern indie. No external image assets. All visuals derived from game data.*
