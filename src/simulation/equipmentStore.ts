import {
  EQUIPMENT_BASE_PRICE_PER_MASS,
  EQUIPMENT_SELL_FRACTION,
  EQUIPMENT_STORE_COUNT,
  EQUIPMENT_TIER_MULTIPLIERS
} from '../constants';
import { childPRNG } from '../core/prng';
import type { WorldState } from '../core/worldState';
import type { EquipmentItem, Landable } from '../types';

export class EquipmentStore {
  static generateInventory(
    landable: Landable,
    worldState: WorldState,
    count: number = EQUIPMENT_STORE_COUNT
  ): EquipmentItem[] {
    const catalog = worldState.getWorldFile().equipmentCatalog;
    const factionId = landable.factionId;
    const weighted = catalog.map((item) => ({
      item,
      weight: item.factionAffinity === factionId ? 3 : item.tier === 1 ? 2 : 1
    }));
    const prng = childPRNG(worldState.getWorldFile().metadata.seed, `store:${landable.id}`);
    return weighted
      .map((entry) => ({ ...entry, sort: entry.weight + prng.next() }))
      .sort((a, b) => b.sort - a.sort)
      .slice(0, count)
      .map((entry) => entry.item);
  }

  static getBuyPrice(item: EquipmentItem, worldState: WorldState, factionId: string | null): number {
    const tierMultiplier = EQUIPMENT_TIER_MULTIPLIERS[item.tier - 1] ?? 1.0;
    const basePrice = item.mass * EQUIPMENT_BASE_PRICE_PER_MASS * tierMultiplier;
    if (factionId && item.factionAffinity === factionId) {
      const rep = worldState.getReputationForFaction(factionId);
      const discount = rep >= 80 ? 0.85 : rep >= 40 ? 0.92 : 1.0;
      return Math.round(basePrice * discount);
    }
    return Math.round(basePrice);
  }

  static getSellPrice(item: EquipmentItem): number {
    const tierMultiplier = EQUIPMENT_TIER_MULTIPLIERS[item.tier - 1] ?? 1.0;
    const basePrice = item.mass * EQUIPMENT_BASE_PRICE_PER_MASS * tierMultiplier;
    return Math.round(basePrice * EQUIPMENT_SELL_FRACTION);
  }
}
