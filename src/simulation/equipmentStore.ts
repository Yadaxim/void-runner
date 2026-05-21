import { EQUIPMENT_SELL_FRACTION, EQUIPMENT_STORE_COUNT } from '../constants';
import { childPRNG } from '../core/prng';
import type { WorldState } from '../core/worldState';
import { getLandablePrimaryFactionId, type EquipmentItem, type Landable } from '../types';

export class EquipmentStore {
  static generateInventory(
    landable: Landable,
    worldState: WorldState,
    count: number = EQUIPMENT_STORE_COUNT
  ): EquipmentItem[] {
    const catalog = worldState.getWorldFile().equipmentCatalog;
    const factionId = getLandablePrimaryFactionId(landable);
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

  static getBuyPrice(
    item: EquipmentItem,
    worldState: WorldState,
    factionId: string | null,
    priceMultiplier: number = 1
  ): number {
    const basePrice = item.price;
    let price = basePrice;
    if (factionId && item.factionAffinity === factionId) {
      const rep = worldState.getReputationForFaction(factionId);
      const discount = rep >= 80 ? 0.85 : rep >= 40 ? 0.92 : 1.0;
      price = basePrice * discount;
    }
    return Math.round(price * priceMultiplier);
  }

  static getBuyPriceAtLandable(item: EquipmentItem, worldState: WorldState, landable: Landable): number {
    return EquipmentStore.getBuyPrice(
      item,
      worldState,
      getLandablePrimaryFactionId(landable),
      worldState.getLandablePriceMultiplier(landable)
    );
  }

  static getSellPrice(item: EquipmentItem): number {
    return Math.round(item.price * EQUIPMENT_SELL_FRACTION);
  }
}
