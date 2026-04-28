import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../core/worldState';
import type { ShipState } from '../types';
import type { ShipyardStoreEntry } from './customize';
import { loadTestWorldFile, makeHeadlessSim } from '../sim/headlessSim';
import { expandSlotsToFullHull } from './slotLayout';
import { slotOriginKey } from './customize';
import type { EquipmentSlot, WorldFile } from '../types';

function pickLandableOfferingListing(wf: WorldFile, listingId: string) {
  for (const sec of wf.sectors) {
    for (const land of sec.landables) {
      if (land.shipyard?.listingIds?.includes(listingId)) {
        return land;
      }
    }
  }
  return null;
}

/** A shipyard listing for a hull different from the world's starter (so purchase changes hull). */
function pickAlternateShipyardListing(wf: WorldFile) {
  const start = wf.startingConditions.hullSpecId;
  const listing = wf.shipyardListings.find((l) => l.hullSpecId !== start);
  if (!listing) {
    throw new Error('expected a shipyard listing whose hull differs from startingConditions.hullSpecId');
  }
  return listing;
}

function mostExpensiveShipyardListing(wf: WorldFile) {
  return wf.shipyardListings.reduce((a, b) => (a.price >= b.price ? a : b));
}

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
    const starterId = wf.startingConditions.hullSpecId;
    const starterHull = wf.hullSpecs.find((h) => h.id === starterId)!;
    const listing = pickAlternateShipyardListing(wf);
    const landableJson = pickLandableOfferingListing(wf, listing.id);
    if (!landableJson) {
      throw new Error('alternate listing not offered at any landable');
    }
    const { worldState } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: {
        credits: 999_999,
        hullSpecId: starterId,
        equipmentSlots: expandSlotsToFullHull(
          starterHull,
          starterHull.defaultLoadouts.raw.map((s) => ({ ...s }))
        ),
        currentHullHP: 33,
        cargo: []
      }
    });
    const landable = worldState.getLandableById(landableJson.id)!;
    const shipyardListing = worldState.getShipyardListing(listing.id)!;
    const newHull = worldState.getHullSpec(shipyardListing.hullSpecId)!;
    const slots = expandSlotsToFullHull(newHull, shipyardListing.equipmentSlots.map((s) => ({ ...s })));
    const origins = buildOriginsForListingSlots(newHull.id, worldState, shipyardListing.equipmentSlots);
    const store = storeFromPlayerEquipment(worldState.getPlayerShipState());
    const creditsBefore = worldState.getPlayerShipState().credits;
    const r = worldState.confirmShipyardPurchase({
      landable,
      listing: shipyardListing,
      finalEquipmentSlots: slots,
      slotOrigins: origins,
      storeEntries: store
    });
    expect(r.success).toBe(true);
    const ship = worldState.getPlayerShipState();
    expect(ship.hullSpecId).toBe(shipyardListing.hullSpecId);
    expect(ship.currentHullHP).toBe(ship.maxHullHP);
    expect(ship.maxHullHP).toBe(newHull.baseHP);
    expect(ship.credits).toBe(creditsBefore - (r as { success: true; netCost: number }).netCost);
    expect(ship.equipmentSlots.length).toBeGreaterThan(0);
  });

  it('returns failure without mutating state when credits are insufficient', () => {
    const wf = loadTestWorldFile();
    const starterId = wf.startingConditions.hullSpecId;
    const starterHull = wf.hullSpecs.find((h) => h.id === starterId)!;
    const listing = mostExpensiveShipyardListing(wf);
    const landableJson = pickLandableOfferingListing(wf, listing.id);
    if (!landableJson) {
      throw new Error('expensive listing not offered at any landable');
    }
    const { worldState } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: {
        credits: 0,
        hullSpecId: starterId,
        equipmentSlots: expandSlotsToFullHull(
          starterHull,
          starterHull.defaultLoadouts.raw.map((s) => ({ ...s }))
        ),
        cargo: []
      }
    });
    const snap = JSON.stringify(worldState.getPlayerShipState());
    const landable = worldState.getLandableById(landableJson.id)!;
    const shipyardListing = worldState.getShipyardListing(listing.id)!;
    const newHull = worldState.getHullSpec(shipyardListing.hullSpecId)!;
    const slots = expandSlotsToFullHull(newHull, shipyardListing.equipmentSlots.map((s) => ({ ...s })));
    const origins = buildOriginsForListingSlots(newHull.id, worldState, shipyardListing.equipmentSlots);
    const store = storeFromPlayerEquipment(worldState.getPlayerShipState());
    const r = worldState.confirmShipyardPurchase({
      landable,
      listing: shipyardListing,
      finalEquipmentSlots: slots,
      slotOrigins: origins,
      storeEntries: store
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(worldState.getPlayerShipState())).toBe(snap);
  });

  it('returns failure when cargo exceeds new hull capacity', () => {
    const wf = loadTestWorldFile();
    const starterId = wf.startingConditions.hullSpecId;
    const starterHull = wf.hullSpecs.find((h) => h.id === starterId)!;
    const listing = pickAlternateShipyardListing(wf);
    const landableJson = pickLandableOfferingListing(wf, listing.id);
    if (!landableJson) {
      throw new Error('alternate listing not offered at any landable');
    }
    const { worldState } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: {
        credits: 999_999,
        hullSpecId: starterId,
        equipmentSlots: expandSlotsToFullHull(
          starterHull,
          starterHull.defaultLoadouts.raw.map((s) => ({ ...s }))
        ),
        cargo: [{ missionId: 'x', description: 'bulk', weight: 500 }]
      }
    });
    const snap = JSON.stringify(worldState.getPlayerShipState());
    const landable = worldState.getLandableById(landableJson.id)!;
    const shipyardListing = worldState.getShipyardListing(listing.id)!;
    const newHull = worldState.getHullSpec(shipyardListing.hullSpecId)!;
    const slots = expandSlotsToFullHull(newHull, shipyardListing.equipmentSlots.map((s) => ({ ...s })));
    const origins = buildOriginsForListingSlots(newHull.id, worldState, shipyardListing.equipmentSlots);
    const store = storeFromPlayerEquipment(worldState.getPlayerShipState());
    const r = worldState.confirmShipyardPurchase({
      landable,
      listing: shipyardListing,
      finalEquipmentSlots: slots,
      slotOrigins: origins,
      storeEntries: store
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(worldState.getPlayerShipState())).toBe(snap);
  });
});
