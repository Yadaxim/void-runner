# Weapons & bullets — world generator reference

Guide for **offline world generation** and hand-authored `WorldFile` JSON: how combat weapons work in Void Runner, what each field does at runtime, and how to invent valid `bulletSpecs` + weapon entries.

**Canonical types:** `src/types/bullet.ts`, `src/types/equipment.ts`  
**Runtime:** `src/simulation/weaponSystem.ts`, `src/simulation/bulletEntity.ts`, `src/combat/damage.ts`  
**Validation:** `src/world/validation.ts`

---

## 1. Two layers — always generate both

A player-facing “gun” is **two records**:

| Layer | `WorldFile` array | Role |
|--------|-------------------|------|
| **Projectile** | `bulletSpecs[]` | Physics, direct-hit damage, matter type, behaviours |
| **Launcher** | `equipmentCatalog[]` (`type: "weapon"`) | Fire rate, energy cost, mass, shop price; points at a bullet |

```text
equipmentCatalog[].bulletSpecId  ──►  bulletSpecs[].id
```

**Generator rules:**

- Every weapon’s `bulletSpecId` must resolve to a bullet id.
- One bullet can be shared by multiple launchers (different `fireRate` / `mass` / price).
- **`fireRate` lives on the weapon only**, not on the bullet.
- LLM output: **names and descriptions** on both records; **stats** come from templates or procedural rolls.

---

## 2. How combat resolves (runtime)

Use this when tuning or explaining generated weapons.

### 2.1 Firing

1. Player/NPC holds fire key while `cooldownRemaining === 0`.
2. Spawns `BulletEntity`(s) from muzzle; optional stack offsets for multi-barrel slots.
3. Cooldown: `1 / fireRate` seconds.

### 2.2 Projectile flight

- Velocity from `speed`, `inheritShipVelocity`, optional **`seeking`** (turn toward locked target at `turnRatio` rad/s).
- Optional **`ballistic`**: gravity acceleration × `(scale ?? 1)` toward landable wells.
- Expires on hit or when `age >= lifespan` (unless `infinite: true`).

### 2.3 Direct impact (first ship hit, not owner)

| Step | Behaviour |
|------|-----------|
| Collision | Skips **`ownerId` only** — allies and neutrals can be hit |
| Instant damage | `damage` via shield → armour (`reductions[matterType]`) → hull (no reduction) |
| DoT | If `dot` ability: start/refresh **one burn per ship** (max duration, max DPS); **no shields** on ticks |
| Knockback | Only if `knockback` ability; impulse × `(scale ?? 1)`, capped globally |
| Reputation | Player direct hits on NPCs still apply rep penalties |

### 2.4 Explosive detonation (on impact, if `explosive` ability)

Second pass at impact point:

| Step | Behaviour |
|------|-----------|
| Targets | **Every** ship in `radius` (including **owner**) |
| Damage | `splashDamage × falloff(distance)` — **not** the same as direct `damage` |
| DoT | If bullet has `dot`, apply burn to each ship that takes splash damage |
| Reputation | **No** rep change from splash |

**Falloff:**

```text
multiplier = max(0, 1 - (distance / radius) ^ falloffExponent)
splash_dealt = splashDamage × multiplier
```

`falloffExponent` defaults to **1** (linear to zero at edge).

### 2.5 Energy

`WeaponItem.energyCost` is stored and shown in UI; **not deducted on fire** yet. Set plausible values for future reactor gating.

---

## 3. `BulletSpec` — field reference

| Field | Type | Required | Meaning |
|--------|------|----------|---------|
| `id` | string | yes | Stable key; referenced by weapons. `snake_case`. |
| `name` | string | yes | Display / LLM flavour. |
| `mass` | number | yes | Projectile mass; affects knockback when `knockback` present. |
| `speed` | number | yes | Muzzle speed (world units/s). `0` = drops at muzzle (orb). |
| `inheritShipVelocity` | boolean | yes | `true`: adds ship velocity to muzzle vector (bolts). `false`: missiles/orbs. |
| `damage` | number | yes | **Direct impact only** instant damage. |
| `matterType` | enum | yes | `normal` \| `anti` \| `dark` \| `void` — armour reduction column for instant + DoT. |
| `abilities` | array? | no | Stackable behaviours (see §4). At most **one entry per `type`**. |
| `infinite` | boolean | yes | Rare; if `true`, no lifespan expiry. |
| `lifespan` | number | yes | Max age in seconds. Range ≈ `speed × lifespan` for straight shots. |
| `visualType` | enum | yes | `bolt`, `beam_pulse`, `orb`, `missile`, `mine` — render hint only. |
| `colour` | string | yes | Hex trail/impact colour. |

**Removed (invalid in new worlds):** `damageCategory`, `dotDuration`, `dotDamagePerSecond`, `attractedByGravity`.

---

## 4. `abilities[]` — reference

| `type` | Fields | Runtime effect |
|--------|--------|----------------|
| `seeking` | `turnRatio` ≥ 0 | Homes on shooter’s locked target; speed magnitude kept |
| `dot` | `damagePerSecond` ≥ 0, `duration` > 0 | Burn after hit/splash; shield skipped; one burn per ship, max-merge on re-hit |
| `knockback` | `scale?` ≥ 0 (default 1) | Impact shove; absent ⇒ no shove even if `mass` is high |
| `ballistic` | `scale?` ≥ 0 (default 1) | Gravity pull on projectile |
| `explosive` | `radius` > 0, `splashDamage` ≥ 0, `falloffExponent?` > 0 | Splash pass on impact (§2.4) |

**Valid combinations:** any mix of different types, e.g. `seeking` + `explosive` + `knockback` + `dot`.

**Delivery conventions (not separate enums):**

| Player-facing role | Typical stats + abilities |
|--------------------|---------------------------|
| **Laser / pulse** | High `speed`, low `mass`, `matterType: normal`, no `knockback` |
| **Slug / rail** | Medium `speed`, high `mass`, `knockback`, often `ballistic` |
| **Missile** | `inheritShipVelocity: false`, `visualType: missile`, optional `seeking` |
| **Plasma / emitter** | Low `speed`, `dot`, `visualType: orb` |
| **Mine** (future) | `speed: 0`, long `lifespan`, `visualType: mine` |

---

## 5. `WeaponItem` — field reference

| Field | Meaning |
|--------|---------|
| `bulletSpecId` | Must exist in `bulletSpecs` |
| `fireRate` | Shots per second; cooldown `1/fireRate` |
| `energyCost` | Per-shot cost (display / future systems) |
| `mass`, `price`, `tier`, `factionAffinity` | Economy + loadout capacity |

---

## 6. Armour — `matterType` only

```typescript
type MatterType = 'normal' | 'anti' | 'dark' | 'void';
type ArmourReductionProfile = Record<MatterType, number>;
```

Each armour item **must** define all four keys (validation). Values are flat subtraction before damage applies to that armour layer HP:

```text
effective = max(0, damage - reductions[matterType])
```

- **Negative** reduction = vulnerability on that matter.
- **Hull** has no reduction table — full damage once armour is gone.
- **`void` matter** on bullets uses `reductions.void` like any column; make void resistance **rare** on plates for flavour, not special code rules.
- **Shields** absorb instant `damage` for all matter types equally; DoT never hits shields.

---

## 7. Generator axes (inventing weapons)

### 7.1 Pick matter + abilities + stats

1. Choose **`matterType`** for armour matchup (faction theme).
2. Choose **abilities** for behaviour.
3. Set **`damage`**, `splashDamage` (if explosive), `speed`, `mass`, `lifespan`.
4. Create **launcher** with `fireRate` / `energyCost` / `mass`.

### 7.2 Derived metrics (spreadsheet helpers)

```text
direct_dps           ≈ damage × fireRate
dot_total            ≈ dot.damagePerSecond × dot.duration   (per target, one burn)
splash_at_center     = splashDamage                         (if explosive)
effective_range      ≈ speed × lifespan                     (straight line)
```

### 7.3 Faction flavour (data, not code)

| Faction tone | Lean toward |
|--------------|-------------|
| Military / federation | `normal` matter, pulse bolts, light knockback slugs |
| Pirates | `explosive` + `seeking`, high splash, `knockback` |
| Veth / exotic | `anti` or `dark` matter, `dot` orbs |
| Rare/exotic loot | `void` matter, low plate `reductions.void` on enemy gear |

Align weapon naming with species `techArchetype` (and faction `shipStyle` / composition), not runtime enums beyond validation.

---

## 8. T1 numeric bands (starting points)

Clamp and run `validateWorldFile`. Tune against anchors in `public/testWorld.json`.

### Bullets

| Stat | Light | Medium | Heavy |
|------|-------|--------|-------|
| `damage` (impact) | 8–14 | 18–40 | 45–60 |
| `splashDamage` | — | 12–25 | 25–40 |
| `speed` | 500–700 | 300–450 | 250–400 |
| `mass` | 1–3 | 4–15 | 20–60 |
| `lifespan` | 1.5–2.5 | 2.5–4 | 4–6 |
| `explosive.radius` | — | 60–100 | 80–120 |
| `dot.damagePerSecond` | — | 3–6 | 5–10 |
| `dot.duration` | — | 2–4 | 3–5 |
| `seeking.turnRatio` | — | 1.5–2.5 | 2–4 |

### Launchers

| Stat | Light | Medium | Heavy |
|------|-------|--------|-------|
| `fireRate` | 3–6 | 1–2.5 | 0.3–0.8 |
| `mass` | 1–2 | 2–4 | 4–8 |
| `energyCost` | 3–8 | 8–15 | 15–25 |

### Anchors (`testWorld.json`)

| Bullet | matter | abilities | impact / splash |
|--------|--------|-----------|-----------------|
| `pulse_bolt` | normal | — | 12 dmg, fast bolt |
| `heavy_slug` | normal | knockback, ballistic | 30 dmg |
| `seeker_missile` | normal | seeking, knockback, explosive | 50 / 28 splash, r=90 |
| `plasma_orb` | normal | dot 4×3s | 8 dmg + burn |

---

## 9. Validation checklist

- Unique `bulletSpecs[].id` and catalog ids.
- Every `bulletSpecId` on weapons resolves.
- `matterType` ∈ `normal|anti|dark|void`.
- Each ability: known `type`, required fields, **no duplicate `type`** on same bullet.
- Armour: all four matter keys present, numeric.
- Hull loadouts: Σ equipped mass ≤ `equipmentCapacity`.

---

## 10. JSON recipes

### Pulse laser (no abilities)

```json
{
  "id": "pulse_bolt_t1",
  "name": "Pulse Bolt",
  "mass": 1,
  "speed": 600,
  "inheritShipVelocity": true,
  "damage": 12,
  "matterType": "normal",
  "abilities": [],
  "infinite": false,
  "lifespan": 2,
  "visualType": "bolt",
  "colour": "#40c0ff"
}
```

### Gravity slug

```json
{
  "id": "heavy_slug_t1",
  "matterType": "normal",
  "damage": 30,
  "mass": 10,
  "speed": 400,
  "inheritShipVelocity": true,
  "abilities": [
    { "type": "knockback", "scale": 1 },
    { "type": "ballistic", "scale": 1 }
  ],
  "lifespan": 3,
  "visualType": "bolt",
  "colour": "#ffaa00"
}
```

### Seeker missile (impact + splash)

```json
{
  "id": "seeker_missile_t1",
  "matterType": "normal",
  "damage": 50,
  "mass": 50,
  "speed": 350,
  "inheritShipVelocity": false,
  "abilities": [
    { "type": "seeking", "turnRatio": 2.5 },
    { "type": "knockback", "scale": 1 },
    { "type": "explosive", "radius": 90, "splashDamage": 28, "falloffExponent": 1 }
  ],
  "lifespan": 5,
  "visualType": "missile",
  "colour": "#ff4040"
}
```

### Plasma orb + launcher

```json
{
  "id": "plasma_orb_t1",
  "matterType": "normal",
  "damage": 8,
  "mass": 4,
  "speed": 0,
  "inheritShipVelocity": false,
  "abilities": [{ "type": "dot", "damagePerSecond": 4, "duration": 3 }],
  "lifespan": 4,
  "visualType": "orb",
  "colour": "#80ff40"
}
```

```json
{
  "id": "plasma_launcher_t1",
  "type": "weapon",
  "bulletSpecId": "plasma_orb_t1",
  "fireRate": 1.5,
  "energyCost": 10,
  "mass": 1,
  "tier": 1,
  "price": 200,
  "factionAffinity": "veth_collective",
  "slotType": "weapon"
}
```

### Light armour (four matters)

```json
{
  "reductions": {
    "normal": 5,
    "anti": 2,
    "dark": -1,
    "void": 0
  }
}
```

---

## 11. Pipeline placement (`plan/worldgen/WORLDGEN.md` step 9)

| Output | Notes |
|--------|--------|
| `bulletSpecs[]` | Templates supply stats + ability sets; LLM names/describes |
| `equipmentCatalog[]` | Weapons reference bullets; armour uses 4-key `reductions` |
| `hullSpecs[].defaultLoadouts` | Weapon slots reference catalog weapon ids |

After assembly (step 13), run **`validateWorldFile`**.

**LLM prompt pattern:** pass a **weapon template** (matter, abilities, numeric bands); model returns `name`, `description`, `factionAffinity` only — do not let the model invent invalid ability shapes.

---

## 12. Known limitations

| Topic | Status |
|--------|--------|
| `energyCost` on fire | Not enforced |
| `visualType: beam_pulse` | Cosmetic; still discrete shots per trigger |
| `infinite: true` | Rarely used |
| Legacy `damageCategory` worlds | **Rejected** — no importer |

---

## 13. Source map

| Concern | Location |
|---------|----------|
| Types & helpers | `src/types/bullet.ts` |
| Damage resolution | `src/combat/damage.ts` |
| Combat loop | `src/simulation/weaponSystem.ts` |
| Motion | `src/simulation/bulletEntity.ts` |
| Matter UI labels | `src/constants.ts` → `MATTER_TYPE_LABELS` |
| Example world | `public/testWorld.json` |

When behaviour changes, update this file and **`plan/CONTEXT.md` → Last changes**.
