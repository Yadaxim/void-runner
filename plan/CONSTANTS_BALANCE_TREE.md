# Constants dependency tree and balance plan

This document maps how values in `src/constants.ts` depend on each other (in code or in gameplay), how they interact with **world data** (`HullSpec`, equipment items, landables, bullets), and a practical order for tuning. It is aimed at ship/equipment balancing and giving the world generator sane defaults per ship type.

Path: **`plan/CONSTANTS_BALANCE_TREE.md`**

---

## Balance checklist (do in this order)

Work top to bottom; each step assumes the ones above are settled. Sub-bullets are world JSON unless labelled `constants`.

- [ ] **1. Sector scale** — `SECTOR_SIZE`, `SECTOR_EDGE_THRESHOLD` (`constants`; edge threshold = 1% of size)
- [ ] **2. Gravity** — `GRAVITY_CONSTANT`, `MIN_GRAVITY_DISTANCE` (`constants`); landable **`mass`** tiers (world)
- [ ] **3. Landing / jump / pad UX** — `LANDING_SPEED_THRESHOLD`, `HYPERSPACE_MAX_SPEED` (tied), `TAKEOFF_VELOCITY`, `HYPERSPACE_ALIGN_MAX_ANGLE_RAD`, `LANDING_RADIUS_MULTIPLIER` (`constants`); landable **`radius`** (world)
- [ ] **4. Hull speed clamps** — `HullSpec.topSpeed`, `topAngularSpeed` per archetype (world)
- [ ] **5. Mass, thrust, capacity** — `hullMass`, thruster **`force`**, **`equipmentCapacity`**, **`cargoCapacity`**; verify **`raw` / `basic` / `advanced`** loadouts under capacity (world); iterate per hull class before global nudges
- [ ] **6. Fuel loop** — `FUEL_USE_LINEAR_THRUSTER_PER_SECOND`, `FUEL_USE_ROTATION_THRUSTER_PER_SECOND`, `FUEL_CAPACITY_DEFAULT` (`constants`); fuel tank items and starter fuel (world)
- [ ] **7. Combat pacing** — bullet specs (damage, mass, speed), `baseHP`, armour/shield items (world); `BULLET_MOMENTUM_TRANSFER_SCALE`, `BULLET_MAX_IMPACT_DELTA_V`, `HULL_DIMENSIONS` if hitbox feel matters (`constants`)
- [ ] **8. NPC behaviour** — transit/patrol/combat ranges, loiter timers, `NPC_ARRIVAL_SPEED_MIN` / `MAX`, `NPC_EDGE_INSET`, ally alert range, etc. (`constants`); re-check vs sector size and player `topSpeed`
- [ ] **9. Radiation** — `RADIATION_INNER_RADIUS`, `RADIATION_OUTER_RADIUS` vs galaxy grid extent; `MAX_RADIATION_DAMAGE_PER_SECOND` (`constants`); align with repair/refuel affordability
- [ ] **10. Economy** — `MISSION_MIN_DISTANCE`, `MISSION_MAX_DISTANCE`, `MISSION_PAYOFF_MIN`, `MISSION_BOARD_COUNT`, `MISSION_DELIVERY_DISPLAY_TIME` (`constants`); refuel/repair/insurance prices and rates; `EQUIPMENT_STORE_COUNT`, `EQUIPMENT_SELL_FRACTION` (`constants`); prices in world data
- [ ] **11. Reputation** — `REP_FLOOR_*`, `REP_CEILING_*`, `REP_PENALTY_*` (`constants`)
- [ ] **12. Density / polish (last)** — `MAX_LANDABLES_PER_SECTOR`, `MAX_FLEET_SIZE` (`constants`); presentation-only values (stars, minimap, hyperspace jump seconds, NPC fade) if needed

**World generator sanity** (after step 5, or in parallel): §6 — hull-class defaults, landable mass/radius/service tiers, NPC hull brake checks, mission reachability, radiation vs grid.

---

## 1. What lives where

| Source | Examples | Role in balance |
|--------|----------|-----------------|
| **`src/constants.ts`** | Gravity, sector size, NPC ranges, fuel burn, landing/jump speeds | Global “rules of the world”; change once, affects all ships. |
| **World JSON** (`hullSpecs`, `equipment`, `landables`, `bulletSpecs`, sectors) | `hullMass`, `topSpeed`, thruster `force`, item `mass`, landable `mass` / radius | Per-hull and per-item tuning; stacks with constants. |

Effective ship mass in flight is **`hullMass + Σ(equipment mass) + Σ(cargo weight)`** (`ShipEntity.getEffectiveMass`). Thruster acceleration scales as **force / effective mass**. Bullet impact knockback in code uses **`hullMass` only** (not effective mass)—see §5.

---

## 2. Explicit dependencies (defined in source)

These are hard links in `constants.ts` or trivial re-exports.

```text
LANDING_SPEED_THRESHOLD
└── HYPERSPACE_MAX_SPEED   (= same value; jump speed gate matches landing)

COLOURS
└── STAR_COLOURS           (array of star tints)

HULL_DIMENSIONS
└── hullLengthForHullClass()   (muzzle / rendering; combat uses this for ship hit radius)
```

No other constants in that file reference each other numerically. Everything else is **logical coupling** (same units, same loop, or same space).

---

## 3. Gameplay dependency tree (conceptual)

Read top → bottom as **foundation first**: lower nodes set the scale; upper nodes should be adjusted to match.

### 3.1 Time step (affects everything uniformly)

```text
MAX_DELTA_SECONDS
└──► All integration (physics, AI, timers). Rarely a balance lever; lower = smoother, more CPU.
```

### 3.2 Sector space (metres — the common ruler)

```text
SECTOR_SIZE (square extent)
├── SECTOR_EDGE_THRESHOLD          (= 1% of size; boundary warnings / wrap feel)
├── npcController + sector         (TRANSIT_*, PATROL_*, NPC_* ranges, loiter radii)
├── flightScreen                   (player bounds, hyperspace presentation scale)
└── landableLayer                    (LANDING_RADIUS_MULTIPLIER × landable.radius — still landable data)

NPC_ARRIVAL_SPEED_MIN / MAX, NPC_EDGE_INSET
└──► Spawn approach; compare mentally to typical player topSpeed (world: HullSpec.topSpeed).
```

If you change sector size, revisit **all distance constants** imported by `npcController.ts` (transit, patrol, combat ranges) so behaviour stays “similar in sector-fractions,” not absolute metres.

### 3.3 Gravity (metres; independent of ship mass for acceleration)

```text
GRAVITY_CONSTANT
MIN_GRAVITY_DISTANCE
└──► computeGravity(): acceleration magnitude ∝ G × bodyMass / r²
    (shipMass in force cancels against F/m in integration — heavier ships are not “slower in gravity” from mass alone.)
```

Coupling: strong gravity near dense landables changes **typical approach speeds**; compare to **`LANDING_SPEED_THRESHOLD`** and **`TAKEOFF_VELOCITY`** so docking and NPC braking still feel right.

### 3.4 Flight gates and land / jump UX

```text
LANDING_SPEED_THRESHOLD
├── HYPERSPACE_MAX_SPEED           (explicit equality)
├── flightScreen, hudRenderer, npcController   (can I land? brake until below threshold?)
└──► Tune with: TAKEOFF_VELOCITY, landable.radius (world), LANDING_RADIUS_MULTIPLIER

HYPERSPACE_ALIGN_MAX_ANGLE_RAD
└──► Jump aim tolerance (independent of speed unless you want stricter jumps when fast)

TAKEOFF_VELOCITY
└──► Initial push when leaving pad; should feel coherent with landing threshold, not fight it.
```

### 3.5 Fuel loop (constants ↔ equipment ↔ hull)

```text
FUEL_USE_LINEAR_THRUSTER_PER_SECOND
FUEL_USE_ROTATION_THRUSTER_PER_SECOND
└──► shipEntity.applyThrusterInputs(): fuel drain scales with how many thruster groups are active.

FUEL_CAPACITY_DEFAULT
└──► Default cap if hull/fuel tank does not define otherwise (check `worldState` / starter build).

World data: thruster force, hullMass + equipment mass (affects how long you burn thrust to cross a sector),
           fuelTank items (capacity, mass).
```

### 3.6 Combat and impacts

```text
HULL_DIMENSIONS  →  weaponSystem hit radius (half hull length by class)

BULLET_MOMENTUM_TRANSFER_SCALE
BULLET_MAX_IMPACT_DELTA_V
└──► weaponSystem.applyImpactMomentum(): Δv from bullet, capped.
    Uses hullSpec.hullMass only (not full ship mass) — see §5.

World: bulletSpec.mass, damage, fire rates; hull baseHP; armour/shield items.
```

### 3.7 NPC AI behaviour (metres + seconds)

```text
NPC_AGGRO_RANGE, NPC_FIRE_RANGE, NPC_PREFERRED_COMBAT_RANGE
NPC_DEAGGRO_RANGE_MULTIPLIER, NPC_FLEE_HP_THRESHOLD, NPC_STRAFE_INTERVAL, NPC_THREAT_MEMORY_DURATION
PATROL_WAYPOINT_*, TRANSIT_LOITER_*, TRANSIT_APPROACH_BRAKE_RADIUS, …
└──► All should stay in sensible ratios to SECTOR_* and to each other (e.g. fire range < aggro range).
```

`TRANSIT_APPROACH_BRAKE_RADIUS` is explicitly compared to **`LANDING_SPEED_THRESHOLD`** for velocity when NPCs approach pads.

### 3.8 Radiation (grid coordinates — not metres)

```text
RADIATION_INNER_RADIUS, RADIATION_OUTER_RADIUS   (distance from galactic centre in sector-grid space)
└──► getRadiationIntensityAtCoord() → 0…1 falloff

MAX_RADIATION_DAMAGE_PER_SECOND
└──► flightScreen: hull damage ∝ intensity × this constant × dt

RADIATION_VIGNETTE_MAX_OPACITY, RADIATION_PARTICLE_COUNT
└──► Presentation only (still “reads” as danger with damage rate)
```

Changing **`GALAXY_GRID_WIDTH/HEIGHT`** in constants vs world file shifts how many sectors sit inside the radiation annulus; keep **inner/outer radii** in mind when resizing the grid.

### 3.9 Missions and economy (grid hops + credits)

```text
MISSION_MIN_DISTANCE, MISSION_MAX_DISTANCE   (grid distance between sector coords)
MISSION_PAYOFF_MIN, MISSION_BOARD_COUNT
└──► Compare to faction mission tiers and equipment prices in world data.

REFUEL_RATE, REFUEL_PRICE_PER_UNIT
REPAIR_RATE_HULL, REPAIR_RATE_ARMOUR, REPAIR_PRICE_*
INSURANCE_* 
└──► Loop with combat DPS (world) and radiation damage constant.
```

### 3.10 Reputation (mostly self-contained)

```text
REP_FLOOR_*, REP_CEILING_*, REP_PENALTY_*
└──► combat/reputation.ts; couples to mission outcomes via design, not physics.
```

### 3.11 Galaxy capacity (world gen)

```text
MAX_LANDABLES_PER_SECTOR, MAX_FLEET_SIZE
└──► Density / UI; weak coupling to performance and mission pick diversity.
```

### 3.12 Rendering / UI (balance-weak)

```text
STAR_LAYER_COUNTS, STAR_SCROLL_FACTORS, MINIMAP_SIZE, EQUIPMENT_ICON_SIZE,
NPC_FADE_DURATION, NPC_LEAVING_OPACITY, ARRIVAL_MESSAGE_DURATION_MS,
HYPERSPACE_JUMP_* , HYPERSPACE_OFFSCREEN_METRES
└──► Feel and readability; indirect balance (information, stress).
```

### 3.13 AI neural I/O sizes

```text
AI_OUTPUT_THRESHOLD, INPUT_VECTOR_BASE_SIZE, OUTPUT_VECTOR_SIZE
└──► Must stay aligned with simulation features that feed the net (not general ship tuning).
```

---

## 4. Recommended tuning order (workflow)

Use the **Balance checklist** at the top of this file as the working list. The dependency tree in §3 explains *why* that order avoids circular fixes (e.g. thrusters → mass → fuel → mission time). Iterate **per hull archetype** at checklist steps 5–7 before global constant nudges.

---

## 5. Code quirk to remember when balancing mass

- **Thrusters & rotation** use **`getEffectiveMass()`** (hull + all equipped items + cargo).
- **Bullet knockback** uses **`hullSpec.hullMass` only** (`weaponSystem.applyImpactMomentum`).

So raising **equipment mass** tightens flight and rotation but does **not** reduce bullet push. If that becomes noticeable, either adjust knockback to use effective mass (code change) or tune **`BULLET_MAX_IMPACT_DELTA_V`** / bullet masses with that asymmetry in mind.

---

## 6. World generator: sane defaults by hull class

These are **data conventions**, not `constants.ts` fields. Goal: generated worlds stay playable without hand-tuning every hull.

### 6.1 `HullSpec` axes (per class)

| Class | `hullMass` | `topSpeed` / `topAngularSpeed` | `equipmentCapacity` | `cargoCapacity` | Notes |
|--------|------------|--------------------------------|---------------------|-----------------|--------|
| **fighter** | Lowest in roster | Highest speed; high turn rate | Tight; few optional slots | Small | Nimble; sensitive to +mass weapons. |
| **courier** | Light–mid | High linear, moderate turn | Enough for fuel + small def | Mid | Jack-of-all-trades for procgen tests. |
| **freighter** | Heavy | Low speed; low turn | Large (many systems) | Large | Needs strong thrusters in **basic** loadout or it never reaches pad speed. |
| **heavy** | Heaviest | Mid–low speed; moderate turn (turret platform feel) | Very large | Mid–large | Often armour/weapons mass-heavy; watch **effective mass** vs thruster `force`. |

**`defaultLoadouts`:** For each hull, keep **`raw`** flyable (required slots only, cheapest items), **`basic`** a comfortable career start, **`advanced`** stress-test without exceeding **`equipmentCapacity`**. Validation already requires all three (`world/validation.ts`).

### 6.2 Landables (for generator + gravity feel)

- **`mass`:** Sets gravity well strength with `GRAVITY_CONSTANT`. Use a **small set of tiers** (e.g. outpost / station / hub) so procgen does not produce one-off gravity surprises.
- **`radius`:** Landing HUD uses **`LANDING_RADIUS_MULTIPLIER × radius`**. Keep radius consistent with sprite / pad size; if you shrink radius, consider whether threshold speeds still allow safe approaches.
- **Services:** Missions filter destinations with refuel (`missionBoard.ts`); ensure enough **refuel-capable** landables in generated networks.

### 6.3 Cross-checks for automated worlds

- Any NPC hull: **`topSpeed`** and thruster **`force` / `hullMass`** such that NPCs can brake below **`LANDING_SPEED_THRESHOLD`** before `TRANSIT_APPROACH_BRAKE_RADIUS` matters.
- **Mission grid distances** (`MISSION_MIN_DISTANCE` / `MAX`) vs galaxy size: avoid worlds where no refuel destination exists in range.
- **Radiation:** If the grid is small, inner/outer radii may blanket most sectors — adjust radii or grid extent together.

---

## 7. Summary diagram (high level)

```text
                    [ Economy / missions / rep ]
                                    ▲
                    [ Radiation damage + repair loop ]
                                    ▲
[NPC / transit / combat ranges] ◄──► [ Sector metres ]
            │                              ▲
            │                    [ Gravity + landable mass ]
            ▼                              │
    [ Landing / jump speed gates ]         │
            ▲                              │
            └── [ Hull top speeds + thruster force / mass ]
```

---

*Generated for VoidRunner balance prep; primary source: `src/constants.ts`, `src/simulation/shipEntity.ts`, `src/physics/gravity.ts`, `src/simulation/weaponSystem.ts`, `src/simulation/npcController.ts`, `src/types/ship.ts`.*
