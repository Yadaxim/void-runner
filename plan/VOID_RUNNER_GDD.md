# VOID RUNNER — Game Design Document v0.4

> *A 2D space trading and mercenary game inspired by Escape Velocity, with procedural world generation, faction reputation, fleet command, and neural-net-trained ship AI.*

---

## 1. Concept Summary

The player is a freelance pilot in a procedurally generated galaxy. No main quest — the player carves their own story by trading cargo, taking missions, building faction reputation, expanding their fleet, and occasionally fighting. The game's defining innovation is a **trainable ship AI**: the player records their own piloting in dedicated training simulators found across the galaxy, baking behaviour into neural networks stored on swappable memory cards.

**Target platform:** Browser (TypeScript + HTML5 Canvas)
**Genre:** 2D space sim / trader / emergent sandbox
**Tone:** Lonely, vast, slightly retrofuturist

---

## 2. Architecture: World Generation vs. Gameplay

### 2.1 Two Separate Modes

**World Generator** (offline tool, API-heavy)
- Standalone screen, separate from the game itself
- Calls the Claude API for: landable names and descriptions, equipment identity and lore, faction profiles, mission templates
- Also runs headless physics simulations to generate pre-trained memory card weights (see §7.9)
- Can take minutes to run; produces a self-contained **World File** (JSON)

**Game Runtime** (zero API calls)
- Loads a World File and runs entirely from it
- All procedural behaviour during play is deterministic and API-free
- World Files can be shared freely — no API key required to play

### 2.2 World File Structure

```
WorldFile {
  metadata:          { name, seed, version, generatedAt }
  galaxy:            { gridWidth, gridHeight, sectors[] }
  factions:          Faction[]
  hullSpecs:         HullSpec[]
  equipmentCatalog:  EquipmentItem[]       // includes pre-trained cards with embedded weights
  bulletSpecs:       BulletSpec[]
  missionTemplates:  MissionTemplate[]
}
```

### 2.3 Mission Instantiation at Runtime

Missions are not generated during play — they are instantiated from **templates** at mission board load time. The board fills in live variables (destination distance, expiry time) without any LLM call.

```typescript
interface MissionTemplate {
  id: string;
  title: string;
  descriptionTemplate: string;             // {tokens} substituted at runtime
  factionRequirements: {
    factionId: string;
    minReputation: number;                 // can be negative
  }[];
  regionType: RegionType;
  cargoWeightRange: [number, number];
  payoffPerDistanceUnit: number;
  reputationRewards: { factionId: string; amount: number }[];
}
```

### 2.4 World Generator UX

Accessible from the main menu:
- **New World** — Enter name and seed, choose galaxy size, click Generate. Progress bar during Claude API calls and simulation runs.
- **Load World** — Browse saved World Files
- **Share World** — Export as JSON download
- **Import World** — Load a JSON file from another player

---

## 3. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Type safety for complex sim data |
| Renderer | HTML5 Canvas 2D | Full rendering control, no engine overhead |
| Physics | Custom | Bespoke thruster/force model |
| Neural Net | TensorFlow.js | Browser-native training and inference |
| World Gen AI | Claude API | Lore, names, equipment flavour, mission templates |
| Persistence | localStorage + JSON export | World File and player save state |
| Build | Vite + TypeScript | Fast DX, minimal config |

No game engine. Sim loop, physics, rendering, and AI are all written from scratch.

---

## 4. Galaxy Structure

### 4.1 Shape and Density

The galaxy is a 2D grid (~30×30 sectors). Landable density follows a **spiral arm pattern** — two or three arms branching from a mid-ring, with sparse open space between arms and sparser outer systems. Sector contents are fully defined at world-gen time and revealed to the player as they explore.

**Radiation Zone (Galactic Core)**
- A circular exclusion zone centred on the galaxy grid
- Ships entering the fringe begin taking passive hull damage each tick
- Damage scales with proximity: mild at the edge, lethal near the true centre
- Permanently inaccessible — shapes the galaxy's geography, not a late-game reward
- Visually distinct: dense particle glow, colour shift, radiation warning on HUD

**Outer Rim**
- Fewer landables, smaller stations, limited equipment availability
- Frontier mission types, weaker faction presence
- Good for avoiding hostile factions

**Mid-Ring (Spiral Arms)**
- Dense landables, full services, training simulators
- Strong faction presence, best equipment
- High NPC ship traffic

### 4.2 Sectors

Each sector is finite. When the player crosses an edge, the adjacent sector loads with a brief transition. Contents: landables, NPC spawn rules, faction affiliation, ambient visuals (decorative).

### 4.3 Targets

Every ship maintains up to two active targets:

```typescript
interface TargetState {
  shipTarget?:     EntityId;    // another ship
  landableTarget?: EntityId;    // a landable body
}
```

Targets drive: landing (which body to approach), AI brains (who to follow or attack), guided weapons (seeking bullet lock-on), Guard mode (which position to hold near).

Player sets targets by clicking entities on screen or mini-map. Keyboard shortcuts: `Tab` cycles nearby ships, `G` cycles nearby landables. NPCs have targets set by their state machine.

---

## 5. Physics Model

### 5.1 Coordinate System

Ship always rendered at screen centre. All objects move in world coordinates relative to ship position.

### 5.2 Newtonian Movement

Every object: `position: Vector2`, `velocity: Vector2`, `angle: number`, `angularVelocity: number`, `mass: number`

Forces per tick: thruster forces, gravity. No drag — velocity persists until opposed.

### 5.3 Gravity

```
F = G * (shipMass * bodyMass) / distance²
```

`G` tuned for feel. Bullets with `attractedByGravity: true` are subject to the same field.

---

## 6. Ship System

### 6.1 Hull Definition

```typescript
interface HullSpec {
  id: string;
  name: string;
  description: string;
  sprite: string;
  hullMass: number;
  cargoCapacity: number;
  equipmentCapacity: number;
  equipmentWhitelist: EquipType[];
  baseTopSpeed: number;
  baseHP: number;
  weaponSlots: number;        // max distinct weapon types: 1 (small hull) to 5 (large hull)
}
```

### 6.2 Ship Instance State

```typescript
interface ShipState {
  hullSpecId: string;
  position: Vector2;
  velocity: Vector2;
  angle: number;
  angularVelocity: number;
  currentHP: number;
  fuel: number;
  cargo: CargoItem[];
  equipment: EquipmentSlot[];
  weaponLoadout: WeaponSlot[];   // ordered, one per fire key (Z X C V B)
  activeMissions: Mission[];
  brain?: NeuralBrain;
  memoryCards: MemoryCard[];
  activeCardId?: string;
  activeMode?: BrainMode;
  guardMode: boolean;            // meta-policy layered on Follow + Combat
  fleetRole: 'lead' | 'escort';
  targets: TargetState;
}
```

### 6.3 Thruster System

Four thruster slots, one item each:

| Slot | Default Key | Function |
|---|---|---|
| Forward | ↑ | Push forward along heading |
| Reverse | ↓ | Push backward along heading |
| Rotate CW | → | Rotate clockwise |
| Rotate CCW | ← | Rotate counter-clockwise |

**Mount position** (`'forward' | 'rear'`) affects combined firing:
- Rear-mounted rotation thrusters: both firing together adds reverse thrust
- Forward-mounted rotation thrusters: both firing together adds forward boost

**Auto-brake** (`Space`): fires opposing thrusters to cancel velocity. Equipment item or always-on per hull.

### 6.4 Weapon Slots and Stacking

Hull `weaponSlots` defines how many distinct weapon types can be loaded (1–5). Fire keys: `Z X C V B`.

**Stacking:** Multiple units of the same weapon type in one slot share one fire key. Effect: fire rate × stack count, with bullets alternating from slightly offset spawn points. Damage per bullet unchanged. UI shows ×N badge on the slot. Mechanically equivalent to higher DPS; visually and aurally distinct.

### 6.5 Equipment Types

| Type | Key Variables |
|---|---|
| Thruster | `force`, `mass`, `energyPerSecond`, `mountPosition` |
| Weapon | `mass`, `bulletSpecId`, `fireRate`, `energyCost` |
| Armour | `mass`, `hpBonus` |
| Fuel Tank | `mass`, `fuelCapacity`, `fuelType` |
| Hyperspace Drive | `mass`, `jumpRange`, `fuelCostPerJump`, `cooldown` |
| Auto-brake | `mass`, `brakeForce`, `energyCost` |
| Sensor Array | `mass`, `range`, `resolution`, `trackedObjectSlots` |
| Neural Brain | `mass`, `maxLayers`, `maxNeuronsPerLayer` |
| Memory Card | `mass` (negligible), `storageSlots`, `preTrainedNetworks?` |

All items named and described by Claude at world-gen time. Numeric values set algorithmically by tier.

### 6.6 Bullets

```typescript
interface BulletSpec {
  id: string;
  speed: number;                  // muzzle speed
  inheritShipVelocity: boolean;   // false = bullet ignores ship's current velocity
  damage: number;
  attractedByGravity: boolean;
  seeking: boolean;
  turnRatio?: number;             // seeking turn rate per tick
  infinite: boolean;
  lifespan: number;               // seconds; ignored if infinite
}
```

`inheritShipVelocity: false` + `speed: 0` = stationary mine deployed at ship's current position.
`inheritShipVelocity: false` + high `speed` = fixed-velocity beam regardless of ship motion.
`inheritShipVelocity: true` = realistic ballistics (default).

---

## 7. Neural Net Ship AI

### 7.1 Required Hardware

Three equipment items work together:
- **Sensor Array** — defines perception (input space)
- **Neural Brain** — defines network capacity (layers, neurons)
- **Memory Card** — stores trained networks; may come pre-trained from world-gen

### 7.2 Brain Modes

Three trained modes. Each is a distinct network on the active memory card:

| Mode | Target used | Behaviour |
|---|---|---|
| **Follow** | Ship target | Stay close, match velocity |
| **Combat** | Ship target | Engage and destroy |
| **Flee** | Ship target | Maximise distance from threat |

**Guard** is not a trained mode. It is a **behaviour policy** implemented in code:
- Ship holds position near its landable target (or last position)
- If a hostile enters sensor range → switch to Combat against that ship
- When hostile is gone → return to position-hold
- Toggled per escort in fleet management; no training required

### 7.3 Input Vector

Built from the sensor array each tick:

```
- Ship velocity (vx, vy)
- Ship angle, angular velocity
- HP ratio, fuel ratio
- For each tracked object slot (N per sensor tier):
    - Relative position (dx, dy)
    - Object type (one-hot: planet / station / escort / hostile / bullet / empty)
    - Object velocity (vx, vy)
    - Object HP ratio if ship
    - Is ship target flag
    - Is landable target flag
```

### 7.4 Output Vector

The AI can activate any input the player can activate:

```
[
  thrustForward,
  thrustReverse,
  rotateCW,
  rotateCCW,
  autoBrake,
  fireWeapon_Z,
  fireWeapon_X,
  fireWeapon_C,
  fireWeapon_V,
  fireWeapon_B,
]
```

All values [0,1], thresholded at 0.5. Unused weapon slots ignored.

### 7.5 Training Is Equipment-Bound

A trained network is calibrated to a specific equipment configuration. Changing thrusters, weapons, or sensor array flags the card as stale. The game warns the player and suggests retraining.

### 7.6 Memory Cards

```typescript
interface MemoryCard {
  id: string;
  label: string;
  equipmentSignature: string;       // hash of installed equipment config at training time
  networks: {
    follow?:  TrainedNetwork;
    combat?:  TrainedNetwork;
    flee?:    TrainedNetwork;
  };
  isPreTrained: boolean;            // true for world-gen generated cards
  lore?: string;                    // flavour text for pre-trained cards
}
```

Cheap, swappable, sold at most equipment stores. Multiple cards per ship inventory — a player might carry "combat loadout," "heavy escort," "light scout."

### 7.7 Training Simulators (Landable Service)

Found at: military outposts, pilot academies, advanced stations. Quality varies — finding elite simulators is part of progression.

| Tier | Modes offered | Environment |
|---|---|---|
| Basic | Follow only | Open space, single target |
| Mid | Follow + Flee | Obstacles, basic gravity |
| Advanced | All three | Asteroids, multiple targets, gravity wells |
| Elite (rare) | All three | Richest scenario variety; best training data |

**Training flow:**
1. Select mode and ship to train
2. Enter sandboxed sim environment
3. Fly/fight while session records (input vectors → player outputs)
4. End session → TensorFlow.js trains in a web worker → progress shown
5. Network written to selected memory card slot

**Training escort ships from the lead:** The player can record while flying the lead ship with an escort designated as the training subject. The escort's sensor perspective is captured each tick; the player's thruster commands are the target outputs. This teaches escort behaviour without switching control to the escort.

### 7.8 Brain Tiers

| Brain | Capacity | Notes |
|---|---|---|
| Mk I Cortex | 2×16 | Basic reactions |
| Mk II Cortex | 3×32 | Moderate combat |
| Mk III Battle-Mind | 4×64 | Complex multi-target |
| Experimental Frame | 5×128 | Rare, heavy, expensive |

### 7.9 Pre-Trained Memory Cards

Pre-trained cards are world-gen outputs embedded directly in the equipment catalog. They are generated by the World Generator (not the player) using **headless synthetic simulation**:

1. For each pre-trained card defined in the catalog, the World Generator runs a headless physics simulation — no player, no rendering
2. A scripted **rule-based pilot** follows deterministic logic for the target mode:
   - *Follow*: thrust toward target, match velocity, brake when close
   - *Combat*: lead target position, strafe, fire when aligned
   - *Flee*: thrust away from threat, rotate to maximise distance
3. Thousands of (input vector → output vector) pairs are generated from varied starting conditions
4. A TensorFlow.js model is trained on these pairs and the weights are serialized
5. Weights are embedded in the Memory Card item definition inside the World File

**Behaviour quality:** Pre-trained cards are competent but not adaptive. They handle standard situations well, fail in complex or unexpected ones. A player-trained card from an elite simulator will outperform them in edge cases. This preserves the value of the training system.

**Legendary pre-trained cards** (rare loot or faction rewards) are trained on richer synthetic scenarios — more varied positions, gravity edge cases, multi-threat environments — giving them a wider behavioural repertoire. They have Claude-generated lore ("This card belonged to Commander Vael, lost at the Siege of Kethara Station") and are meaningfully better than store-bought cards without being better than a skilled player's trained card.

---

## 8. Fleet System

### 8.1 Owning Multiple Ships

**Fleet cap: 5 ships** (1 lead + 4 escorts). Player pilots the lead; escorts fly autonomously on their active brain mode. NPCs are always single ships — the fleet concept is exclusive to the player.

Ships purchased at shipyards. New escort spawns near the landable on departure, pre-loaded with a basic Follow card tuned to a standard hull config.

### 8.2 Fleet Travel

Escorts run Follow mode toward the lead ship. If an escort has no Follow network, it drifts. Player must retrain or leave it at a landable.

### 8.3 Hyperspace (Fleet)

**Hyperspace target:** The player designates any revealed sector on the galaxy map as a hyperspace target. The lead ship auto-aligns to point toward it on jump. Each jump advances along the route; the target persists until changed or reached.

**Fleet jump sequence:**
1. Player presses hyperspace key
2. All drives-equipped ships **automatically align** to the jump heading — hardcoded fleet command, no brain required
3. Confirmation prompt lists any ships that cannot jump (no drive, insufficient fuel) and asks whether to leave them behind
4. Player confirms → all capable ships jump simultaneously, maintaining relative positions on arrival
5. Ships left behind hold position on their current mode

### 8.4 Landing with a Fleet

All ships must be within landing radius and below speed threshold. If any ship will be left behind, a confirmation prompt appears before landing proceeds.

### 8.5 Fleet Management Screen

Accessible from pause menu or HUD button, also always available when landed:
- All owned ships: hull, HP, fuel, cargo
- Per ship: active memory card, active mode, Guard toggle, assigned targets
- Cargo transfer (when landed or in close proximity)
- Mission cargo assignment per ship
- Insurance status per ship

---

## 9. Sectors & Landables

### 9.1 Landable Types and Services

| Type | Typical Services |
|---|---|
| Planet | Refuel, mission board, sometimes shipyard or equipment |
| Moon | Refuel, small equipment store |
| Space Station | Refuel, equipment store, training simulator, mission board |
| Military Outpost | Refuel, advanced training simulator, faction missions |
| Shipyard Station | Full shipyard, equipment store, basic simulator |

### 9.2 Landing

- Player (+ fleet) within radius, below speed threshold → `[L] LAND` prompt
- If any fleet ship will be left behind: confirmation prompt first
- Landing animation → Landable Screen

### 9.3 Landable Screen Tabs

- **Overview** — Name, description, faction, lore (Claude-generated at world-gen)
- **Refuel** — Buy fuel at local price
- **Shipyard** *(if present)* — Browse hulls, buy, trade in current ship
- **Equipment** *(if present)* — Buy/sell, manage installed gear, view memory cards
- **Mission Board** *(if present)* — Browse and accept missions
- **Training Simulator** *(if present)* — Train brain modes on this landable's sim tier
- **Fleet** — Always available when landed; full fleet management

---

## 10. Economy and Progression

### 10.1 Credits

Earned: mission completion, equipment and ship sales.
Spent: fuel, equipment, hulls, memory cards, insurance premiums.

### 10.2 Insurance

**Lead ship** — always insured by default.
**Escort ships** — optional per-ship insurance, purchasable at stations.

On destruction:

| Option | Cost | Result |
|---|---|---|
| Claim & Repair | Pay 10% of ship total value | Respawn at last landable, ship and equipment intact |
| Total Loss Payout | Receive 90% of ship total value | Respawn with basic starter hull; rebuild from capital |
| Transfer Command *(escorts survive)* | Free | Take over a surviving escort as new lead; lost ship gone |

Escort insurance on destruction: pay 10% to respawn it at nearest friendly landable, or receive 90% of its value in credits.

### 10.3 Progression Path

Credits → equipment → better faction missions → new sectors → new hulls → fleet expansion → richer AI training → harder regions

No XP, no skill trees. Power comes from ship configuration and trained AI quality.

---

## 11. Faction System

### 11.1 Factions

Generated at world-gen time by Claude: name, description, cultural identity, home region, inter-faction dispositions.

### 11.2 Player Reputation

Range: **-100 to +100**. Starting: 0 (Neutral) with all factions.

Increases: completing faction-scoped missions, public missions in faction territory.
Decreases: attacking or destroying faction ships, failing faction missions.

### 11.3 Reputation Tiers

| Range | Status | Effects |
|---|---|---|
| 80–100 | Allied | All missions visible, store discounts, hire escorts |
| 40–79 | Friendly | Most missions visible |
| -39–39 | Neutral | Public missions only |
| -40–79 | Unfriendly | NPC ships may tail player; some stores closed |
| -80–-100 | Hostile | NPC ships attack on sight |

### 11.4 Multi-Faction Mission Requirements

Mission templates can require reputation conditions with multiple factions simultaneously, including negative thresholds:

```typescript
factionRequirements: [
  { factionId: 'federation', minReputation: 60 },
  { factionId: 'rebel_front', minReputation: -50 },  // must be hostile to rebels
]
```

Enables: alliance missions, war contracts, neutral broker jobs, double-agent scenarios.

### 11.5 Pirates

The Pirate faction reputation is **derived**, not set directly:

```
pirateRep = -clamp(average(all other faction reps), -100, 100)
```

Low standing with mainstream factions → high pirate rep → access to pirate mission boards and black-market equipment. A respected trader is shot on sight by pirates. A wanted outlaw is welcomed. No explicit morality system needed.

---

## 12. Mission System

### 12.1 Cargo Missions

```typescript
interface Mission {
  id: string;
  templateId: string;
  title: string;
  description: string;
  factionRequirements: { factionId: string; minReputation: number }[];
  cargoWeight: number;
  destinationLandableId: string;
  destinationSectorCoord: Vector2;
  destinationName: string;
  payoff: number;
  reputationRewards: { factionId: string; amount: number }[];
  expiryTime?: number;
}
```

### 12.2 Active Mission HUD

Collapsible panel: destination, sector coordinates, cargo weight, payoff, time remaining. Tapping a mission highlights the destination on the mini-map and optionally sets it as the hyperspace target.

### 12.3 Delivery

Landing at destination landable with mission cargo in any fleet ship's hold completes the mission: credits paid, reputation updated, cargo removed.

---

## 13. HUD and UI

### 13.1 Flight HUD

| Element | Notes |
|---|---|
| Mini-map | Sector view: player, landables, NPC ships, mission targets, current targets highlighted |
| Velocity indicator | Speed and heading vector |
| Fuel gauge | Current / max |
| HP bar | Colour-coded by threshold |
| Fleet status strip | Per escort: HP bar, active mode, Guard indicator, drift alert |
| Weapon strip | Per slot: type, ×N stack badge, fire key, cooldown |
| Target display | Ship target name + HP; landable target name |
| Active missions | Collapsible: destination + distance |
| Landing prompt | Appears near landable at low speed: `[L] LAND` |
| Hyperspace indicator | Charge/cooldown + target sector label |
| Radiation warning | Intensifies on approach to galactic core |

### 13.2 Galaxy Map

- Shows all revealed sectors with faction colour coding
- Radiation zone rendered as a glowing exclusion ring at centre
- Spiral arm density visible as landable-count shading
- Hyperspace target selector: click any revealed sector to set as target
- Mission destinations marked

### 13.3 Pause / System Menu

- Full ship status (equipment, cargo, credits, insurance)
- Fleet management
- Galaxy map
- Active missions (full detail)
- Settings

---

## 14. Build Phases

### Phase 1 — Core Flight (MVP)
- [ ] Canvas renderer, ship-centred camera
- [ ] Newtonian physics: velocity, thrusters, gravity
- [ ] Single ship, four thrusters, player input
- [ ] Single hardcoded sector, one landable
- [ ] Landing, refuel, fuel system

### Phase 2 — World Loading and Sectors
- [ ] World File JSON schema and loader
- [ ] Sector grid, edge transitions
- [ ] Multiple landable types and services
- [ ] Radiation zone damage scaling from centre
- [ ] Galaxy persistence (localStorage)

### Phase 3 — Economy and Missions
- [ ] Mission board (template instantiation at runtime)
- [ ] Credits economy, equipment buying and selling
- [ ] Active mission HUD, hyperspace target from mission tap

### Phase 4 — World Generator
- [ ] Standalone world-gen screen
- [ ] Claude API: landables, factions, equipment, mission templates
- [ ] Spiral arm density map generation
- [ ] Headless simulation + TF.js training for pre-trained cards
- [ ] World File export, import, share

### Phase 5 — Combat and NPCs
- [ ] Bullet physics (velocity inheritance, gravity, seeking)
- [ ] Multi-slot weapon system, stacking, fire keys Z–B
- [ ] Target system (Tab / G cycling, click-to-target)
- [ ] NPC ships with state-machine AI (single ships only)
- [ ] Faction reputation system, pirate derived rep
- [ ] Armour, HP, insurance (lead + escort)

### Phase 6 — Fleet System
- [ ] Multi-ship ownership (cap: 5)
- [ ] Fleet landing and hyperspace confirmation prompts
- [ ] Hyperspace target selector on galaxy map
- [ ] Fleet auto-alignment and jump sequence
- [ ] Guard mode (behaviour policy in code)
- [ ] Fleet management screen
- [ ] Starter pre-trained Follow cards on purchased escorts

### Phase 7 — Neural Net AI
- [ ] Sensor array input vector construction (with target flags)
- [ ] Full output vector (thrusters + weapons + auto-brake)
- [ ] Neural Brain and Memory Card equipment
- [ ] TensorFlow.js model architecture and web worker training pipeline
- [ ] Training simulator landable service (all three modes, tiered)
- [ ] Escort training from lead ship perspective
- [ ] Equipment-change staleness detection and warning
- [ ] Autopilot toggle, mode switching in HUD

### Phase 8 — Polish
- [ ] Multiple hull sprites, visually distinct per type
- [ ] Hyperspace and radiation visual effects
- [ ] Sound design (Web Audio API)
- [ ] Full galaxy map screen
- [ ] World sharing UI (export/import from main menu)

---

*Document version 0.4 — All open questions resolved. Fleet cap 5. NPCs single ships only. Trade economy deferred. Pre-trained cards via headless synthetic simulation. Legendary cards with Claude-generated lore. Ready for project scaffolding.*
