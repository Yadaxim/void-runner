import {
  NPC_ARRIVAL_SPEED_MAX,
  NPC_ARRIVAL_SPEED_MIN,
  NPC_EDGE_INSET,
  PLACEHOLDER_SHIP_MASS,
  SECTOR_HEIGHT,
  SECTOR_WIDTH
} from '../constants';
import { childPRNG } from '../core/prng';
import type { WorldState } from '../core/worldState';
import { computeGravity } from '../physics/gravity';
import { Vector2 } from '../physics/vector2';
import type { Landable, NPCSpawnRule, SectorMetadata, ShipState, WeaponFireKey, WeaponSlot } from '../types';
import { NPCController, type NPCState } from './npcController';
import { ParticleSystem } from './particleSystem';
import { ShipEntity } from './shipEntity';
import { WeaponSystem } from './weaponSystem';

function toNPCState(input: string): NPCState {
  if (input === 'transit' || input === 'trade' || input === 'hostile' || input === 'flee') {
    return input;
  }
  return 'patrol';
}

function buildLoadout(): WeaponSlot[] {
  return [{ fireKey: 'Z', itemId: 'pulse_cannon_t1', stackCount: 1, cooldownRemaining: 0 }];
}

export interface SpawnRuleState {
  rule: NPCSpawnRule;
  currentCount: number;
  nextArrivalIn: number;
}

export interface SpawnRuleDebugRow {
  factionId: string;
  behaviourType: NPCSpawnRule['behaviourType'];
  currentCount: number;
  maxPresent: number;
  nextArrivalIn: number;
}

type SectorEdge = 'north' | 'south' | 'east' | 'west';

export class SectorSimulation {
  private npcShips: ShipEntity[] = [];
  private readonly playerShip: ShipEntity;
  private readonly landables: Landable[];
  private readonly weaponSystem: WeaponSystem;
  private readonly particleSystem: ParticleSystem;
  private readonly prng;
  private shipCounter = 0;
  private spawnRuleStates: SpawnRuleState[] = [];

  constructor(
    private readonly sector: SectorMetadata,
    playerShip: ShipEntity,
    private readonly worldState: WorldState,
    seed: number
  ) {
    this.playerShip = playerShip;
    this.landables = sector.landables;
    this.particleSystem = new ParticleSystem();
    this.weaponSystem = new WeaponSystem(this.particleSystem);
    this.prng = childPRNG(seed, `sector_sim_${sector.coord.x}_${sector.coord.y}`);
    this.spawnRuleStates = sector.npcSpawnRules.map((rule) => ({
      rule,
      currentCount: 0,
      nextArrivalIn: this.randomRange(rule.arrivalIntervalRange[0], rule.arrivalIntervalRange[1])
    }));
  }

  spawnNPCs(): void {
    this.npcShips = [];
    for (const ruleState of this.spawnRuleStates) {
      const count = this.prng.nextInt(ruleState.rule.countRange[0], ruleState.rule.countRange[1]);
      const toSpawn = Math.min(count, ruleState.rule.maxPresent);
      for (let i = 0; i < toSpawn; i += 1) {
        this.spawnInterior(ruleState);
      }
    }
  }

  respawnNPCs(): void {
    for (const npc of this.npcShips) {
      if (npc.spawnRuleStateRef) {
        npc.spawnRuleStateRef.currentCount = Math.max(0, npc.spawnRuleStateRef.currentCount - 1);
      }
    }
    this.npcShips = [];

    for (const ruleState of this.spawnRuleStates) {
      ruleState.currentCount = 0;
    }

    for (const ruleState of this.spawnRuleStates) {
      const count = this.prng.nextInt(ruleState.rule.countRange[0], ruleState.rule.countRange[1]);
      const toSpawn = Math.min(count, ruleState.rule.maxPresent);
      for (let i = 0; i < toSpawn; i += 1) {
        this.spawnArrival(ruleState);
      }
    }
  }

  update(dt: number): void {
    for (const ruleState of this.spawnRuleStates) {
      ruleState.nextArrivalIn -= dt;
      if (ruleState.nextArrivalIn <= 0) {
        if (ruleState.currentCount < ruleState.rule.maxPresent) {
          this.spawnArrival(ruleState);
        }
        ruleState.nextArrivalIn = this.randomRange(
          ruleState.rule.arrivalIntervalRange[0],
          ruleState.rule.arrivalIntervalRange[1]
        );
      }
    }

    for (const ship of this.npcShips) {
      const gravity = computeGravity(
        ship.state.position as Vector2,
        PLACEHOLDER_SHIP_MASS,
        this.landables.map((landable) => ({
          position: landable.position as Vector2,
          mass: landable.mass,
          radius: landable.radius
        }))
      );
      ship.applyExternalForce(gravity);
      const inputs = ship.update(dt, undefined, {
        player: this.playerShip,
        otherNPCs: this.npcShips.filter((candidate) => candidate.state.id !== ship.state.id),
        landables: this.landables,
        worldState: this.worldState
      });
      const fireInputs: Record<WeaponFireKey, boolean> = {
        Z: inputs?.fireZ ?? false,
        X: inputs?.fireX ?? false,
        C: inputs?.fireC ?? false,
        V: inputs?.fireV ?? false,
        B: inputs?.fireB ?? false
      };
      const targetId = ship.getNPCController()?.getAggroTargetId() ?? 'player';
      this.weaponSystem.update(dt, ship.state, fireInputs, this.worldState, targetId);
    }

    this.weaponSystem.updateBullets(
      dt,
      this.landables.filter((landable) => landable.mass > 0).map((landable) => ({
        position: landable.position as Vector2,
        mass: landable.mass
      })),
      this.worldState,
      [this.playerShip, ...this.npcShips],
      this.landables
    );
    this.weaponSystem.pruneExpired();
    this.particleSystem.update(dt);

    this.npcShips = this.npcShips.filter((npc) => {
      if (npc.isDestroyed()) {
        const colour = this.worldState.getFactionVisual(npc.state.factionId ?? '').primaryColour;
        this.particleSystem.spawnExplosion(npc.state.position as Vector2, colour);
        if (npc.spawnRuleStateRef) {
          npc.spawnRuleStateRef.currentCount = Math.max(0, npc.spawnRuleStateRef.currentCount - 1);
        }
        return false;
      }
      if (this.isOutsideBounds(npc.state.position as Vector2)) {
        if (npc.spawnRuleStateRef) {
          npc.spawnRuleStateRef.currentCount = Math.max(0, npc.spawnRuleStateRef.currentCount - 1);
        }
        return false;
      }
      return true;
    });
  }

  getNPCShips(): ShipEntity[] {
    return this.npcShips;
  }

  getWeaponSystem(): WeaponSystem {
    return this.weaponSystem;
  }

  getParticleSystem(): ParticleSystem {
    return this.particleSystem;
  }

  getSpawnRuleDebugRows(): SpawnRuleDebugRow[] {
    return this.spawnRuleStates.map((state) => ({
      factionId: state.rule.factionId,
      behaviourType: state.rule.behaviourType,
      currentCount: state.currentCount,
      maxPresent: state.rule.maxPresent,
      nextArrivalIn: Math.max(0, state.nextArrivalIn)
    }));
  }

  dispose(): void {
    this.npcShips = [];
  }

  private spawnInterior(ruleState: SpawnRuleState): void {
    if (ruleState.currentCount >= ruleState.rule.maxPresent) {
      return;
    }
    const hw = SECTOR_WIDTH / 2 - 100;
    const hh = SECTOR_HEIGHT / 2 - 100;
    const pos = new Vector2((this.prng.next() - 0.5) * hw * 2, (this.prng.next() - 0.5) * hh * 2);
    const speed = this.randomRange(NPC_ARRIVAL_SPEED_MIN, NPC_ARRIVAL_SPEED_MAX);
    const angle = this.prng.next() * Math.PI * 2;
    const vel = Vector2.fromAngle(angle).scale(speed);
    const npc = this.buildNPC(ruleState.rule, pos, vel);
    npc.spawnRuleStateRef = ruleState;
    ruleState.currentCount += 1;
    this.npcShips.push(npc);
  }

  private spawnArrival(ruleState: SpawnRuleState): void {
    if (ruleState.currentCount >= ruleState.rule.maxPresent) {
      return;
    }
    const edge: SectorEdge = ['north', 'south', 'east', 'west'][this.prng.nextInt(0, 3)] as SectorEdge;
    const hw = SECTOR_WIDTH / 2 - NPC_EDGE_INSET;
    const hh = SECTOR_HEIGHT / 2 - NPC_EDGE_INSET;
    const speed = this.randomRange(NPC_ARRIVAL_SPEED_MIN, NPC_ARRIVAL_SPEED_MAX);

    let spawnPos: Vector2;
    let initialVelocity: Vector2;

    if (edge === 'north') {
      spawnPos = new Vector2((this.prng.next() - 0.5) * SECTOR_WIDTH * 0.8, -hh);
      initialVelocity = new Vector2((this.prng.next() - 0.5) * 0.3, 1).normalise().scale(speed);
    } else if (edge === 'south') {
      spawnPos = new Vector2((this.prng.next() - 0.5) * SECTOR_WIDTH * 0.8, hh);
      initialVelocity = new Vector2((this.prng.next() - 0.5) * 0.3, -1).normalise().scale(speed);
    } else if (edge === 'east') {
      spawnPos = new Vector2(hw, (this.prng.next() - 0.5) * SECTOR_HEIGHT * 0.8);
      initialVelocity = new Vector2(-1, (this.prng.next() - 0.5) * 0.3).normalise().scale(speed);
    } else {
      spawnPos = new Vector2(-hw, (this.prng.next() - 0.5) * SECTOR_HEIGHT * 0.8);
      initialVelocity = new Vector2(1, (this.prng.next() - 0.5) * 0.3).normalise().scale(speed);
    }

    const npc = this.buildNPC(ruleState.rule, spawnPos, initialVelocity);
    npc.spawnRuleStateRef = ruleState;
    ruleState.currentCount += 1;
    this.npcShips.push(npc);
  }

  private buildNPC(rule: NPCSpawnRule, position: Vector2, velocity: Vector2): ShipEntity {
    const hullSpecId = rule.factionId === 'federation' ? 'courier_mk1' : 'fighter_raider_mk1';
    const hullSpec = this.worldState.getHullSpec(hullSpecId);
    const maxHP = hullSpec?.baseHP ?? 100;
    const id = `npc_${this.sector.coord.x}_${this.sector.coord.y}_${rule.factionId}_${this.shipCounter++}`;
    const shipState: ShipState = {
      ...this.playerShip.state,
      id,
      hullSpecId,
      factionId: rule.factionId,
      position,
      velocity,
      angle: this.prng.next() * Math.PI * 2,
      angularVelocity: 0,
      currentHP: maxHP,
      maxHP,
      equipmentSlots: [],
      autoBrakeLinearEnabled: true,
      autoBrakeRotationEnabled: true,
      weaponLoadout: (hullSpec?.defaultWeaponLoadout ?? buildLoadout()).map((slot) => ({ ...slot })),
      isPlayerControlled: false,
      fleetRole: 'escort'
    };
    const ship = new ShipEntity(shipState);
    const initialState = toNPCState(rule.behaviourType);
    ship.attachNPCController(new NPCController(initialState, this.sector.seed + this.shipCounter, rule.factionId), initialState);
    return ship;
  }

  private randomRange(min: number, max: number): number {
    return min + this.prng.next() * (max - min);
  }

  private isOutsideBounds(pos: Vector2): boolean {
    return (
      pos.x < -(SECTOR_WIDTH / 2) ||
      pos.x > SECTOR_WIDTH / 2 ||
      pos.y < -(SECTOR_HEIGHT / 2) ||
      pos.y > SECTOR_HEIGHT / 2
    );
  }
}
