import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WorldFile } from '../types';
import { validateWorldFile } from './validation';

function loadWorld(): WorldFile {
  const raw = readFileSync(join(process.cwd(), 'public/testWorld.json'), 'utf-8');
  return JSON.parse(raw) as WorldFile;
}

describe('validateWorldFile', () => {
  it('testWorld.json passes with zero errors', () => {
    const r = validateWorldFile(loadWorld());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('flags duplicate species id', () => {
    const w = structuredClone(loadWorld());
    w.species.push({ ...w.species[0] });
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Duplicate species id'))).toBe(true);
  });

  it('flags faction speciesComposition referencing unknown species', () => {
    const w = structuredClone(loadWorld());
    w.factions[0].speciesComposition = [{ speciesId: 'ghost_species', percentage: 100 }];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('speciesComposition') && e.includes('ghost_species'))).toBe(true);
  });

  it('flags faction speciesComposition percentages that do not sum to 100', () => {
    const w = structuredClone(loadWorld());
    w.factions[0].speciesComposition = [{ speciesId: w.species[0].id, percentage: 80 }];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('speciesComposition percentages must sum to 100'))).toBe(true);
  });

  it('flags non-independent faction without a valid homeLandableId', () => {
    const w = structuredClone(loadWorld());
    w.factions[0].homeLandableId = 'missing_port';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('homeLandableId') && e.includes('missing_port'))).toBe(true);
  });

  it('flags independent faction with a homeLandableId', () => {
    const w = structuredClone(loadWorld());
    const faction = w.factions[0];
    faction.type = 'independent';
    faction.homeLandableId = 'vethos_prime';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Independent faction') && e.includes('homeLandableId null'))).toBe(true);
  });

  it('starting sector (5,5) NPC spawn rules reference hullSpecs with motion and mass', () => {
    const w = loadWorld();
    const sector = w.sectors.find((s) => s.coord.x === 5 && s.coord.y === 5);
    expect(sector).toBeDefined();
    const hullIds = [...new Set(sector!.npcSpawnRules.map((r) => r.hullSpecId))];
    for (const id of hullIds) {
      const hull = w.hullSpecs.find((h) => h.id === id);
      expect(hull, `missing hull ${id}`).toBeDefined();
      expect(hull!.topSpeed).toBeGreaterThan(0);
      expect(hull!.topAngularSpeed).toBeGreaterThan(0);
      expect(hull!.hullMass).toBeGreaterThan(0);
    }
  });

  it('flags hull missing required slot type', () => {
    const w = structuredClone(loadWorld());
    const hull = w.hullSpecs[0];
    hull.slotCounts = { ...hull.slotCounts, thruster_forward: 0 };
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('thruster_forward'))).toBe(true);
  });

  it('flags defaultLoadouts item not in catalog', () => {
    const w = structuredClone(loadWorld());
    w.defaultLoadouts = {
      x: { hullSpecId: w.hullSpecs[0].id, equipmentSlots: [{ slotType: 'weapon', itemId: 'no_such_item' }] }
    };
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('defaultLoadouts.x') && e.includes('no_such_item'))).toBe(true);
  });

  it('flags startingConditions equipmentSlots unknown item', () => {
    const w = structuredClone(loadWorld());
    w.startingConditions.equipmentSlots = [{ slotType: 'weapon', itemId: 'bogus_equip' }];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('startingConditions') && e.includes('bogus_equip'))).toBe(true);
  });

  it('flags hull defaultLoadout when installed equipment mass exceeds equipmentCapacity', () => {
    const w = structuredClone(loadWorld());
    const hull = w.hullSpecs.find((h) => h.id === 'interceptor_mk1');
    expect(hull).toBeDefined();
    hull!.equipmentCapacity = 5;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('defaultLoadouts.advanced') && e.includes('installed equipment mass'))).toBe(
      true
    );
  });

  it('flags startingConditions when installed equipment mass exceeds equipmentCapacity', () => {
    const w = structuredClone(loadWorld());
    const hull = w.hullSpecs.find((h) => h.id === w.startingConditions.hullSpecId);
    expect(hull).toBeDefined();
    hull!.equipmentCapacity = 5;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('startingConditions') && e.includes('installed equipment mass'))).toBe(true);
  });

  it('flags shipyard listing when installed equipment mass exceeds equipmentCapacity', () => {
    const w = structuredClone(loadWorld());
    const listing = w.shipyardListings.find((l) => l.id === 'sy_interceptor_mk1_advanced');
    expect(listing).toBeDefined();
    const hull = w.hullSpecs.find((h) => h.id === listing!.hullSpecId);
    expect(hull).toBeDefined();
    hull!.equipmentCapacity = 5;
    const r = validateWorldFile(w);
    expect(
      r.errors.some((e) => e.includes('sy_interceptor_mk1_advanced') && e.includes('installed equipment mass'))
    ).toBe(true);
  });

  it('flags equipment catalog item with invalid mass', () => {
    const w = structuredClone(loadWorld());
    w.equipmentCatalog[0].mass = -1;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('finite mass'))).toBe(true);
  });

  it('flags weapon bulletSpecId missing from bulletSpecs', () => {
    const w = structuredClone(loadWorld());
    const weapon = w.equipmentCatalog.find((i) => i.type === 'weapon');
    expect(weapon && 'bulletSpecId' in weapon).toBe(true);
    (weapon as { bulletSpecId: string }).bulletSpecId = 'missing_bullet';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('bulletSpecId'))).toBe(true);
  });

  it('flags sector factionId not in factions', () => {
    const w = structuredClone(loadWorld());
    w.sectors[0].factionId = 'not_a_faction';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('unknown factionId'))).toBe(true);
  });

  it('flags mission template faction requirement unknown faction', () => {
    const w = structuredClone(loadWorld());
    w.missionTemplates[0].factionRequirements.push({ factionId: 'nope', minReputation: 0 });
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Mission template') && e.includes('unknown factionId'))).toBe(true);
  });

  it('flags mission template regionType with no compatible sector', () => {
    const w = structuredClone(loadWorld());
    w.sectors = w.sectors.map((s) => ({ ...s, regionType: 'void' as const }));
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('regionType') && e.includes('no compatible'))).toBe(true);
  });

  it('flags duplicate landable id in same sector', () => {
    const w = structuredClone(loadWorld());
    const s = w.sectors[0];
    const dup = { ...s.landables[0], position: { ...s.landables[0].position } };
    s.landables.push(dup);
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Duplicate landable id'))).toBe(true);
  });

  it('flags duplicate equipment id', () => {
    const w = structuredClone(loadWorld());
    w.equipmentCatalog.push({ ...w.equipmentCatalog[0], id: w.equipmentCatalog[0].id });
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Duplicate equipment id'))).toBe(true);
  });

  it('flags equipment missing valid price', () => {
    const w = structuredClone(loadWorld());
    const first = w.equipmentCatalog[0];
    const firstId = first.id;
    delete (first as { price?: number }).price;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('price') && e.includes(firstId))).toBe(true);
  });

  it('flags duplicate hull id', () => {
    const w = structuredClone(loadWorld());
    w.hullSpecs.push({ ...w.hullSpecs[0] });
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Duplicate hull spec id'))).toBe(true);
  });

  it('flags armour missing reduction key', () => {
    const w = structuredClone(loadWorld());
    const arm = w.equipmentCatalog.find((i) => i.type === 'armour');
    expect(arm).toBeTruthy();
    const next = { ...(arm as { reductions: Record<string, number> }).reductions };
    delete next.kinetic;
    (arm as { reductions: Record<string, number> }).reductions = next;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Armour') && e.includes('kinetic'))).toBe(true);
  });

  it('flags starting sector coord missing', () => {
    const w = structuredClone(loadWorld());
    w.startingConditions.sectorCoord = { x: 99999, y: 99999 };
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('startingConditions.sectorCoord'))).toBe(true);
  });

  it('flags starting hullSpecId missing', () => {
    const w = structuredClone(loadWorld());
    w.startingConditions.hullSpecId = 'no_hull';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('startingConditions.hullSpecId'))).toBe(true);
  });

  it('flags npcSpawnRules unknown faction', () => {
    const w = structuredClone(loadWorld());
    w.sectors[0].npcSpawnRules[0].factionId = 'ghost';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('npcSpawnRules') && e.includes('unknown factionId'))).toBe(true);
  });

  it('flags spawn rule count ordering', () => {
    const w = structuredClone(loadWorld());
    const rule = w.sectors[0].npcSpawnRules[0];
    rule.minPresent = 5;
    rule.countRange = [1, 2];
    rule.maxPresent = 3;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('minPresent'))).toBe(true);
  });

  it('flags shield rebootTime ≤ regenDelay', () => {
    const w = structuredClone(loadWorld());
    const sh = w.equipmentCatalog.find((i) => i.type === 'shield');
    expect(sh).toBeTruthy();
    (sh as { rebootTime: number; regenDelay: number }).rebootTime = 1;
    (sh as { rebootTime: number; regenDelay: number }).regenDelay = 4;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('rebootTime > regenDelay'))).toBe(true);
  });

  it('flags slot/item type mismatch in hull defaultLoadouts.basic', () => {
    const w = structuredClone(loadWorld());
    const hull = w.hullSpecs.find((h) => h.defaultLoadouts?.basic?.length);
    expect(hull?.defaultLoadouts?.basic?.length).toBeTruthy();
    const slot = hull!.defaultLoadouts!.basic!.find((s) => s.slotType === 'weapon');
    expect(slot?.itemId).toBeTruthy();
    slot!.slotType = 'armour';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('type mismatch'))).toBe(true);
  });

  it('flags startingConditions factionReputations out of range', () => {
    const w = structuredClone(loadWorld());
    const fid = w.factions.find((f) => !f.isPirate)!.id;
    w.startingConditions.factionReputations = { [fid]: 101 };
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('factionReputations') && e.includes('range'))).toBe(true);
  });

  it('flags arrivalIntervalRange reversed', () => {
    const w = structuredClone(loadWorld());
    w.sectors[0].npcSpawnRules[0].arrivalIntervalRange = [50, 10];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('arrivalIntervalRange'))).toBe(true);
  });

  it('flags invalid behaviourType', () => {
    const w = structuredClone(loadWorld());
    w.sectors[0].npcSpawnRules[0].behaviourType = 'invalid_mode' as 'patrol';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Invalid behaviourType'))).toBe(true);
  });

  it('flags default loadout exceeding hull slotCounts', () => {
    const w = structuredClone(loadWorld());
    const hull = w.hullSpecs[0];
    const manyWeapons = Array.from({ length: 20 }, () => ({
      slotType: 'weapon' as const,
      itemId: w.equipmentCatalog.find((i) => i.type === 'weapon')!.id
    }));
    w.defaultLoadouts = {
      overload: { hullSpecId: hull.id, equipmentSlots: manyWeapons }
    };
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('defaultLoadouts') && e.includes('exceeds slotCounts'))).toBe(true);
  });

  it('flags shield non-positive stats', () => {
    const w = structuredClone(loadWorld());
    const sh = w.equipmentCatalog.find((i) => i.type === 'shield');
    (sh as { shieldHP: number }).shieldHP = 0;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('positive shieldHP'))).toBe(true);
  });

  it('flags reactor non-positive charge or fuelPerJoule', () => {
    const w = structuredClone(loadWorld());
    const rItem = w.equipmentCatalog.find((i) => i.type === 'reactor');
    (rItem as { chargeRateJoulesPerSecond: number }).chargeRateJoulesPerSecond = 0;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Reactor') && e.includes('positive'))).toBe(true);
  });

  it('flags fuel tank non-positive capacity', () => {
    const w = structuredClone(loadWorld());
    const ft = w.equipmentCatalog.find((i) => i.type === 'fuelTank');
    (ft as { fuelCapacity: number }).fuelCapacity = 0;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Fuel tank') && e.includes('positive'))).toBe(true);
  });

  it('flags hull missing defaultLoadouts.raw', () => {
    const w = structuredClone(loadWorld());
    const hull = w.hullSpecs[0];
    const { raw: _r, ...rest } = hull.defaultLoadouts;
    hull.defaultLoadouts = rest as typeof hull.defaultLoadouts;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('missing defaultLoadouts.raw'))).toBe(true);
  });

  it('flags raw loadout with optional slot equipped', () => {
    const w = structuredClone(loadWorld());
    const hull =
      w.hullSpecs.find((h) => h.defaultLoadouts.basic.length > h.defaultLoadouts.raw.length) ?? w.hullSpecs[0];
    hull.defaultLoadouts.raw = structuredClone(hull.defaultLoadouts.basic);
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('raw loadout must not equip optional'))).toBe(true);
  });

  it('flags basic loadout exceeding slot counts', () => {
    const w = structuredClone(loadWorld());
    const hull =
      w.hullSpecs.find((h) => h.defaultLoadouts.basic.length > h.defaultLoadouts.raw.length) ?? w.hullSpecs[0];
    const wpn = w.equipmentCatalog.find((i) => i.type === 'weapon')!;
    hull.defaultLoadouts.basic = [
      ...hull.defaultLoadouts.basic,
      { slotType: 'weapon' as const, itemId: wpn.id },
      { slotType: 'weapon' as const, itemId: wpn.id },
      { slotType: 'weapon' as const, itemId: wpn.id }
    ];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('exceeds slotCounts'))).toBe(true);
  });

  it('flags shipyard listing referencing missing hull', () => {
    const w = structuredClone(loadWorld());
    w.shipyardListings[0].hullSpecId = 'no_such_hull';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Shipyard listing') && e.includes('unknown hullSpecId'))).toBe(true);
  });

  it('flags shipyard listing with empty required slot', () => {
    const w = structuredClone(loadWorld());
    const listing = w.shipyardListings[0];
    listing.equipmentSlots = listing.equipmentSlots.map((s) =>
      s.slotType === 'fuelTank' ? { ...s, itemId: null } : s
    );
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('required slot') && e.includes('not filled'))).toBe(true);
  });

  it('flags shipyard listing with non-positive price', () => {
    const w = structuredClone(loadWorld());
    w.shipyardListings[0].price = 0;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Shipyard listing') && e.includes('price > 0'))).toBe(true);
  });

  it('flags landable shipyard referencing missing listing id', () => {
    const w = structuredClone(loadWorld());
    const port = w.sectors.flatMap((s) => s.landables).find((l) => l.shipyard?.listingIds?.length)!;
    port.shipyard!.listingIds = ['no_such_listing'];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('unknown listing id'))).toBe(true);
  });

  it('flags spawn rule with invalid loadoutVariant', () => {
    const w = structuredClone(loadWorld());
    w.sectors[0].npcSpawnRules[0].loadoutVariant = 'elite' as 'basic';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('Invalid loadoutVariant'))).toBe(true);
  });

  it('flags npcSpawnRules with empty hullSpecId', () => {
    const w = structuredClone(loadWorld());
    (w.sectors[0].npcSpawnRules[0] as { hullSpecId: string }).hullSpecId = '   ';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('non-empty hullSpecId'))).toBe(true);
  });

  it('flags bullet seeking ability with invalid turnRatio', () => {
    const w = structuredClone(loadWorld());
    const spec = w.bulletSpecs.find((b) => b.id === 'seeker_missile')!;
    spec.abilities = [{ type: 'seeking', turnRatio: Number.NaN }];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('finite turnRatio'))).toBe(true);
  });

  it('flags duplicate seeking abilities on one bullet', () => {
    const w = structuredClone(loadWorld());
    const spec = w.bulletSpecs.find((b) => b.id === 'seeker_missile')!;
    spec.abilities = [
      { type: 'seeking', turnRatio: 1 },
      { type: 'seeking', turnRatio: 2 }
    ];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('at most one seeking'))).toBe(true);
  });

  it('flags bullet abilities when not an array', () => {
    const w = structuredClone(loadWorld());
    const spec = w.bulletSpecs.find((b) => b.id === 'pulse_bolt')!;
    (spec as { abilities: unknown }).abilities = { type: 'seeking', turnRatio: 1 } as unknown;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('abilities must be an array'))).toBe(true);
  });

  it('flags unknown bullet ability type', () => {
    const w = structuredClone(loadWorld());
    const spec = w.bulletSpecs.find((b) => b.id === 'pulse_bolt')!;
    spec.abilities = [{ type: 'cloak', turnRatio: 1 }] as unknown as typeof spec.abilities;
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('unknown type') && e.includes('cloak'))).toBe(true);
  });

  it('flags seeking ability with negative turnRatio', () => {
    const w = structuredClone(loadWorld());
    const spec = w.bulletSpecs.find((b) => b.id === 'seeker_missile')!;
    spec.abilities = [{ type: 'seeking', turnRatio: -0.1 }];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('finite turnRatio') && e.includes('>='))).toBe(true);
  });

  it('flags invalid bullet abilities entry', () => {
    const w = structuredClone(loadWorld());
    const spec = w.bulletSpecs.find((b) => b.id === 'pulse_bolt')!;
    spec.abilities = [null as unknown as { type: 'seeking'; turnRatio: number }];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('abilities[0] is invalid'))).toBe(true);
  });

  it('flags seeking ability missing type string', () => {
    const w = structuredClone(loadWorld());
    const spec = w.bulletSpecs.find((b) => b.id === 'pulse_bolt')!;
    spec.abilities = [{ turnRatio: 2 } as { type: 'seeking'; turnRatio: number }];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('missing type'))).toBe(true);
  });
});
