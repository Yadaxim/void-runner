// extracted from src/simulation/weaponSystem.ts for testability
import type { BulletSpec, EquipmentItem, ShieldItem, ShipState } from '../types';
import { getDamageTypeKey } from '../types';

export interface BulletDamageResult {
  effectiveDamage: number;
  totalReduction: number;
}

export interface ShipDamageWorldView {
  isShieldOnline(ship: ShipState): boolean;
  getEquipmentItem(id: string): EquipmentItem | null;
}

/**
 * Instant bullet resolution: shield (if online and HP), then first armour layer with HP, then hull.
 * Mutates `ship` in place. Used for player and NPC ships.
 */
export function resolveShipBulletDamage(
  bulletSpec: BulletSpec,
  ship: ShipState,
  world: ShipDamageWorldView
): BulletDamageResult {
  const typeKey = getDamageTypeKey(bulletSpec.damageCategory, bulletSpec.matterType);
  const damage = bulletSpec.damage;

  if (world.isShieldOnline(ship) && ship.currentShieldHP > 0) {
    const absorbed = Math.min(damage, ship.currentShieldHP);
    ship.currentShieldHP -= absorbed;
    if (ship.currentShieldHP <= 0) {
      const shieldSlot = ship.equipmentSlots.find((s) => s.slotType === 'shield');
      const raw = shieldSlot?.itemId ? world.getEquipmentItem(shieldSlot.itemId) : null;
      const shieldItem = raw?.type === 'shield' ? (raw as ShieldItem) : null;
      ship.shieldRebooting = true;
      ship.shieldRebootTimer = shieldItem?.rebootTime ?? 12;
    }
    ship.lastHitTime = Date.now();
    return { effectiveDamage: absorbed, totalReduction: 0 };
  }

  for (const layer of ship.armourLayers) {
    if (layer.currentHP <= 0) continue;
    const armourItem = world.getEquipmentItem(layer.itemId);
    const reduction = armourItem?.type === 'armour' ? armourItem.reductions[typeKey] ?? 0 : 0;
    const effectiveDamage = Math.max(0, damage - reduction);
    const absorbed = Math.min(effectiveDamage, layer.currentHP);
    layer.currentHP -= absorbed;
    ship.lastHitTime = Date.now();
    return { effectiveDamage: absorbed, totalReduction: reduction };
  }

  ship.currentHullHP = Math.max(0, ship.currentHullHP - damage);
  ship.lastHitTime = Date.now();
  return { effectiveDamage: damage, totalReduction: 0 };
}

/** Plasma DoT: outermost armour with HP, else hull (does not go through shield). Mutates `state`. */
export function applyPlasmaDotToShip(
  state: ShipState,
  damage: number,
  getEquipmentItem: (id: string) => EquipmentItem | null
): void {
  for (const layer of state.armourLayers) {
    if (layer.currentHP <= 0) continue;
    const armourItem = getEquipmentItem(layer.itemId);
    const reduction = armourItem?.type === 'armour' ? armourItem.reductions.plasma ?? 0 : 0;
    const effectiveDamage = Math.max(0, damage - reduction);
    const absorbed = Math.min(effectiveDamage, layer.currentHP);
    layer.currentHP -= absorbed;
    return;
  }
  state.currentHullHP = Math.max(0, state.currentHullHP - damage);
}
