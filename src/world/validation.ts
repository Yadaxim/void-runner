import { REQUIRED_SLOT_TYPES } from '../constants';
import { expandSlotsToFullHull } from '../shipyard/slotLayout';
import {
  emptyReductionProfile,
  MATTER_TYPES,
  type EquipmentItem,
  type EquipmentSlot,
  type FuelTankItem,
  type HyperspaceDriveItem,
  type HullSpec,
  type ReactorItem,
  type RegionType,
  type ShieldItem,
  type Landable,
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

const MATTER_REDUCTION_KEYS = Object.keys(emptyReductionProfile()) as (typeof MATTER_TYPES)[number][];

const SPAWN_BEHAVIOURS = new Set(['patrol', 'transit', 'trade', 'hostile', 'flee']);

const HULL_LOADOUT_VARIANTS = ['raw', 'basic', 'advanced'] as const;

const LOADOUT_VARIANT_SET = new Set<string>(HULL_LOADOUT_VARIANTS);

function validateLandableProceduralBody(land: Landable, push: (msg: string) => void): void {
  const body = land.proceduralBody;
  if (!body) {
    return;
  }
  const check01 = (value: number | undefined, field: string): void => {
    if (value === undefined) {
      return;
    }
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      push(`Landable "${land.id}" proceduralBody.${field} must be a number in [0, 1]`);
    }
  };
  check01(body.rocky, 'rocky');
  check01(body.chaos, 'chaos');
  check01(body.cloudDensity, 'cloudDensity');
  check01(body.atmoThickness, 'atmoThickness');
  if (body.noiseScale !== undefined) {
    if (!Number.isFinite(body.noiseScale) || body.noiseScale < 1 || body.noiseScale > 7) {
      push(`Landable "${land.id}" proceduralBody.noiseScale must be in [1, 7]`);
    }
  }
  if (body.paletteSeed !== undefined && !Number.isFinite(body.paletteSeed)) {
    push(`Landable "${land.id}" proceduralBody.paletteSeed must be finite`);
  }
  if (land.type === 'moon' && body.atmoThickness !== undefined && body.atmoThickness >= 0.05) {
    push(`Landable "${land.id}" moon proceduralBody.atmoThickness must be < 0.05`);
  }
  if (land.type === 'moon' && body.forceRing) {
    push(`Landable "${land.id}" moon cannot set proceduralBody.forceRing`);
  }
}

const SPECIES_ARCHETYPES = new Set([
  'biotic',
  'construct',
  'collective',
  'fieldborn',
  'shimmerborn',
  'amalgam'
]);

const HULL_SILHOUETTES = new Set([
  'fighter',
  'interceptor',
  'shuttle',
  'courier',
  'freighter',
  'heavy'
]);

const TECH_ARCHETYPES = new Set([
  'organic',
  'inorganic',
  'energy',
  'void',
  'hybrid',
  'robotic',
  'biolume',
  'compound'
]);

const HABITAT_PREFERENCES = new Set(['core', 'mid', 'rim', 'nebula', 'radiation', 'shimmer']);

const FACTION_TYPES = new Set(['major_nation', 'minor_nation', 'independent']);

const BUBBLE_STANCES = new Set(['reunifier', 'isolationist', 'breaker', 'indifferent']);

const LANDABLE_CONTROL_STATES = new Set(['sole', 'treaty', 'cooperation', 'dispute']);

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

  let installedMass = 0;
  let massAccountingOk = true;
  for (const slot of expandedSlots) {
    if (!slot.itemId) {
      continue;
    }
    const item = equipmentById.get(slot.itemId);
    if (!item) {
      massAccountingOk = false;
      continue;
    }
    if (typeof item.mass !== 'number' || !Number.isFinite(item.mass) || item.mass < 0) {
      push(`${label} hull "${hull.id}": equipment "${item.id}" must have finite mass >= 0`);
      massAccountingOk = false;
      continue;
    }
    installedMass += item.mass;
  }
  if (
    massAccountingOk &&
    typeof hull.equipmentCapacity === 'number' &&
    Number.isFinite(hull.equipmentCapacity) &&
    installedMass > hull.equipmentCapacity
  ) {
    push(
      `${label} for hull "${hull.id}": installed equipment mass (${installedMass}) exceeds equipmentCapacity (${hull.equipmentCapacity})`
    );
  }
}

export function validateWorldFile(world: WorldFile): ValidationResult {
  const errors: string[] = [];
  const equipmentById = new Map(world.equipmentCatalog.map((item) => [item.id, item]));
  const bulletIds = new Set(world.bulletSpecs.map((b) => b.id));
  const factionIds = new Set(world.factions.map((f) => f.id));
  const hullById = new Map(world.hullSpecs.map((h) => [h.id, h]));
  const sectorCoords = new Set(world.sectors.map((s) => `${s.coord.x}:${s.coord.y}`));
  const species = Array.isArray(world.species) ? world.species : [];
  const speciesIds = new Set(species.map((s) => s.id));
  const allLandableIds = new Set<string>();
  for (const sector of world.sectors) {
    for (const land of sector.landables) {
      allLandableIds.add(land.id);
    }
  }

  const push = (msg: string): void => {
    errors.push(msg);
  };

  if (!Array.isArray(world.species)) {
    push('WorldFile.species must be an array');
  }

  const seenSpeciesIds = new Set<string>();
  for (const entry of species) {
    if (!entry.id) {
      push('Species entry must have a non-empty id');
    } else if (seenSpeciesIds.has(entry.id)) {
      push(`Duplicate species id: ${entry.id}`);
    }
    seenSpeciesIds.add(entry.id);

    if (!SPECIES_ARCHETYPES.has(entry.archetype)) {
      push(`Species "${entry.id}" has invalid archetype: ${String(entry.archetype)}`);
    }
    if (entry.preferredHabitat !== undefined && !HABITAT_PREFERENCES.has(entry.preferredHabitat)) {
      push(`Species "${entry.id}" has invalid preferredHabitat: ${String(entry.preferredHabitat)}`);
    }
    if (typeof entry.physiology !== 'string' || entry.physiology.length < 20 || entry.physiology.length > 200) {
      push(`Species "${entry.id}" physiology must be 20-200 characters`);
    }
    if (typeof entry.ethos !== 'string' || entry.ethos.length < 20 || entry.ethos.length > 200) {
      push(`Species "${entry.id}" ethos must be 20-200 characters`);
    }
    if (!TECH_ARCHETYPES.has(entry.techArchetype)) {
      push(`Species "${entry.id}" has invalid techArchetype: ${String(entry.techArchetype)}`);
    }
  }

  for (const faction of world.factions) {
    if (!FACTION_TYPES.has(faction.type)) {
      push(`Faction "${faction.id}" has invalid type: ${String(faction.type)}`);
    }
    if (!BUBBLE_STANCES.has(faction.bubbleStance)) {
      push(`Faction "${faction.id}" has invalid bubbleStance: ${String(faction.bubbleStance)}`);
    }
    if (!Array.isArray(faction.speciesComposition) || faction.speciesComposition.length === 0) {
      push(`Faction "${faction.id}" must define speciesComposition`);
    } else {
      let total = 0;
      const compositionSpecies = new Set<string>();
      for (const entry of faction.speciesComposition) {
        if (!speciesIds.has(entry.speciesId)) {
          push(`Faction "${faction.id}" speciesComposition references unknown speciesId: ${entry.speciesId}`);
        }
        if (compositionSpecies.has(entry.speciesId)) {
          push(`Faction "${faction.id}" speciesComposition duplicates speciesId: ${entry.speciesId}`);
        }
        compositionSpecies.add(entry.speciesId);
        if (typeof entry.percentage !== 'number' || !Number.isFinite(entry.percentage) || entry.percentage <= 0) {
          push(`Faction "${faction.id}" speciesComposition percentage must be finite and > 0`);
        } else {
          total += entry.percentage;
        }
      }
      if (total !== 100) {
        push(`Faction "${faction.id}" speciesComposition percentages must sum to 100`);
      }
    }

    if (faction.type === 'independent') {
      if (faction.homeLandableId !== null) {
        push(`Independent faction "${faction.id}" must have homeLandableId null`);
      }
    } else if (!faction.homeLandableId) {
      push(`Faction "${faction.id}" must have a homeLandableId`);
    } else if (!allLandableIds.has(faction.homeLandableId)) {
      push(`Faction "${faction.id}" homeLandableId references unknown landable: ${faction.homeLandableId}`);
    }
  }

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
    if (!(typeof hull.equipmentCapacity === 'number' && Number.isFinite(hull.equipmentCapacity) && hull.equipmentCapacity >= 0)) {
      push(`Hull "${hull.id}" must have finite equipmentCapacity >= 0`);
    }
    const dim = hull.dimensions;
    if (
      !dim ||
      typeof dim.length !== 'number' ||
      !Number.isFinite(dim.length) ||
      dim.length <= 0 ||
      typeof dim.width !== 'number' ||
      !Number.isFinite(dim.width) ||
      dim.width <= 0
    ) {
      push(`Hull "${hull.id}" must define dimensions.length and dimensions.width as finite numbers > 0`);
    }
    if (!HULL_SILHOUETTES.has(hull.silhouette)) {
      push(`Hull "${hull.id}" has invalid silhouette: ${String(hull.silhouette)}`);
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
    if (typeof item.mass !== 'number' || !Number.isFinite(item.mass) || item.mass < 0) {
      push(`Equipment "${item.id}" must have finite mass >= 0`);
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

  for (const item of world.equipmentCatalog) {
    if (item.type === 'weapon' && 'bulletSpecId' in item) {
      const wid = (item as { bulletSpecId?: string }).bulletSpecId;
      if (wid && !bulletIds.has(wid)) {
        push(`Weapon "${item.id}" references unknown bulletSpecId: ${wid}`);
      }
    }
  }

  const knownBulletAbilityTypes = new Set(['seeking', 'dot', 'knockback', 'ballistic', 'explosive']);
  for (const spec of world.bulletSpecs) {
    if (!MATTER_TYPES.includes(spec.matterType as (typeof MATTER_TYPES)[number])) {
      push(`Bullet "${spec.id}" has invalid matterType: ${String(spec.matterType)}`);
    }

    const abilities = spec.abilities;
    if (abilities === undefined) {
      continue;
    }
    if (!Array.isArray(abilities)) {
      push(`Bullet "${spec.id}" abilities must be an array`);
      continue;
    }

    const seenTypes = new Set<string>();
    abilities.forEach((entry, i) => {
      if (!entry || typeof entry !== 'object') {
        push(`Bullet "${spec.id}" abilities[${i}] is invalid`);
        return;
      }
      const a = entry as unknown as Record<string, unknown>;
      if (typeof a.type !== 'string') {
        push(`Bullet "${spec.id}" abilities[${i}] is missing type`);
        return;
      }
      if (!knownBulletAbilityTypes.has(a.type)) {
        push(`Bullet "${spec.id}" abilities[${i}] unknown type "${a.type}"`);
        return;
      }
      if (seenTypes.has(a.type)) {
        push(`Bullet "${spec.id}" has duplicate ability type "${a.type}"`);
        return;
      }
      seenTypes.add(a.type);

      if (a.type === 'seeking') {
        if (typeof a.turnRatio !== 'number' || !Number.isFinite(a.turnRatio) || a.turnRatio < 0) {
          push(`Bullet "${spec.id}" seeking ability requires finite turnRatio >= 0`);
        }
      } else if (a.type === 'dot') {
        if (typeof a.damagePerSecond !== 'number' || !Number.isFinite(a.damagePerSecond) || a.damagePerSecond < 0) {
          push(`Bullet "${spec.id}" dot ability requires finite damagePerSecond >= 0`);
        }
        if (typeof a.duration !== 'number' || !Number.isFinite(a.duration) || a.duration <= 0) {
          push(`Bullet "${spec.id}" dot ability requires finite duration > 0`);
        }
      } else if (a.type === 'knockback' || a.type === 'ballistic') {
        if (a.scale !== undefined) {
          if (typeof a.scale !== 'number' || !Number.isFinite(a.scale) || a.scale < 0) {
            push(`Bullet "${spec.id}" ${a.type} ability scale must be finite and >= 0 when set`);
          }
        }
      } else if (a.type === 'explosive') {
        if (typeof a.radius !== 'number' || !Number.isFinite(a.radius) || a.radius <= 0) {
          push(`Bullet "${spec.id}" explosive ability requires finite radius > 0`);
        }
        if (typeof a.splashDamage !== 'number' || !Number.isFinite(a.splashDamage) || a.splashDamage < 0) {
          push(`Bullet "${spec.id}" explosive ability requires finite splashDamage >= 0`);
        }
        if (a.falloffExponent !== undefined) {
          if (typeof a.falloffExponent !== 'number' || !Number.isFinite(a.falloffExponent) || a.falloffExponent <= 0) {
            push(`Bullet "${spec.id}" explosive falloffExponent must be finite and > 0 when set`);
          }
        }
      }
    });
  }

  for (const sector of world.sectors) {
    if (sector.factionId && !factionIds.has(sector.factionId)) {
      push(`Sector ${sector.coord.x},${sector.coord.y} has unknown factionId: ${sector.factionId}`);
    }
    const sectorLandableIds = new Set<string>();
    for (const land of sector.landables) {
      if (sectorLandableIds.has(land.id)) {
        push(`Duplicate landable id "${land.id}" in sector ${sector.coord.x},${sector.coord.y}`);
      }
      sectorLandableIds.add(land.id);
      if (!LANDABLE_CONTROL_STATES.has(land.controlState)) {
        push(`Landable "${land.id}" has invalid controlState: ${String(land.controlState)}`);
      }
      if (!Array.isArray(land.factionControl)) {
        push(`Landable "${land.id}" factionControl must be an array`);
        continue;
      }
      let shareTotal = 0;
      const seenControlFactions = new Set<string>();
      for (const control of land.factionControl) {
        if (!factionIds.has(control.factionId)) {
          push(`Landable "${land.id}" factionControl references unknown factionId: ${control.factionId}`);
        }
        if (seenControlFactions.has(control.factionId)) {
          push(`Landable "${land.id}" factionControl duplicates factionId: ${control.factionId}`);
        }
        seenControlFactions.add(control.factionId);
        if (typeof control.share !== 'number' || !Number.isFinite(control.share) || control.share <= 0) {
          push(`Landable "${land.id}" factionControl share must be finite and > 0`);
        } else {
          shareTotal += control.share;
        }
      }
      if (land.factionControl.length > 0 && shareTotal !== 100) {
        push(`Landable "${land.id}" factionControl shares must sum to 100`);
      }
      if (land.controlState === 'sole' && land.factionControl.length !== 1) {
        push(`Landable "${land.id}" controlState sole requires exactly one factionControl entry`);
      }
      if (land.controlState !== 'sole' && land.factionControl.length < 2) {
        push(`Landable "${land.id}" controlState ${land.controlState} requires at least two factionControl entries`);
      }
      validateLandableProceduralBody(land, push);
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

  const missionTemplateIds = new Set(world.missionTemplates.map((t) => t.id));
  const treeIds = new Set<string>();

  for (const tree of world.missionTreeTemplates ?? []) {
    if (treeIds.has(tree.id)) {
      push(`Duplicate mission tree id: ${tree.id}`);
    }
    treeIds.add(tree.id);
    if (!factionIds.has(tree.factionId)) {
      push(`Mission tree "${tree.id}" references unknown factionId: ${tree.factionId}`);
    }
    if (!missionTemplateIds.has(tree.rootMissionTemplateId)) {
      push(`Mission tree "${tree.id}" rootMissionTemplateId unknown: ${tree.rootMissionTemplateId}`);
    }
    const nodeIds = new Set<string>();
    for (const node of tree.nodes) {
      if (nodeIds.has(node.id)) {
        push(`Mission tree "${tree.id}" duplicate node id: ${node.id}`);
      }
      nodeIds.add(node.id);
      if (!missionTemplateIds.has(node.missionTemplateId)) {
        push(`Mission tree "${tree.id}" node "${node.id}" references unknown missionTemplateId: ${node.missionTemplateId}`);
      }
      const checkPrereq = (prereq: { type?: string; treeId?: string; nodeId?: string; factionId?: string }, label: string): void => {
        if (!prereq?.type) {
          push(`${label} prerequisite missing type`);
          return;
        }
        if (prereq.type === 'tree_node_completed' || prereq.type === 'tree_node_failed') {
          if (prereq.treeId !== tree.id && !treeIds.has(prereq.treeId ?? '')) {
            push(`${label} references unknown treeId: ${String(prereq.treeId)}`);
          }
          if (!nodeIds.has(prereq.nodeId ?? '') && !tree.nodes.some((n) => n.id === prereq.nodeId)) {
            push(`${label} references unknown nodeId: ${String(prereq.nodeId)}`);
          }
        }
        if (prereq.type === 'reputation_at_least' && prereq.factionId && !factionIds.has(prereq.factionId)) {
          push(`${label} references unknown factionId: ${prereq.factionId}`);
        }
      };
      for (const prereq of node.prerequisites) {
        checkPrereq(prereq as { type?: string; treeId?: string; nodeId?: string; factionId?: string }, `Mission tree "${tree.id}" node "${node.id}"`);
      }
      for (const prereq of node.outcomes?.onComplete ?? []) {
        checkPrereq(prereq as { type?: string; treeId?: string; nodeId?: string; factionId?: string }, `Mission tree "${tree.id}" node "${node.id}" onComplete`);
      }
    }
    const hasRootNode = tree.nodes.some((n) => n.missionTemplateId === tree.rootMissionTemplateId);
    if (!hasRootNode) {
      push(`Mission tree "${tree.id}" must include a node for rootMissionTemplateId`);
    }
    for (const effect of tree.finalConsequences) {
      if (!effect?.type) {
        push(`Mission tree "${tree.id}" finalConsequence missing type`);
        continue;
      }
      if (effect.type === 'control_shift') {
        if (!allLandableIds.has(effect.landableId)) {
          push(`Mission tree "${tree.id}" control_shift references unknown landable: ${effect.landableId}`);
        }
        if (!factionIds.has(effect.factionId)) {
          push(`Mission tree "${tree.id}" control_shift references unknown faction: ${effect.factionId}`);
        }
      }
      if (effect.type === 'change_disposition') {
        if (!factionIds.has(effect.factionA) || !factionIds.has(effect.factionB)) {
          push(`Mission tree "${tree.id}" change_disposition references unknown faction`);
        }
      }
      if (effect.type === 'unlock_equipment' && !equipIds.has(effect.equipmentItemId)) {
        push(`Mission tree "${tree.id}" unlock_equipment references unknown item: ${effect.equipmentItemId}`);
      }
      if (effect.type === 'unlock_equipment' && !allLandableIds.has(effect.atLandableId)) {
        push(`Mission tree "${tree.id}" unlock_equipment references unknown landable: ${effect.atLandableId}`);
      }
    }
  }

  if (world.metadata.gameTimeRate !== undefined) {
    if (!(typeof world.metadata.gameTimeRate === 'number' && world.metadata.gameTimeRate > 0)) {
      push('metadata.gameTimeRate must be a finite number > 0');
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
  } else {
    const startHull = hullById.get(sc.hullSpecId)!;
    const startExpanded = expandSlotsToFullHull(
      startHull,
      (sc.equipmentSlots ?? []).map((s) => ({ ...s }))
    );
    validateExpandedLoadout(startHull, startExpanded, 'startingConditions', equipmentById, push);
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
      for (const key of MATTER_REDUCTION_KEYS) {
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
    if (item.type === 'hyperspaceDrive') {
      const h = item as HyperspaceDriveItem;
      if (!(h.jumpRange > 0) || !(h.fuelCostPerJump > 0) || !(h.cooldown > 0)) {
        push(`Hyperspace drive "${item.id}" requires positive jumpRange, fuelCostPerJump, and cooldown`);
      }
    }
  }

  for (const hull of world.hullSpecs) {
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
      const expanded = expandSlotsToFullHull(
        hull,
        (entry.equipmentSlots ?? []).map((s) => ({ ...s }))
      );
      validateExpandedLoadout(hull, expanded, `defaultLoadouts.${name}`, equipmentById, push);
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
