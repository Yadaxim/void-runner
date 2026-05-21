import {
  BULLET_MAX_IMPACT_DELTA_V,
  BULLET_MOMENTUM_TRANSFER_SCALE,
  COLOURS,
  HULL_DIMENSIONS,
  hullLengthForHullClass,
  NPC_ALLY_ALERT_RANGE,
  REP_PENALTY_HIT,
  REP_PENALTY_KILL
} from '../constants';
import { pointInCircle } from '../physics/collision';
import { Vector2 } from '../physics/vector2';
import type { WorldState } from '../core/worldState';
import {
  computeSplashDamage,
  getBulletExplosiveAbility,
  getBulletKnockbackScale,
  mergeDotAbilities,
  type BulletSpec,
  type Landable,
  type MatterType,
  type ShipState,
  type WeaponFireKey,
  type WeaponItem
} from '../types';
import { resolveShipBulletDamage, resolveShipDamage, applyMatterDotToShip } from '../combat/damage';
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

export interface BurnEffect {
  targetId: string;
  matterType: MatterType;
  damagePerSecond: number;
  remainingDuration: number;
  totalDuration: number;
}

interface BulletDamageResult {
  effectiveDamage: number;
  totalReduction: number;
}

export class WeaponSystem {
  private activeBullets: BulletEntity[] = [];
  private activeBurns: BurnEffect[] = [];
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
        const ownerHull = worldState.getHullSpec(shipState.hullSpecId);
        const muzzleLen = hullLengthForHullClass(ownerHull?.hullClass);
        this.activeBullets.push(new BulletEntity(bulletSpec, shipState, offset, targetId, muzzleLen));
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

      let impacted = false;
      for (const ship of ships) {
        if (ship.state.id === bullet.instance.ownerId) {
          continue;
        }
        const hitRadius = this.getShipHitRadius(ship, worldState);
        if (pointInCircle(bullet.getPosition(), ship.state.position as Vector2, hitRadius)) {
          this.processDirectImpact(bullet, ship, worldState, player, otherNPCs);
          impacted = true;
          break;
        }
      }

      if (impacted) {
        const spec = bullet.getSpec();
        const explosive = getBulletExplosiveAbility(spec);
        if (explosive) {
          this.processExplosiveSplash(
            bullet.getPosition(),
            bullet.instance.ownerId,
            spec,
            explosive,
            ships,
            worldState,
            player,
            otherNPCs
          );
        }
        bullet.markHit();
      }

      if (bullet.isExpired()) {
        continue;
      }
    }

    this.activeBurns = this.activeBurns.filter((burn) => {
      const target = ships.find((ship) => ship.state.id === burn.targetId);
      if (!target || target.isDestroyed()) {
        return false;
      }
      burn.remainingDuration -= dt;
      this.applyBurnDamage(target.state, burn.damagePerSecond, burn.matterType, dt, worldState);
      if (target.state.currentHullHP <= 0) {
        target.markDestroyed();
        if (target.state.isPlayerControlled) {
          this.playerDestroyed = true;
        }
      }
      return burn.remainingDuration > 0;
    });
  }

  pruneExpired(): void {
    this.activeBullets = this.activeBullets.filter((bullet) => !bullet.isExpired());
  }

  getActiveBullets(): BulletEntity[] {
    return this.activeBullets;
  }

  getActiveBurns(): BurnEffect[] {
    return this.activeBurns;
  }

  wasPlayerDestroyed(): boolean {
    return this.playerDestroyed;
  }

  private processDirectImpact(
    bullet: BulletEntity,
    ship: ShipEntity,
    worldState: WorldState,
    player: ShipEntity | null,
    otherNPCs: ShipEntity[]
  ): void {
    const spec = bullet.getSpec();
    const attackerFactionId = this.getAttackerFactionId(bullet.instance.ownerId, player, otherNPCs);
    const npcController = ship.getNPCController();
    if (npcController && !ship.state.isPlayerControlled) {
      npcController.receiveAttack(bullet.instance.ownerId, attackerFactionId, spec.damage);
      this.alertNearbyAllies(ship, bullet.instance.ownerId, attackerFactionId, otherNPCs);
    }

    const isPlayerAggressor = bullet.instance.ownerId === 'player' && !ship.state.isPlayerControlled;
    if (isPlayerAggressor && ship.state.factionId) {
      worldState.changeReputation(ship.state.factionId, REP_PENALTY_HIT, 'combat_hit');
    }

    const damageResult = this.applyBulletDamage(spec, ship, worldState);
    this.tryApplyDotBurn(spec, ship);
    const nextHP = ship.state.currentHullHP;
    const nextVelocity = this.applyImpactMomentum(ship, bullet, worldState);
    if (nextVelocity) {
      ship.state = { ...ship.state, velocity: nextVelocity };
    }
    this.particles.spawnImpact(
      bullet.getPosition(),
      this.getImpactColour(spec.colour, damageResult)
    );
    if (nextHP <= 0) {
      ship.markDestroyed();
      if (isPlayerAggressor) {
        worldState.recordNpcKillByPlayer();
        if (ship.state.factionId) {
          worldState.changeReputation(ship.state.factionId, REP_PENALTY_KILL, 'combat_kill');
        }
      }
      if (ship.state.isPlayerControlled) {
        this.playerDestroyed = true;
      }
    }
  }

  private processExplosiveSplash(
    center: Vector2,
    ownerId: string,
    spec: BulletSpec,
    explosive: NonNullable<ReturnType<typeof getBulletExplosiveAbility>>,
    ships: ShipEntity[],
    worldState: WorldState,
    player: ShipEntity | null,
    otherNPCs: ShipEntity[]
  ): void {
    const falloffExponent = explosive.falloffExponent ?? 1;
    const dotParams = mergeDotAbilities(spec);
    const attackerFactionId = this.getAttackerFactionId(ownerId, player, otherNPCs);

    for (const ship of ships) {
      if (ship.isDestroyed()) {
        continue;
      }
      const distance = Vector2.distance(center, ship.state.position as Vector2);
      const splashAmount = computeSplashDamage(
        explosive.splashDamage,
        distance,
        explosive.radius,
        falloffExponent
      );
      if (splashAmount <= 0) {
        continue;
      }

      const npcController = ship.getNPCController();
      if (npcController && !ship.state.isPlayerControlled) {
        npcController.receiveAttack(ownerId, attackerFactionId, splashAmount);
      }

      this.applyDamageAmount(spec.matterType, splashAmount, ship, worldState, ship.state.isPlayerControlled);
      if (dotParams) {
        this.applyDotBurnToShip(ship, spec.matterType, dotParams.damagePerSecond, dotParams.duration);
      }

      if (ship.state.currentHullHP <= 0) {
        ship.markDestroyed();
        const killedNpc = !ship.state.isPlayerControlled;
        if (ownerId === 'player' && killedNpc) {
          worldState.recordNpcKillByPlayer();
        }
        if (ship.state.isPlayerControlled) {
          this.playerDestroyed = true;
        }
      }
    }
  }

  private applyBulletDamage(
    bulletSpec: BulletSpec,
    target: ShipEntity,
    worldState: WorldState
  ): BulletDamageResult {
    return this.applyDamageAmount(bulletSpec.matterType, bulletSpec.damage, target, worldState, true);
  }

  private applyDamageAmount(
    matterType: MatterType,
    damage: number,
    target: ShipEntity,
    worldState: WorldState,
    syncPlayer: boolean
  ): BulletDamageResult {
    const ship = target.state;
    const view = {
      isShieldOnline: (s: ShipState) => worldState.isShieldOnlineForShip(s),
      getEquipmentItem: (id: string) => worldState.getEquipmentItem(id)
    };
    const result = resolveShipDamage(damage, matterType, ship, view);
    if (syncPlayer && ship.isPlayerControlled) {
      worldState.updatePlayerShipState(ship);
    }
    return result;
  }

  private applyBurnDamage(
    targetState: ShipState,
    damagePerSecond: number,
    matterType: MatterType,
    dt: number,
    worldState: WorldState
  ): void {
    const damage = damagePerSecond * dt;
    applyMatterDotToShip(targetState, damage, matterType, (id) => worldState.getEquipmentItem(id));
  }

  private tryApplyDotBurn(bulletSpec: BulletSpec, target: ShipEntity): void {
    const dot = mergeDotAbilities(bulletSpec);
    if (!dot || target.state.currentHullHP <= 0) {
      return;
    }
    this.applyDotBurnToShip(target, bulletSpec.matterType, dot.damagePerSecond, dot.duration);
  }

  private applyDotBurnToShip(
    target: ShipEntity,
    matterType: MatterType,
    damagePerSecond: number,
    duration: number
  ): void {
    if (target.state.currentHullHP <= 0) {
      return;
    }
    const existing = this.activeBurns.find((burn) => burn.targetId === target.state.id);
    if (existing) {
      existing.remainingDuration = Math.max(existing.remainingDuration, duration);
      existing.damagePerSecond = Math.max(existing.damagePerSecond, damagePerSecond);
      existing.totalDuration = Math.max(existing.totalDuration, duration);
      existing.matterType = matterType;
      return;
    }
    this.activeBurns.push({
      targetId: target.state.id,
      matterType,
      damagePerSecond,
      remainingDuration: duration,
      totalDuration: duration
    });
  }

  private getImpactColour(baseColour: string, damageResult: BulletDamageResult): string {
    if (damageResult.totalReduction < 0) {
      return COLOURS.DANGER;
    }
    if (damageResult.totalReduction > 0) {
      if (damageResult.effectiveDamage <= 0) {
        return COLOURS.UI_ACCENT;
      }
      return COLOURS.SAFE;
    }
    return baseColour;
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
    const knockbackScale = getBulletKnockbackScale(bullet.getSpec());
    if (knockbackScale === null) {
      return null;
    }
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
    const bulletMomentum = bulletVelocity.scale(
      bulletMass * BULLET_MOMENTUM_TRANSFER_SCALE * knockbackScale
    );
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
      if (attackerFactionId !== null && attackerFactionId === ally.state.factionId) {
        continue;
      }
      ally.getNPCController()?.receiveAttack(attackerId, attackerFactionId, 1);
    }
  }
}
