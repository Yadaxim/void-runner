// extracted from src/screens/flightScreen.ts for testability
import type { WorldState } from '../core/worldState';
import type { ReactorItem, ShieldItem, ShipState } from '../types';

/**
 * Advances reactor charge, shield reboot countdown, and shield HP regen for the player ship.
 * Mutates `ship` in place. `nowMs` should match `Date.now()` semantics (shield regen uses hit cooldown vs wall clock).
 */
export function tickPlayerEnergyAndShield(ship: ShipState, worldState: WorldState, dt: number, nowMs: number): boolean {
  let updated = false;

  const reactorSlot = ship.equipmentSlots.find((s) => s.slotType === 'reactor');
  if (reactorSlot?.itemId) {
    const reactorItem = worldState.getEquipmentItem(reactorSlot.itemId);
    if (reactorItem?.type === 'reactor') {
      const reactor = reactorItem as ReactorItem;
      const maxJoules = reactor.capacityJoules;
      if (ship.currentJoules < maxJoules && ship.fuel > 0) {
        const needed = maxJoules - ship.currentJoules;
        const generated = Math.min(reactor.chargeRateJoulesPerSecond * dt, needed);
        const fuelCost = generated * reactor.fuelPerJoule;
        if (ship.fuel >= fuelCost) {
          ship.currentJoules = Math.min(maxJoules, ship.currentJoules + generated);
          ship.fuel = Math.max(0, ship.fuel - fuelCost);
          updated = true;
        }
      }
    }
  } else if (ship.currentJoules > 0) {
    ship.currentJoules = 0;
    updated = true;
  }

  if (ship.shieldRebooting) {
    ship.shieldRebootTimer = Math.max(0, ship.shieldRebootTimer - dt);
    if (ship.shieldRebootTimer <= 0) {
      ship.shieldRebooting = false;
    }
    updated = true;
  }

  const shieldSlot = ship.equipmentSlots.find((s) => s.slotType === 'shield');
  if (shieldSlot?.itemId && worldState.isShieldOnline()) {
    const shieldItem = worldState.getEquipmentItem(shieldSlot.itemId);
    if (shieldItem?.type === 'shield') {
      const shield = shieldItem as ShieldItem;
      ship.maxShieldHP = shield.shieldHP;
      const timeSinceHit = (nowMs - ship.lastHitTime) / 1000;
      if (
        !ship.shieldRebooting &&
        timeSinceHit >= shield.regenDelay &&
        ship.currentShieldHP < shield.shieldHP &&
        ship.currentJoules > 0
      ) {
        const hpNeeded = shield.shieldHP - ship.currentShieldHP;
        const hpToRegen = Math.min(shield.regenRateHPPerSecond * dt, hpNeeded);
        const jouleCost = hpToRegen * shield.joulesPerHPRegen;
        if (ship.currentJoules >= jouleCost) {
          ship.currentShieldHP = Math.min(shield.shieldHP, ship.currentShieldHP + hpToRegen);
          ship.currentJoules = Math.max(0, ship.currentJoules - jouleCost);
          updated = true;
        }
      }
    }
  } else if (ship.currentShieldHP > ship.maxShieldHP) {
    ship.currentShieldHP = ship.maxShieldHP;
    updated = true;
  }

  return updated;
}
