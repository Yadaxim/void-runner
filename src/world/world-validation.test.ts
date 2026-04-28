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
    expect(r.errors.some((e) => e.includes('defaultLoadouts') && e.includes('no_such_item'))).toBe(true);
  });

  it('flags startingConditions equipmentSlots unknown item', () => {
    const w = structuredClone(loadWorld());
    w.startingConditions.equipmentSlots = [{ slotType: 'weapon', itemId: 'bogus_equip' }];
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('startingConditions.equipmentSlots'))).toBe(true);
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

  it('flags slot/item type mismatch in hull equipmentLoadout', () => {
    const w = structuredClone(loadWorld());
    const hull = w.hullSpecs.find((h) => h.equipmentLoadout?.length);
    expect(hull?.equipmentLoadout?.length).toBeTruthy();
    const slot = hull!.equipmentLoadout!.find((s) => s.slotType === 'weapon');
    expect(slot?.itemId).toBeTruthy();
    slot!.slotType = 'armour';
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('type mismatch'))).toBe(true);
  });

  it('flags startingConditions factionReputations out of range', () => {
    const w = structuredClone(loadWorld());
    w.startingConditions.factionReputations = { federation: 101 };
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
    const hull = w.hullSpecs.find((h) => h.id === 'fighter_mk1')!;
    hull.defaultLoadouts.raw = structuredClone(hull.defaultLoadouts.basic);
    const r = validateWorldFile(w);
    expect(r.errors.some((e) => e.includes('raw loadout must not equip optional'))).toBe(true);
  });

  it('flags basic loadout exceeding slot counts', () => {
    const w = structuredClone(loadWorld());
    const hull = w.hullSpecs.find((h) => h.id === 'fighter_mk1')!;
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
    const listing = w.shipyardListings.find((l) => l.hullSpecId === 'fighter_mk1')!;
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
    const port = w.sectors.flatMap((s) => s.landables).find((l) => l.id === 'port_kaelen')!;
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
});
