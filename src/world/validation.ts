import { REQUIRED_SLOT_TYPES } from '../constants';
import { expandSlotsToFullHull } from '../shipyard/slotLayout';
import {
  emptyReductionProfile,
  type DamageTypeKey,
  type EquipmentItem,
  type EquipmentSlot,
  type FuelTankItem,
  type HullSpec,
  type ReactorItem,
  type RegionType,
  type ShieldItem,
  type WorldFile
} from '../types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Thrown when a `WorldFile` fails {@link validateWorldFile} at a game boundary (load, registry fetch, etc.). */
export class WorldFileValidationError extends Error {
  readonly result: ValidationResult;

  constructor(result: ValidationResult) {
    super(`WorldFileValidationError: ${result.errors.length} validation error(s)`);
    this.name = 'WorldFileValidationError';
    this.result = result;
  }
}

const DAMAGE_KEYS = Object.keys(emptyReductionProfile()) as DamageTypeKey[];

const SPAWN_BEHAVIOURS = new Set(['patrol', 'transit', 'trade', 'hostile', 'flee']);

const HULL_LOADOUT_VARIANTS = ['raw', 'basic', 'advanced'] as const;

const LOADOUT_VARIANT_SET = new Set<string>(HULL_LOADOUT_VARIANTS);

function isRegionCompatible(templateRegion: RegionType, sectorRegion: RegionType): boolean {
  if (templateRegion === sectorRegion) {
    return true;
  }
  if (templateRegion === 'midring') {
    return sectorRegion === 'core_arm' || sectorRegion === 'frontier';
  }
  if (templateRegion === 'core_arm') {
    return sectorRegion === 'midring';
  }
  if (templateRegion === 'frontier') {
    return sectorRegion === 'midring' || sectorRegion === 'radiation_fringe';
  }
  if (templateRegion === 'radiation_fringe') {
    return sectorRegion === 'frontier';
  }
  return false;
}

function equipmentTypeMatchesSlot(item: EquipmentItem, slotType: EquipmentSlot['slotType']): boolean {
  if (item.type === 'weapon' && slotType === 'weapon') {
    return true;
  }
  if (item.slotType) {
    return item.slotType === slotType;
  }
  return item.type === slotType;
}

function validateExpandedLoadout(
  hull: HullSpec,
  expandedSlots: EquipmentSlot[],
  label: string,
  equipmentById: Map<string, EquipmentItem>,
  push: (msg: string) => void,
  options?: { rawOnlyFilled?: boolean }
): void {
  const desired = { ...(hull.slotCounts ?? {}) } as Partial<Record<EquipmentSlot['slotType'], number>>;
  if (desired.weapon === undefined) {
    desired.weapon = hull.weaponSlots;
  }

  const perType: Partial<Record<EquipmentSlot['slotType'], number>> = {};
  for (const slot of expandedSlots) {
    perType[slot.slotType] = (perType[slot.slotType] ?? 0) + 1;
  }
  for (const [slotType, needed] of Object.entries(desired)) {
    const have = perType[slotType as EquipmentSlot['slotType']] ?? 0;
    if (have > (needed as number)) {
      push(`${label} for hull "${hull.id}" exceeds slotCounts for ${slotType}`);
    }
  }

  for (const slot of expandedSlots) {
    if (!slot.itemId) {
      continue;
    }
    const item = equipmentById.get(slot.itemId);
    if (!item) {
      push(`${label} hull "${hull.id}" references unknown equipment: ${slot.itemId}`);
      continue;
    }
    if (!equipmentTypeMatchesSlot(item, slot.slotType)) {
      push(`${label} hull "${hull.id}": item "${item.id}" type mismatch for slot ${slot.slotType}`);
    }
  }

  for (const req of REQUIRED_SLOT_TYPES) {
    const filled = expandedSlots.filter((s) => s.slotType === req && s.itemId !== null).length;
    if (filled < 1) {
      push(`${label} for hull "${hull.id}": required slot type "${req}" not filled`);
    }
  }

  if (options?.rawOnlyFilled) {
    for (const slot of expandedSlots) {
      if (slot.itemId && !REQUIRED_SLOT_TYPES.includes(slot.slotType)) {
        push(`${label} for hull "${hull.id}": raw loadout must not equip optional slot type "${slot.slotType}"`);
      }
    }
  }
}

export function validateWorldFile(world: WorldFile): ValidationResult {
  const errors: string[] = [];
  const equipmentById = new Map(world.equipmentCatalog.map((item) => [item.id, item]));
  const bulletIds = new Set(world.bulletSpecs.map((b) => b.id));
  const factionIds = new Set(world.factions.map((f) => f.id));
  const hullById = new Map(world.hullSpecs.map((h) => [h.id, h]));
  const sectorCoords = new Set(world.sectors.map((s) => `${s.coord.x}:${s.coord.y}`));

  const push = (msg: string): void => {
    errors.push(msg);
  };

  for (const hull of world.hullSpecs) {
    for (const req of REQUIRED_SLOT_TYPES) {
      const count = hull.slotCounts?.[req] ?? 0;
      if (!hull.slotCounts || count < 1) {
        push(`Hull "${hull.id}" must define slotCounts.${req} >= 1`);
      }
    }
    if (!hull.slotCounts || Object.keys(hull.slotCounts).length === 0) {
      push(`Hull "${hull.id}" must have slotCounts defined`);
    }
  }

  const hullIds = new Set<string>();
  for (const hull of world.hullSpecs) {
    if (hullIds.has(hull.id)) {
      push(`Duplicate hull spec id: ${hull.id}`);
    }
    hullIds.add(hull.id);
  }

  const equipIds = new Set<string>();
  for (const item of world.equipmentCatalog) {
    if (equipIds.has(item.id)) {
      push(`Duplicate equipment id: ${item.id}`);
    }
    equipIds.add(item.id);
    if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price <= 0) {
      push(`Equipment "${item.id}" must have a finite numeric price > 0`);
    }
  }

  const shipyardListings = world.shipyardListings ?? [];
  const listingById = new Map(shipyardListings.map((l) => [l.id, l]));
  const seenListingId = new Set<string>();
  for (const listing of shipyardListings) {
    if (seenListingId.has(listing.id)) {
      push(`Duplicate shipyard listing id: ${listing.id}`);
    }
    seenListingId.add(listing.id);
    if (!(listing.price > 0)) {
      push(`Shipyard listing "${listing.id}" must have price > 0`);
    }
    const listHull = hullById.get(listing.hullSpecId);
    if (!listHull) {
      push(`Shipyard listing "${listing.id}" references unknown hullSpecId: ${listing.hullSpecId}`);
      continue;
    }
    const listExpanded = expandSlotsToFullHull(
      listHull,
      (listing.equipmentSlots ?? []).map((s) => ({ ...s }))
    );
    validateExpandedLoadout(listHull, listExpanded, `Shipyard listing "${listing.id}"`, equipmentById, push);
  }

  if (world.defaultLoadouts) {
    for (const [name, entry] of Object.entries(world.defaultLoadouts)) {
      for (const slot of entry.equipmentSlots ?? []) {
        if (slot.itemId && !equipmentById.has(slot.itemId)) {
          push(`defaultLoadouts.${name} references unknown equipment: ${slot.itemId}`);
        }
      }
    }
  }

  for (const slot of world.startingConditions.equipmentSlots) {
    if (slot.itemId && !equipmentById.has(slot.itemId)) {
      push(`startingConditions.equipmentSlots references unknown equipment: ${slot.itemId}`);
    }
  }

  for (const item of world.equipmentCatalog) {
    if (item.type === 'weapon' && 'bulletSpecId' in item) {
      const wid = (item as { bulletSpecId?: string }).bulletSpecId;
      if (wid && !bulletIds.has(wid)) {
        push(`Weapon "${item.id}" references unknown bulletSpecId: ${wid}`);
      }
    }
  }

  const knownBulletAbilityTypes = new Set(['seeking']);
  for (const spec of world.bulletSpecs) {
    const legacy = spec as unknown as Record<string, unknown>;
    if ('seeking' in legacy || 'turnRatio' in legacy) {
      push(
        `Bullet "${spec.id}" uses removed fields seeking/turnRatio; use abilities: [{ "type": "seeking", "turnRatio": <rad/s> }]`
      );
    }

    const abilities = spec.abilities;
    if (abilities === undefined) {
      continue;
    }
    if (!Array.isArray(abilities)) {
      push(`Bullet "${spec.id}" abilities must be an array`);
      continue;
    }

    let seekingCount = 0;
    abilities.forEach((entry, i) => {
      if (!entry || typeof entry !== 'object') {
        push(`Bullet "${spec.id}" abilities[${i}] is invalid`);
        return;
      }
      const a = entry as { type?: unknown; turnRatio?: unknown };
      if (typeof a.type !== 'string') {
        push(`Bullet "${spec.id}" abilities[${i}] is missing type`);
        return;
      }
      if (!knownBulletAbilityTypes.has(a.type)) {
        push(`Bullet "${spec.id}" abilities[${i}] unknown type "${a.type}"`);
        return;
      }
      if (a.type === 'seeking') {
        seekingCount += 1;
        if (typeof a.turnRatio !== 'number' || !Number.isFinite(a.turnRatio) || a.turnRatio < 0) {
          push(`Bullet "${spec.id}" seeking ability requires finite turnRatio >= 0`);
        }
      }
    });

    if (seekingCount > 1) {
      push(`Bullet "${spec.id}" must have at most one seeking ability`);
    }
  }

  for (const sector of world.sectors) {
    if (sector.factionId && !factionIds.has(sector.factionId)) {
      push(`Sector ${sector.coord.x},${sector.coord.y} has unknown factionId: ${sector.factionId}`);
    }
    const landableIds = new Set<string>();
    for (const land of sector.landables) {
      if (landableIds.has(land.id)) {
        push(`Duplicate landable id "${land.id}" in sector ${sector.coord.x},${sector.coord.y}`);
      }
      landableIds.add(land.id);
      if (land.factionId && !factionIds.has(land.factionId)) {
        push(`Landable "${land.id}" references unknown factionId: ${land.factionId}`);
      }
    }

    for (const rule of sector.npcSpawnRules) {
      if (!factionIds.has(rule.factionId)) {
        push(`npcSpawnRules in sector ${sector.coord.x},${sector.coord.y} references unknown factionId: ${rule.factionId}`);
      }
      const spawnHullId = typeof rule.hullSpecId === 'string' ? rule.hullSpecId.trim() : '';
      if (!spawnHullId) {
        push(
          `npcSpawnRules in sector ${sector.coord.x},${sector.coord.y} (${rule.factionId} / ${rule.behaviourType}) must set a non-empty hullSpecId`
        );
      } else if (!hullById.has(spawnHullId)) {
        push(
          `npcSpawnRules in sector ${sector.coord.x},${sector.coord.y} references unknown hullSpecId: ${spawnHullId}`
        );
      }
      if (!SPAWN_BEHAVIOURS.has(rule.behaviourType)) {
        push(`Invalid behaviourType "${rule.behaviourType}" in sector ${sector.coord.x},${sector.coord.y}`);
      }
      const minP = rule.minPresent;
      const maxP = rule.maxPresent;
      const [c0, c1] = rule.countRange;
      if (!(minP <= c0 && c0 <= c1 && c1 <= maxP)) {
        push(
          `Spawn rule in sector ${sector.coord.x},${sector.coord.y} violates minPresent ≤ countRange[0] ≤ countRange[1] ≤ maxPresent`
        );
      }
      const [a0, a1] = rule.arrivalIntervalRange;
      if (a0 > a1) {
        push(`Spawn rule arrivalIntervalRange invalid in sector ${sector.coord.x},${sector.coord.y}`);
      }
      if (rule.loadoutVariant !== undefined && !LOADOUT_VARIANT_SET.has(rule.loadoutVariant)) {
        push(
          `Invalid loadoutVariant "${String(rule.loadoutVariant)}" in sector ${sector.coord.x},${sector.coord.y} (expected raw|basic|advanced)`
        );
      }
    }

    for (const land of sector.landables) {
      if (!land.shipyard?.listingIds?.length) {
        continue;
      }
      for (const lid of land.shipyard.listingIds) {
        if (!listingById.has(lid)) {
          push(`Landable "${land.id}" shipyard references unknown listing id: ${lid}`);
        }
      }
    }
  }

  for (const tpl of world.missionTemplates) {
    for (const req of tpl.factionRequirements) {
      if (!factionIds.has(req.factionId)) {
        push(`Mission template "${tpl.id}" references unknown factionId: ${req.factionId}`);
      }
    }
    for (const reward of tpl.reputationRewards) {
      if (!factionIds.has(reward.factionId)) {
        push(`Mission template "${tpl.id}" reputation reward references unknown faction: ${reward.factionId}`);
      }
    }
    const hasCompatible = world.sectors.some((sec) => isRegionCompatible(tpl.regionType, sec.regionType));
    if (!hasCompatible) {
      push(`Mission template "${tpl.id}" regionType "${tpl.regionType}" has no compatible sector/landable region in world`);
    }
  }

  const sc = world.startingConditions;
  if (!sectorCoords.has(`${sc.sectorCoord.x}:${sc.sectorCoord.y}`)) {
    push(`startingConditions.sectorCoord (${sc.sectorCoord.x},${sc.sectorCoord.y}) is not a defined sector`);
  }
  if (!hullById.has(sc.hullSpecId)) {
    push(`startingConditions.hullSpecId unknown: ${sc.hullSpecId}`);
  }

  if (sc.factionReputations) {
    for (const [fid, val] of Object.entries(sc.factionReputations)) {
      if (val < -100 || val > 100) {
        push(`startingConditions.factionReputations.${fid} out of range [-100,100]`);
      }
      if (!factionIds.has(fid)) {
        push(`startingConditions.factionReputations references unknown faction: ${fid}`);
      }
    }
  }

  for (const item of world.equipmentCatalog) {
    if (item.type === 'armour' && item.reductions) {
      for (const key of DAMAGE_KEYS) {
        if (typeof item.reductions[key] !== 'number') {
          push(`Armour "${item.id}" reductions missing or invalid key: ${key}`);
        }
      }
    }
    if (item.type === 'shield') {
      const s = item as ShieldItem;
      if (!(s.rebootTime > s.regenDelay)) {
        push(`Shield "${item.id}" must have rebootTime > regenDelay`);
      }
      if (s.shieldHP <= 0 || s.joulesPerHPRegen <= 0 || s.regenDelay <= 0 || s.rebootTime <= 0) {
        push(`Shield "${item.id}" must have positive shieldHP, joulesPerHPRegen, regenDelay, rebootTime`);
      }
    }
    if (item.type === 'reactor') {
      const r = item as ReactorItem;
      if (r.chargeRateJoulesPerSecond <= 0 || r.fuelPerJoule <= 0) {
        push(`Reactor "${item.id}" must have positive chargeRateJoulesPerSecond and fuelPerJoule`);
      }
    }
    if (item.type === 'fuelTank') {
      const f = item as FuelTankItem;
      if (f.fuelCapacity <= 0) {
        push(`Fuel tank "${item.id}" must have positive fuelCapacity`);
      }
    }
  }

  for (const hull of world.hullSpecs) {
    const desired = { ...(hull.slotCounts ?? {}) } as Partial<Record<EquipmentSlot['slotType'], number>>;
    if (desired.weapon === undefined) {
      desired.weapon = hull.weaponSlots;
    }

    const checkLoadout = (slots: EquipmentSlot[], label: string): void => {
      const perType: Partial<Record<EquipmentSlot['slotType'], number>> = {};
      for (const slot of slots) {
        perType[slot.slotType] = (perType[slot.slotType] ?? 0) + 1;
      }
      for (const [slotType, needed] of Object.entries(desired)) {
        const have = perType[slotType as EquipmentSlot['slotType']] ?? 0;
        if (have > (needed as number)) {
          push(`${label} for hull "${hull.id}" exceeds slotCounts for ${slotType}`);
        }
      }
      for (const slot of slots) {
        if (!slot.itemId) continue;
        const item = equipmentById.get(slot.itemId);
        if (!item) continue;
        if (!equipmentTypeMatchesSlot(item, slot.slotType)) {
          push(`${label} hull "${hull.id}": item "${item.id}" type mismatch for slot ${slot.slotType}`);
        }
      }
    };

    if (hull.equipmentLoadout?.length) {
      checkLoadout(hull.equipmentLoadout, 'equipmentLoadout');
    }

    if (!hull.defaultLoadouts) {
      push(`Hull "${hull.id}" must define defaultLoadouts (raw, basic, advanced)`);
    } else {
      for (const v of HULL_LOADOUT_VARIANTS) {
        const slots = hull.defaultLoadouts[v];
        if (!Array.isArray(slots)) {
          push(`Hull "${hull.id}" missing defaultLoadouts.${v}`);
          continue;
        }
        const expanded = expandSlotsToFullHull(hull, slots.map((s) => ({ ...s })));
        validateExpandedLoadout(
          hull,
          expanded,
          `Hull "${hull.id}" defaultLoadouts.${v}`,
          equipmentById,
          push,
          v === 'raw' ? { rawOnlyFilled: true } : undefined
        );
      }
    }
  }

  if (world.defaultLoadouts) {
    for (const [name, entry] of Object.entries(world.defaultLoadouts)) {
      const hull = hullById.get(entry.hullSpecId);
      if (!hull) {
        push(`defaultLoadouts.${name} references unknown hullSpecId: ${entry.hullSpecId}`);
        continue;
      }
      const desired = { ...(hull.slotCounts ?? {}) } as Partial<Record<EquipmentSlot['slotType'], number>>;
      if (desired.weapon === undefined) desired.weapon = hull.weaponSlots;
      const countFor = (t: EquipmentSlot['slotType']): number => Math.max(0, Math.floor(Number(desired[t] ?? 0)));
      const perType: Partial<Record<EquipmentSlot['slotType'], number>> = {};
      for (const slot of entry.equipmentSlots ?? []) {
        perType[slot.slotType] = (perType[slot.slotType] ?? 0) + 1;
      }
      for (const [slotType, needed] of Object.entries(desired)) {
        const have = perType[slotType as EquipmentSlot['slotType']] ?? 0;
        if (have > (needed as number)) {
          push(`defaultLoadouts.${name} exceeds slotCounts for hull "${hull.id}" slot ${slotType}`);
        }
      }
      for (const slot of entry.equipmentSlots ?? []) {
        if (!slot.itemId) continue;
        const item = equipmentById.get(slot.itemId);
        if (!item) continue;
        if (!equipmentTypeMatchesSlot(item, slot.slotType)) {
          push(`defaultLoadouts.${name}: item "${item.id}" mismatch for slot ${slot.slotType}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function isBundledTestWorldEntry(entry: { id: string; filePath: string }): boolean {
  return entry.filePath.endsWith('testWorld.json') || entry.id === 'test_world';
}

/**
 * Use after reading a `WorldFile` from disk or localStorage and before `WorldState` or gameplay consumes it.
 * In development, a failing bundled `testWorld.json` throws a plain `Error` for build-time diagnosis.
 */
export function throwIfWorldFileInvalidForGame(
  world: WorldFile,
  opts?: { bundledTestEntry?: { id: string; filePath: string } }
): void {
  // VALIDATION BOUNDARY (load): world file must pass before WorldState or save resume
  const result = validateWorldFile(world);
  if (result.ok) {
    return;
  }
  if (import.meta.env.DEV && opts?.bundledTestEntry && isBundledTestWorldEntry(opts.bundledTestEntry)) {
    const lines = result.errors.map((e) => `  • ${e}`).join('\n');
    throw new Error(
      `Bundled testWorld.json failed validation (development/build error). Fix the JSON or validation rules.\n${lines}`
    );
  }
  throw new WorldFileValidationError(result);
}
