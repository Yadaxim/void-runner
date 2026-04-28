import { REQUIRED_SLOT_TYPES } from '../constants';
import type { EquipmentSlot, HullSpec } from '../types';
import { expandSlotsToFullHull, getHullSlotCount } from './slotLayout';

export type ShipyardItemOrigin = 'new' | 'old';

export interface ShipyardStoreEntry {
  itemId: string;
  origin: ShipyardItemOrigin;
}

export interface ShipyardCostBreakdown {
  newHullCredits: number;
  keptNewEquipmentCredits: number;
  oldHullTradeInCredits: number;
  oldEquipmentTradeInCredits: number;
  netCost: number;
}

export function slotOriginKey(slotType: EquipmentSlot['slotType'], slotIndex: number): string {
  return `${slotType}:${slotIndex}`;
}

export function computeShipyardNetCost(input: {
  newHullPrice: number;
  oldHullSellValue: number;
  hostile: boolean;
  newHull: HullSpec;
  customizeShipSlots: EquipmentSlot[];
  slotOrigins: Map<string, ShipyardItemOrigin>;
  storeEntries: ShipyardStoreEntry[];
  /** Mirrors equipment store buy price (rep + hostile applied by caller). */
  getBuyPrice: (itemId: string) => number;
  /** Mirrors equipment store sell value (caller applies hostile halving only in net formula). */
  getSellPrice: (itemId: string) => number;
}): ShipyardCostBreakdown {
  const { newHullPrice, oldHullSellValue, hostile, newHull, customizeShipSlots, slotOrigins, storeEntries, getBuyPrice, getSellPrice } =
    input;
  const newMult = hostile ? 2 : 1;
  const oldMult = hostile ? 0.5 : 1;

  let keptNewEquipmentBase = 0;
  for (const slotType of Object.keys(
    newHull.slotCounts ?? {}
  ) as EquipmentSlot['slotType'][]) {
    const n = getHullSlotCount(newHull, slotType);
    for (let idx = 0; idx < n; idx += 1) {
      const slot = customizeShipSlots.filter((s) => s.slotType === slotType)[idx];
      if (!slot?.itemId) {
        continue;
      }
      if (slotOrigins.get(slotOriginKey(slotType, idx)) !== 'new') {
        continue;
      }
      keptNewEquipmentBase += getBuyPrice(slot.itemId);
    }
  }

  let oldEquipmentSellBase = 0;
  for (const row of storeEntries) {
    if (row.origin !== 'old') {
      continue;
    }
    oldEquipmentSellBase += getSellPrice(row.itemId);
  }

  const newHullCredits = newHullPrice * newMult;
  const keptNewEquipmentCredits = keptNewEquipmentBase * newMult;
  const oldHullTradeInCredits = oldHullSellValue * oldMult;
  const oldEquipmentTradeInCredits = oldEquipmentSellBase * oldMult;

  const netCost = newHullCredits + keptNewEquipmentCredits - oldHullTradeInCredits - oldEquipmentTradeInCredits;

  return {
    newHullCredits,
    keptNewEquipmentCredits,
    oldHullTradeInCredits,
    oldEquipmentTradeInCredits,
    netCost
  };
}

export function customizeRequiredSlotsFilled(hull: HullSpec, customizeShipSlots: EquipmentSlot[]): boolean {
  const expanded = expandSlotsToFullHull(hull, customizeShipSlots);
  for (const req of REQUIRED_SLOT_TYPES) {
    const filled = expanded.filter((s) => s.slotType === req && s.itemId !== null).length;
    if (filled < 1) {
      return false;
    }
  }
  return true;
}

export function customizeCargoFitsNewHull(
  newHull: HullSpec,
  cargoMass: number
): { ok: true } | { ok: false; cargoMass: number; capacity: number } {
  const cap = newHull.cargoCapacity ?? 0;
  if (cargoMass <= cap) {
    return { ok: true };
  }
  return { ok: false, cargoMass, capacity: cap };
}
