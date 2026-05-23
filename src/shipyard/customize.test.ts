import { describe, expect, it } from 'vitest';
import {
  computeShipyardNetCost,
  customizeCargoFitsNewHull,
  customizeRequiredSlotsFilled,
  slotOriginKey
} from './customize';
import { expandSlotsToFullHull } from './slotLayout';
import type { EquipmentSlot, HullSpec } from '../types';

function testHull(overrides: Partial<HullSpec> = {}): HullSpec {
  return {
    id: 'test_hull',
    name: 'Test',
    description: '',
    silhouette: 'fighter',
    dimensions: { length: 32, width: 16 },
    hullMass: 10,
    cargoCapacity: 50,
    equipmentCapacity: 200,
    topSpeed: 100,
    topAngularSpeed: 2,
    baseHP: 100,
    weaponSlots: 1,
    price: 10000,
    sellValue: 6000,
    slotCounts: {
      thruster_forward: 1,
      thruster_rotate: 1,
      fuelTank: 1,
      weapon: 1
    },
    defaultLoadouts: { raw: [], basic: [], advanced: [] },
    ...overrides
  };
}

function slotOrderSlots(hull: HullSpec, fill: Partial<Record<EquipmentSlot['slotType'], (string | null)[]>>): EquipmentSlot[] {
  const desired = { ...(hull.slotCounts ?? {}) } as Record<string, number>;
  if (desired.weapon === undefined) {
    desired.weapon = hull.weaponSlots;
  }
  const slots: EquipmentSlot[] = [];
  for (const st of Object.keys(desired).sort() as EquipmentSlot['slotType'][]) {
    const n = st === 'weapon' ? Math.min(5, Math.max(0, Math.floor(desired[st]))) : Math.max(0, Math.floor(desired[st]));
    const arr = fill[st] ?? [];
    for (let i = 0; i < n; i += 1) {
      slots.push({ slotType: st, itemId: arr[i] ?? null });
    }
  }
  return slots;
}

describe('computeShipyardNetCost', () => {
  it('all new equipment kept, no old in store: net = new hull + new buys − old hull trade-in', () => {
    const hull = testHull();
    const slots = slotOrderSlots(hull, { weapon: ['w1'] });
    const origins = new Map<string, 'new' | 'old'>([[slotOriginKey('weapon', 0), 'new']]);
    const r = computeShipyardNetCost({
      newHullPrice: hull.price,
      oldHullSellValue: 4000,
      hostile: false,
      newHull: hull,
      customizeShipSlots: slots,
      slotOrigins: origins,
      storeEntries: [],
      getBuyPrice: () => 500,
      getSellPrice: () => 0
    });
    expect(r.newHullCredits).toBe(10000);
    expect(r.keptNewEquipmentCredits).toBe(500);
    expect(r.oldHullTradeInCredits).toBe(4000);
    expect(r.oldEquipmentTradeInCredits).toBe(0);
    expect(r.netCost).toBe(10000 + 500 - 4000);
  });

  it('all new removed to store, all old installed on ship: net = new hull only − old hull', () => {
    const hull = testHull();
    const slots = slotOrderSlots(hull, { weapon: ['old_w'] });
    const origins = new Map<string, 'new' | 'old'>([[slotOriginKey('weapon', 0), 'old']]);
    const store = [{ itemId: 'w1', origin: 'new' as const }];
    const r = computeShipyardNetCost({
      newHullPrice: hull.price,
      oldHullSellValue: 5000,
      hostile: false,
      newHull: hull,
      customizeShipSlots: slots,
      slotOrigins: origins,
      storeEntries: store,
      getBuyPrice: () => 999,
      getSellPrice: () => 0
    });
    expect(r.keptNewEquipmentCredits).toBe(0);
    expect(r.netCost).toBe(10000 - 5000);
  });

  it('mixed: kept new on ship, old in store trade-in, new left in store ignored', () => {
    const hull = testHull();
    const slots = slotOrderSlots(hull, { weapon: ['w_new'] });
    const origins = new Map<string, 'new' | 'old'>([[slotOriginKey('weapon', 0), 'new']]);
    const store = [
      { itemId: 'junk_old', origin: 'old' as const },
      { itemId: 'junk_new', origin: 'new' as const }
    ];
    const r = computeShipyardNetCost({
      newHullPrice: 10000,
      oldHullSellValue: 2000,
      hostile: false,
      newHull: hull,
      customizeShipSlots: slots,
      slotOrigins: origins,
      storeEntries: store,
      getBuyPrice: (id) => (id === 'w_new' ? 300 : 100),
      getSellPrice: (id) => (id === 'junk_old' ? 150 : 0)
    });
    expect(r.keptNewEquipmentCredits).toBe(300);
    expect(r.oldEquipmentTradeInCredits).toBe(150);
    expect(r.netCost).toBe(10000 + 300 - 2000 - 150);
  });

  it('hostile: doubles new side, halves old side', () => {
    const hull = testHull();
    const slots = slotOrderSlots(hull, { weapon: ['w1'] });
    const origins = new Map<string, 'new' | 'old'>([[slotOriginKey('weapon', 0), 'new']]);
    const r = computeShipyardNetCost({
      newHullPrice: 10000,
      oldHullSellValue: 4000,
      hostile: true,
      newHull: hull,
      customizeShipSlots: slots,
      slotOrigins: origins,
      storeEntries: [{ itemId: 'x', origin: 'old' }],
      getBuyPrice: () => 500,
      getSellPrice: () => 200
    });
    expect(r.newHullCredits).toBe(20000);
    expect(r.keptNewEquipmentCredits).toBe(1000);
    expect(r.oldHullTradeInCredits).toBe(2000);
    expect(r.oldEquipmentTradeInCredits).toBe(100);
    expect(r.netCost).toBe(20000 + 1000 - 2000 - 100);
  });

  it('negative net cost is represented correctly', () => {
    const hull = testHull();
    const slots = slotOrderSlots(hull, {});
    const r = computeShipyardNetCost({
      newHullPrice: 1000,
      oldHullSellValue: 50000,
      hostile: false,
      newHull: hull,
      customizeShipSlots: slots,
      slotOrigins: new Map<string, 'new' | 'old'>(),
      storeEntries: [],
      getBuyPrice: () => 0,
      getSellPrice: () => 0
    });
    expect(r.netCost).toBe(1000 - 50000);
    expect(r.netCost).toBeLessThan(0);
  });
});

describe('customizeRequiredSlotsFilled', () => {
  it('fails when a required slot is empty', () => {
    const hull = testHull();
    const slots = expandSlotsToFullHull(hull, [{ slotType: 'weapon', itemId: 'w1' }]);
    expect(customizeRequiredSlotsFilled(hull, slots)).toBe(false);
  });
});

describe('customizeCargoFitsNewHull', () => {
  it('blocks when cargo exceeds capacity', () => {
    const hull = testHull({ cargoCapacity: 10 });
    const r = customizeCargoFitsNewHull(hull, 50);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.cargoMass).toBe(50);
      expect(r.capacity).toBe(10);
    }
  });
});
