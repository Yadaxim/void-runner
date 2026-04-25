import { pointInCircle } from '../physics/collision';
import { Vector2 } from '../physics/vector2';
import type { WorldState } from '../core/worldState';
import type { Landable, ShipState, WeaponFireKey, WeaponItem } from '../types';
import { BulletEntity } from './bulletEntity';
import { ParticleSystem } from './particleSystem';
import type { ShipEntity } from './shipEntity';

const STACK_OFFSET_RAD = (3 * Math.PI) / 180;

function isWeaponItem(item: unknown): item is WeaponItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'type' in item &&
    (item as WeaponItem).type === 'weapon'
  );
}

export class WeaponSystem {
  private activeBullets: BulletEntity[] = [];

  constructor(private readonly particles: ParticleSystem) {}

  update(
    dt: number,
    shipState: ShipState,
    fireInputs: Record<WeaponFireKey, boolean>,
    worldState: WorldState,
    targetId: string | null
  ): void {
    for (const slot of shipState.weaponLoadout) {
      slot.cooldownRemaining = Math.max(0, slot.cooldownRemaining - dt);
    }

    for (const slot of shipState.weaponLoadout) {
      if (!fireInputs[slot.fireKey] || slot.cooldownRemaining > 0) {
        continue;
      }
      const item = worldState.getEquipmentItem(slot.itemId);
      if (!isWeaponItem(item)) {
        continue;
      }
      const bulletSpec = worldState.getBulletSpec(item.bulletSpecId);
      if (!bulletSpec) {
        continue;
      }

      for (let stackIndex = 0; stackIndex < slot.stackCount; stackIndex += 1) {
        const side = stackIndex % 2 === 0 ? 1 : -1;
        const pairIndex = Math.floor(stackIndex / 2) + 1;
        const offset = slot.stackCount > 1 ? side * pairIndex * STACK_OFFSET_RAD : 0;
        this.activeBullets.push(new BulletEntity(bulletSpec, shipState, offset, targetId));
      }
      slot.cooldownRemaining = item.fireRate > 0 ? 1 / item.fireRate : 0;
    }
  }

  updateBullets(
    dt: number,
    gravitySources: { position: Vector2; mass: number }[],
    ships: ShipEntity[],
    landables: Landable[]
  ): void {
    for (const bullet of this.activeBullets) {
      const targetId = bullet.instance.targetId ?? null;
      const targetShip = targetId ? ships.find((ship) => ship.state.id === targetId) ?? null : null;
      bullet.update(dt, gravitySources, targetShip);

      for (const ship of ships) {
        if (ship.state.id === bullet.instance.ownerId) {
          continue;
        }
        if (pointInCircle(bullet.getPosition(), ship.state.position as Vector2, 16)) {
          const nextHP = Math.max(0, ship.state.currentHP - this.getBulletDamage(bullet));
          ship.state = { ...ship.state, currentHP: nextHP };
          bullet.markHit();
          this.particles.spawnImpact(bullet.getPosition(), this.getBulletColour(bullet));
          break;
        }
      }
      if (bullet.isExpired()) {
        continue;
      }
      for (const landable of landables) {
        if (pointInCircle(bullet.getPosition(), landable.position as Vector2, landable.radius)) {
          bullet.markHit();
          this.particles.spawnImpact(bullet.getPosition(), this.getBulletColour(bullet));
          break;
        }
      }
    }
  }

  pruneExpired(): void {
    this.activeBullets = this.activeBullets.filter((bullet) => !bullet.isExpired());
  }

  getActiveBullets(): BulletEntity[] {
    return this.activeBullets;
  }

  private getBulletDamage(bullet: BulletEntity): number {
    return bullet.getSpec().damage;
  }

  private getBulletColour(bullet: BulletEntity): string {
    return bullet.getSpec().colour;
  }
}
