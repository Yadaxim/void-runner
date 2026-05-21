# Bullet model refactor — design plan

**Status:** **Implemented** (code + `testWorld.json` migrated). No legacy loaders; migrate `public/testWorld.json` (and tests/fixtures) in the same change.

**Supersedes (when done):** `damageCategory`, 13-key `DamageTypeKey` armour, top-level `dotDuration` / `dotDamagePerSecond`, `attractedByGravity`, hardcoded plasma DoT path.

**Worldgen reference:** `plan/WEAPONS_WORLDGEN.md` (rewritten for this model). GDD combat § still optional to align.

---

## 1. Goals

1. **Behaviours** are `BulletSpec.abilities[]` (stackable combinations).
2. **Armour matchup** is **`matterType` only** (`normal` | `anti` | `dark` | `void`).
3. **Laser** is not an ability — high `speed`, low `mass`, no `knockback` ability (convention).
4. **Worldgen** invents weapons by picking matter + abilities + numeric stats; `void` is flavour/rarity, not a rules exception.
5. **Hard cut** data migration; no runtime support for old `damageCategory` JSON.

---

## 2. Locked decisions

| Topic | Decision |
|--------|----------|
| **Knockback** | `{ type: "knockback", scale?: number }`. Migrate slugs/missiles that should shove. `scale` defaults to `1`. No ability ⇒ no knockback. |
| **DoT** | `{ type: "dot", damagePerSecond, duration }`. **No shields** on DoT ticks. **One burn per ship**, max-merge on re-hit (§3). |
| **Ballistic** | `{ type: "ballistic", scale?: number }` — enables gravity acceleration (today’s `attractedByGravity: true`). `scale` defaults to **`1`** and multiplies gravity accel on the projectile. Remove top-level `attractedByGravity`. |
| **Explosive** | `{ type: "explosive", radius, splashDamage, falloffExponent? }`. Direct hit uses bullet `damage`; splash uses `splashDamage` + falloff (§4). |
| **Explosive + DoT** | Apply DoT to direct target and **every** ship that takes splash damage. |
| **Void matter** | Same rules as other matters: armour uses `reductions.void` if present; **hulls have no resistances** (full damage to hull). Special only in **content** (rare in worldgen), not in code. |
| **Seeking** | `{ type: "seeking", turnRatio }`. Abilities stack; at most one entry per `type` per bullet (§6). |
| **Friendly fire** | **Projectile:** can hit **any ship except owner** (unchanged from today — allies can be hit). **Splash:** damages **everyone** in radius, **including owner**. |
| **Reputation** | Direct player hits on NPCs still apply rep penalties as today. **Splash / area damage does not** change reputation. |
| **Migration** | Rewrite `testWorld.json` + fixtures; no legacy import. |

---

## 3. DoT — stack rule (unchanged logic)

**One burn per ship** (`targetId` key).

On re-hit with `dot`:

- `remainingDuration = max(existing, new duration)`
- `damagePerSecond = max(existing, new dps)`

No parallel burns, no summed DPS. Shields skipped on ticks. Armour uses `reductions[matterType]`; bare hull takes full tick damage.

If one bullet spec has multiple `dot` entries (disallowed by validation), merge at apply: max DPS, max duration across those entries on that hit.

---

## 4. Explosive — collision vs splash

| Phase | Who is affected |
|--------|------------------|
| **Projectile impact** | First ship hit whose `id !== ownerId` (owner skipped only). **Allies and neutrals can be hit** by the projectile. |
| **Splash (on impact detonation)** | Every ship in `radius` of detonation point, **including owner**, at `splashDamage` × falloff. |

Direct hit resolves `damage` (+ knockback / dot as applicable). Splash is a separate pass. **No reputation** updates from splash hits.

**Falloff (default):**

```text
multiplier = max(0, 1 - (distance / radius) ^ falloffExponent)
splash_dealt = splashDamage * multiplier
```

`falloffExponent` defaults to `1` (linear). Omit on ability → use default.

**Implementation note:** Owner can take splash but not direct self-collision from own bullet — design for “missile flies past, detonates, catches launcher in blast.”

---

## 5. Target schema

### 5.1 `BulletSpec`

```typescript
interface BulletSpec {
  id: string;
  name: string;
  mass: number;
  speed: number;
  inheritShipVelocity: boolean;
  damage: number;                    // direct impact only
  matterType: 'normal' | 'anti' | 'dark' | 'void';
  abilities?: BulletAbility[];
  infinite: boolean;
  lifespan: number;
  visualType: BulletVisualType;
  colour: string;
}

type BulletAbility =
  | { type: 'seeking'; turnRatio: number }
  | { type: 'dot'; damagePerSecond: number; duration: number }
  | { type: 'knockback'; scale?: number }
  | { type: 'ballistic'; scale?: number }   // gravity pull; scale defaults to 1
  | { type: 'explosive'; radius: number; splashDamage: number; falloffExponent?: number };
```

**Removed:** `damageCategory`, `dotDuration`, `dotDamagePerSecond`, `attractedByGravity`.

**Laser (convention):** high `speed`, low `mass`, no `knockback` / `explosive` — UI/worldgen hint only.

### 5.2 Armour & hull

```typescript
type MatterType = 'normal' | 'anti' | 'dark' | 'void';
type ArmourReductionProfile = Record<MatterType, number>;
```

**Damage resolution (instant and DoT ticks):**

1. Shield (instant only): absorbs while online — all `matterType` equally.
2. Outermost armour layer with HP: `effective = max(0, damage - reductions[matterType])`.
3. Hull: **no** reduction table — full remaining damage to `currentHullHP`.

**Void:** use `reductions.void` on armour like any other column; rarity is data/worldgen, not bypass logic.

### 5.3 Shields

- Instant `damage`: shield first (all matter types).
- DoT: no shield; armour then hull.

---

## 6. Validation

- Known `type` per ability; required fields per variant.
- **Stack** multiple ability types on one bullet.
- **At most one ability entry per `type`** on a given bullet spec.
- `ballistic`: optional `scale` (finite, `>= 0`; default `1` at runtime if omitted).
- `explosive`: `radius > 0`, `splashDamage >= 0`.
- `dot`: `duration > 0`, `damagePerSecond >= 0`.
- `knockback`: `scale >= 0` if present.
- Armour: all four `MatterType` keys required on each plate.

---

## 7. Migration map — `testWorld.json`

| id | After migration |
|----|-----------------|
| `pulse_bolt` | `matterType: normal`, fast/light, no `knockback` |
| `heavy_slug` | `matterType: normal`, `knockback`, `ballistic` { scale: 1 } |
| `seeker_missile` | `matterType: normal`, `seeking`, `knockback`?, `explosive` { radius, splashDamage, … } |
| `plasma_orb` | `matterType: normal`, `dot` { 4 dps, 3s } (from current numbers) |

**Armour:** each `reductions` → four matter keys only (derive from old 13-key profiles or re-tune).

**Weapons / loadouts:** same ids; bullet + armour shape only.

---

## 8. Implementation phases

### Phase A — Types & damage core

- `BulletAbility` union + `MatterType` includes `void`.
- `resolveShipBulletDamage` / DoT: `reductions[matterType]`; hull unresisted.
- `dot` ability; one burn per ship; `ballistic` in `BulletEntity.update` (`gravityAccel × (scale ?? 1)`).
- Knockback only with `knockback` ability.

### Phase B — Explosive splash

- Splash pass: all ships in radius (including owner).
- Splash: no reputation deltas.
- Projectile loop: skip **owner only**.
- Splash + `dot` on each recipient that takes splash damage.

### Phase C — Data & validation

- Migrate `testWorld.json`, fixtures, tests.
- Remove `DamageCategory`, `DamageTypeKey`, `getDamageTypeKey`.

### Phase D — UI & docs

- Matter labels on armour UI; bullet summary from abilities.
- Update `plan/WEAPONS_WORLDGEN.md`, GDD, CONTEXT.

**Defer:** legacy JSON, `energyCost` on fire, sustained beam weapons.

---

## 9. Files expected to touch

| Area | Files |
|------|--------|
| Types | `src/types/bullet.ts`, `src/types/equipment.ts` |
| Combat | `src/combat/damage.ts`, `src/combat/damage.test.ts` |
| Sim | `src/simulation/weaponSystem.ts`, `src/simulation/bulletEntity.ts` |
| Validation | `src/world/validation.ts`, `src/world/world-validation.test.ts` |
| UI | `src/screens/landableScreen.ts`, `src/constants.ts` |
| Data | `public/testWorld.json`, `src/test/fixtures.ts` |
| Docs | `plan/WEAPONS_WORLDGEN.md`, `plan/GDD.md`, `plan/CONTEXT.md` |

---

## 10. Worldgen example

```json
{
  "id": "void_tipped_missile_t1",
  "matterType": "void",
  "damage": 40,
  "mass": 30,
  "speed": 320,
  "inheritShipVelocity": false,
  "abilities": [
    { "type": "seeking", "turnRatio": 2 },
    { "type": "explosive", "radius": 100, "splashDamage": 18, "falloffExponent": 1 },
    { "type": "knockback", "scale": 1 }
  ],
  "lifespan": 5,
  "visualType": "missile",
  "colour": "#a040ff"
}
```

---

*Last updated: all §8 open questions resolved — void normal; owner-only projectile skip; splash hits all; no splash rep; one burn; ballistic ability; ready to implement.*
