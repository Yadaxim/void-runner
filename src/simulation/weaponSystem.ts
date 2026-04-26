import {
  BULLET_MAX_IMPACT_DELTA_V,
  BULLET_MOMENTUM_TRANSFER_SCALE,
  HULL_DIMENSIONS,
  NPC_ALLY_ALERT_RANGE,
  REP_PENALTY_HIT,
  REP_PENALTY_KILL
} from '../constants';
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
  private playerDestroyed = false;

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
    worldState: WorldState,
    ships: ShipEntity[],
    _landables: Landable[]
  ): void {
    this.playerDestroyed = false;
    const player = ships.find((ship) => ship.state.id === 'player') ?? null;
    const otherNPCs = ships.filter((ship) => ship.state.id !== 'player');
    for (const bullet of this.activeBullets) {
      const targetId = bullet.instance.targetId ?? null;
      const targetShip = targetId ? ships.find((ship) => ship.state.id === targetId) ?? null : null;
      bullet.update(dt, gravitySources, targetShip);

      for (const ship of ships) {
        if (ship.state.id === bullet.instance.ownerId) {
          continue;
        }
        const hitRadius = this.getShipHitRadius(ship, worldState);
        if (pointInCircle(bullet.getPosition(), ship.state.position as Vector2, hitRadius)) {
          const attackerFactionId = this.getAttackerFactionId(bullet.instance.ownerId, player, otherNPCs);
          const npcController = ship.getNPCController();
          if (npcController && !ship.state.isPlayerControlled) {
            npcController.receiveAttack(
              bullet.instance.ownerId,
              attackerFactionId,
              this.getBulletDamage(bullet)
            );
            this.alertNearbyAllies(ship, bullet.instance.ownerId, attackerFactionId, otherNPCs);
          }

          const isPlayerAggressor = bullet.instance.ownerId === 'player' && !ship.state.isPlayerControlled;
          if (isPlayerAggressor && ship.state.factionId) {
            worldState.changeReputation(ship.state.factionId, REP_PENALTY_HIT);
            worldState.logRepEvent(ship.state.factionId, REP_PENALTY_HIT, 'Attacked ship');
          }
          ship.applyDamage(this.getBulletDamage(bullet), worldState);
          const nextHP = ship.state.currentHP;
          const nextVelocity = this.applyImpactMomentum(ship, bullet, worldState);
          if (nextVelocity) {
            ship.state = { ...ship.state, velocity: nextVelocity };
          }
          bullet.markHit();
          this.particles.spawnImpact(bullet.getPosition(), this.getBulletColour(bullet));
          if (nextHP <= 0) {
            ship.markDestroyed();
            if (isPlayerAggressor && ship.state.factionId) {
              worldState.changeReputation(ship.state.factionId, REP_PENALTY_KILL);
              worldState.logRepEvent(ship.state.factionId, REP_PENALTY_KILL, 'Destroyed ship');
            }
            if (ship.state.isPlayerControlled) {
              this.playerDestroyed = true;
            }
          }
          break;
        }
      }
      if (bullet.isExpired()) {
        continue;
      }
    }
  }

  pruneExpired(): void {
    this.activeBullets = this.activeBullets.filter((bullet) => !bullet.isExpired());
  }

  getActiveBullets(): BulletEntity[] {
    return this.activeBullets;
  }

  wasPlayerDestroyed(): boolean {
    return this.playerDestroyed;
  }

  private getBulletDamage(bullet: BulletEntity): number {
    return bullet.getSpec().damage;
  }

  private getBulletColour(bullet: BulletEntity): string {
    return bullet.getSpec().colour;
  }

  private getShipHitRadius(ship: ShipEntity, worldState: WorldState): number {
    const hullSpec = worldState.getHullSpec(ship.state.hullSpecId);
    if (!hullSpec) {
      return HULL_DIMENSIONS.fighter.length / 2;
    }
    return HULL_DIMENSIONS[hullSpec.hullClass].length / 2;
  }

  private applyImpactMomentum(
    ship: ShipEntity,
    bullet: BulletEntity,
    worldState: WorldState
  ): Vector2 | null {
    const hullSpec = worldState.getHullSpec(ship.state.hullSpecId);
    if (!hullSpec) {
      return null;
    }
    const bulletVelocity = bullet.instance.body.velocity as Vector2;
    const bulletSpeed = bulletVelocity.magnitude();
    if (bulletSpeed <= 0) {
      return null;
    }
    const bulletMass = Math.max(0.001, bullet.getSpec().mass);
    const shipMass = Math.max(1, hullSpec.hullMass);
    const bulletMomentum = bulletVelocity.scale(bulletMass * BULLET_MOMENTUM_TRANSFER_SCALE);
    let deltaV = bulletMomentum.scale(1 / shipMass);
    const deltaVMagnitude = deltaV.magnitude();
    if (deltaVMagnitude > BULLET_MAX_IMPACT_DELTA_V) {
      deltaV = deltaV.normalise().scale(BULLET_MAX_IMPACT_DELTA_V);
    }
    return (ship.state.velocity as Vector2).add(deltaV);
  }

  private getAttackerFactionId(ownerId: string, player: ShipEntity | null, otherNPCs: ShipEntity[]): string | null {
    if (ownerId === 'player') {
      return player?.state.factionId ?? null;
    }
    const attacker = otherNPCs.find((npc) => npc.state.id === ownerId);
    return attacker?.state.factionId ?? null;
  }

  private alertNearbyAllies(
    victim: ShipEntity,
    attackerId: string,
    attackerFactionId: string | null,
    otherNPCs: ShipEntity[]
  ): void {
    for (const ally of otherNPCs) {
      if (ally.state.id === victim.state.id) {
        continue;
      }
      if (ally.state.factionId !== victim.state.factionId) {
        continue;
      }
      const allyDistance = Vector2.distance(ally.state.position as Vector2, victim.state.position as Vector2);
      if (allyDistance > NPC_ALLY_ALERT_RANGE) {
        continue;
      }
      ally.getNPCController()?.receiveAttack(attackerId, attackerFactionId, 1);
    }
  }
}
