// extracted from src/simulation/weaponSystem.ts for testability
import type { BulletSpec, EquipmentItem, MatterType, ShieldItem, ShipState } from '../types';

export interface BulletDamageResult {
  effectiveDamage: number;
  totalReduction: number;
}

export interface ShipDamageWorldView {
  isShieldOnline(ship: ShipState): boolean;
  getEquipmentItem(id: string): EquipmentItem | null;
}

function armourReductionForMatter(
  armourItem: EquipmentItem | null,
  matterType: MatterType
): number {
  if (armourItem?.type !== 'armour') return 0;
  return armourItem.reductions[matterType] ?? 0;
}

/**
 * Instant damage: shield (if online and HP), then first armour layer with HP, then hull (no reduction).
 */
export function resolveShipDamage(
  damage: number,
  matterType: MatterType,
  ship: ShipState,
  world: ShipDamageWorldView
): BulletDamageResult {
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
    const reduction = armourReductionForMatter(armourItem, matterType);
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

/** DoT tick: outermost armour with HP, else hull. Does not go through shield. */
export function applyMatterDotToShip(
  state: ShipState,
  damage: number,
  matterType: MatterType,
  getEquipmentItem: (id: string) => EquipmentItem | null
): void {
  for (const layer of state.armourLayers) {
    if (layer.currentHP <= 0) continue;
    const armourItem = getEquipmentItem(layer.itemId);
    const reduction = armourReductionForMatter(armourItem, matterType);
    const effectiveDamage = Math.max(0, damage - reduction);
    const absorbed = Math.min(effectiveDamage, layer.currentHP);
    layer.currentHP -= absorbed;
    return;
  }
  state.currentHullHP = Math.max(0, state.currentHullHP - damage);
}

/** Direct impact damage from a bullet spec. */
export function resolveShipBulletDamage(
  bulletSpec: BulletSpec,
  ship: ShipState,
  world: ShipDamageWorldView
): BulletDamageResult {
  return resolveShipDamage(bulletSpec.damage, bulletSpec.matterType, ship, world);
}

