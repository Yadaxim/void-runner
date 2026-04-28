import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../core/worldState';
import type { ShipState } from '../types';
import type { ShipyardStoreEntry } from './customize';
import { loadTestWorldFile, makeHeadlessSim } from '../sim/headlessSim';
import { expandSlotsToFullHull } from './slotLayout';
import { slotOriginKey } from './customize';
import type { EquipmentSlot } from '../types';

function buildOriginsForListingSlots(hullId: string, world: WorldState, listingSlots: EquipmentSlot[]): Map<string, 'new' | 'old'> {
  const hull = world.getHullSpec(hullId)!;
  const expanded = expandSlotsToFullHull(hull, listingSlots.map((s) => ({ ...s })));
  const origins = new Map<string, 'new' | 'old'>();
  for (const st of Object.keys(hull.slotCounts ?? {}) as EquipmentSlot['slotType'][]) {
    const filtered = expanded.filter((s) => s.slotType === st);
    for (let i = 0; i < filtered.length; i += 1) {
      if (filtered[i]?.itemId) {
        origins.set(slotOriginKey(st, i), 'new');
      }
    }
  }
  return origins;
}

function storeFromPlayerEquipment(ship: ShipState): ShipyardStoreEntry[] {
  const out: ShipyardStoreEntry[] = [];
  for (const s of ship.equipmentSlots) {
    if (s.itemId) {
      out.push({ itemId: s.itemId, origin: 'old' });
    }
  }
  return out;
}

describe('confirmShipyardPurchase', () => {
  beforeAll(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
        key: (i: number) => Object.keys(store)[i] ?? null,
        get length() {
          return Object.keys(store).length;
        }
      } as Storage
    );
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('applies hull, equipment, credits, and resets HP for a valid purchase', () => {
    const wf = loadTestWorldFile();
    const { worldState } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: {
        credits: 999_999,
        hullSpecId: 'fighter_mk1',
        equipmentSlots: expandSlotsToFullHull(
          wf.hullSpecs.find((h) => h.id === 'fighter_mk1')!,
          wf.hullSpecs.find((h) => h.id === 'fighter_mk1')!.defaultLoadouts.raw.map((s) => ({ ...s }))
        ),
        currentHullHP: 33,
        cargo: []
      }
    });
    const landable = worldState.getLandableById('port_kaelen')!;
    const listing = worldState.getShipyardListing('sy_fighter_raider_mk1_raw')!;
    const newHull = worldState.getHullSpec(listing.hullSpecId)!;
    const slots = expandSlotsToFullHull(newHull, listing.equipmentSlots.map((s) => ({ ...s })));
    const origins = buildOriginsForListingSlots(newHull.id, worldState, listing.equipmentSlots);
    const store = storeFromPlayerEquipment(worldState.getPlayerShipState());
    const creditsBefore = worldState.getPlayerShipState().credits;
    const r = worldState.confirmShipyardPurchase({
      landable,
      listing,
      finalEquipmentSlots: slots,
      slotOrigins: origins,
      storeEntries: store
    });
    expect(r.success).toBe(true);
    const ship = worldState.getPlayerShipState();
    expect(ship.hullSpecId).toBe('fighter_raider_mk1');
    expect(ship.currentHullHP).toBe(ship.maxHullHP);
    expect(ship.maxHullHP).toBe(newHull.baseHP);
    expect(ship.credits).toBe(creditsBefore - (r as { success: true; netCost: number }).netCost);
    expect(ship.equipmentSlots.length).toBeGreaterThan(0);
  });

  it('returns failure without mutating state when credits are insufficient', () => {
    const wf = loadTestWorldFile();
    const { worldState } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: {
        credits: 0,
        hullSpecId: 'fighter_mk1',
        equipmentSlots: expandSlotsToFullHull(
          wf.hullSpecs.find((h) => h.id === 'fighter_mk1')!,
          wf.hullSpecs.find((h) => h.id === 'fighter_mk1')!.defaultLoadouts.raw.map((s) => ({ ...s }))
        ),
        cargo: []
      }
    });
    const snap = JSON.stringify(worldState.getPlayerShipState());
    const landable = worldState.getLandableById('port_kaelen')!;
    const listing = worldState.getShipyardListing('sy_freighter_mk1_advanced')!;
    const newHull = worldState.getHullSpec(listing.hullSpecId)!;
    const slots = expandSlotsToFullHull(newHull, listing.equipmentSlots.map((s) => ({ ...s })));
    const origins = buildOriginsForListingSlots(newHull.id, worldState, listing.equipmentSlots);
    const store = storeFromPlayerEquipment(worldState.getPlayerShipState());
    const r = worldState.confirmShipyardPurchase({
      landable,
      listing,
      finalEquipmentSlots: slots,
      slotOrigins: origins,
      storeEntries: store
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(worldState.getPlayerShipState())).toBe(snap);
  });

  it('returns failure when cargo exceeds new hull capacity', () => {
    const wf = loadTestWorldFile();
    const { worldState } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: {
        credits: 999_999,
        hullSpecId: 'fighter_mk1',
        equipmentSlots: expandSlotsToFullHull(
          wf.hullSpecs.find((h) => h.id === 'fighter_mk1')!,
          wf.hullSpecs.find((h) => h.id === 'fighter_mk1')!.defaultLoadouts.raw.map((s) => ({ ...s }))
        ),
        cargo: [{ missionId: 'x', description: 'bulk', weight: 500 }]
      }
    });
    const snap = JSON.stringify(worldState.getPlayerShipState());
    const landable = worldState.getLandableById('port_kaelen')!;
    const listing = worldState.getShipyardListing('sy_fighter_raider_mk1_raw')!;
    const newHull = worldState.getHullSpec(listing.hullSpecId)!;
    const slots = expandSlotsToFullHull(newHull, listing.equipmentSlots.map((s) => ({ ...s })));
    const origins = buildOriginsForListingSlots(newHull.id, worldState, listing.equipmentSlots);
    const store = storeFromPlayerEquipment(worldState.getPlayerShipState());
    const r = worldState.confirmShipyardPurchase({
      landable,
      listing,
      finalEquipmentSlots: slots,
      slotOrigins: origins,
      storeEntries: store
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(worldState.getPlayerShipState())).toBe(snap);
  });
});
