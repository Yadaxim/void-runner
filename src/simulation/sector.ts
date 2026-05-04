import {
  NPC_ARRIVAL_SPEED_MAX,
  NPC_ARRIVAL_SPEED_MIN,
  NPC_EDGE_INSET,
  SECTOR_SIZE
} from '../constants';
import { childPRNG } from '../core/prng';
import type { WorldState } from '../core/worldState';
import { tickShipEnergyAndShield } from '../sim/shipEnergyShield';
import { computeGravity } from '../physics/gravity';
import { Vector2 } from '../physics/vector2';
import type { Landable, NPCSpawnRule, SectorMetadata, ShipState } from '../types';
import { emptyWeaponFireInputs } from './shipControlFrame';
import { NPCController, type NPCState } from './npcController';
import { ParticleSystem } from './particleSystem';
import { ShipEntity } from './shipEntity';
import { WeaponSystem } from './weaponSystem';

function toNPCState(input: string): NPCState {
  if (input === 'transit' || input === 'trade' || input === 'hostile' || input === 'flee') {
    return input;
  }
  if (input === 'escort') {
    return 'patrol';
  }
  return 'patrol';
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

  private getRuleMinPresent(rule: NPCSpawnRule): number {
    return Number.isFinite(rule.minPresent) ? Math.max(0, Math.floor(rule.minPresent)) : 0;
  }

  private getRuleMaxPresent(rule: NPCSpawnRule): number {
    return Number.isFinite(rule.maxPresent) ? Math.max(0, Math.floor(rule.maxPresent)) : 0;
  }

  private getRuleCountRange(rule: NPCSpawnRule): [number, number] {
    const rawMin = Number.isFinite(rule.countRange[0]) ? Math.floor(rule.countRange[0]) : 0;
    const rawMax = Number.isFinite(rule.countRange[1]) ? Math.floor(rule.countRange[1]) : rawMin;
    return rawMin <= rawMax ? [rawMin, rawMax] : [rawMax, rawMin];
  }

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
      const [countMin, countMax] = this.getRuleCountRange(ruleState.rule);
      const minPresent = this.getRuleMinPresent(ruleState.rule);
      const maxPresent = this.getRuleMaxPresent(ruleState.rule);
      const count = this.prng.nextInt(countMin, countMax);
      const toSpawn = Math.min(Math.max(count, minPresent), maxPresent);
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
      const [countMin, countMax] = this.getRuleCountRange(ruleState.rule);
      const minPresent = this.getRuleMinPresent(ruleState.rule);
      const maxPresent = this.getRuleMaxPresent(ruleState.rule);
      const count = this.prng.nextInt(countMin, countMax);
      const toSpawn = Math.min(Math.max(count, minPresent), maxPresent);
      for (let i = 0; i < toSpawn; i += 1) {
        this.spawnArrival(ruleState);
      }
    }
  }

  update(dt: number): void {
    for (const ruleState of this.spawnRuleStates) {
      ruleState.nextArrivalIn -= dt;
      if (ruleState.nextArrivalIn <= 0) {
        if (ruleState.currentCount < this.getRuleMaxPresent(ruleState.rule)) {
          this.spawnArrival(ruleState);
        }
        ruleState.nextArrivalIn = this.randomRange(
          ruleState.rule.arrivalIntervalRange[0],
          ruleState.rule.arrivalIntervalRange[1]
        );
      }
      if (ruleState.currentCount < this.getRuleMinPresent(ruleState.rule)) {
        this.spawnArrival(ruleState);
      }
    }

    for (const ship of this.npcShips) {
      const shipMass = ship.getEffectiveMass(this.worldState);
      const gravity = computeGravity(
        ship.state.position as Vector2,
        shipMass,
        this.landables.map((landable) => ({
          position: landable.position as Vector2,
          mass: landable.mass,
          radius: landable.radius
        }))
      );
      ship.applyExternalForce(gravity);
      const controlFrame = ship.update(dt, this.worldState, undefined, {
        player: this.playerShip,
        otherNPCs: this.npcShips.filter((candidate) => candidate.state.id !== ship.state.id),
        landables: this.landables
      });
      const fireInputs = controlFrame?.weapons ?? emptyWeaponFireInputs();
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

    const nowMs = Date.now();
    tickShipEnergyAndShield(this.playerShip.state, this.worldState, dt, nowMs);
    for (const npc of this.npcShips) {
      tickShipEnergyAndShield(npc.state, this.worldState, dt, nowMs);
    }

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
    if (ruleState.currentCount >= this.getRuleMaxPresent(ruleState.rule)) {
      return;
    }
    const hw = SECTOR_SIZE / 2 - 100;
    const hh = SECTOR_SIZE / 2 - 100;
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
    if (ruleState.currentCount >= this.getRuleMaxPresent(ruleState.rule)) {
      return;
    }
    const edge: SectorEdge = ['north', 'south', 'east', 'west'][this.prng.nextInt(0, 3)] as SectorEdge;
    const hw = SECTOR_SIZE / 2 - NPC_EDGE_INSET;
    const hh = SECTOR_SIZE / 2 - NPC_EDGE_INSET;
    const speed = this.randomRange(NPC_ARRIVAL_SPEED_MIN, NPC_ARRIVAL_SPEED_MAX);

    let spawnPos: Vector2;
    let initialVelocity: Vector2;

    if (edge === 'north') {
      spawnPos = new Vector2((this.prng.next() - 0.5) * SECTOR_SIZE * 0.8, -hh);
      initialVelocity = new Vector2((this.prng.next() - 0.5) * 0.3, 1).normalise().scale(speed);
    } else if (edge === 'south') {
      spawnPos = new Vector2((this.prng.next() - 0.5) * SECTOR_SIZE * 0.8, hh);
      initialVelocity = new Vector2((this.prng.next() - 0.5) * 0.3, -1).normalise().scale(speed);
    } else if (edge === 'east') {
      spawnPos = new Vector2(hw, (this.prng.next() - 0.5) * SECTOR_SIZE * 0.8);
      initialVelocity = new Vector2(-1, (this.prng.next() - 0.5) * 0.3).normalise().scale(speed);
    } else {
      spawnPos = new Vector2(-hw, (this.prng.next() - 0.5) * SECTOR_SIZE * 0.8);
      initialVelocity = new Vector2(1, (this.prng.next() - 0.5) * 0.3).normalise().scale(speed);
    }

    const npc = this.buildNPC(ruleState.rule, spawnPos, initialVelocity);
    npc.spawnRuleStateRef = ruleState;
    ruleState.currentCount += 1;
    this.npcShips.push(npc);
  }

  private buildNPC(rule: NPCSpawnRule, position: Vector2, velocity: Vector2): ShipEntity {
    const hullSpecId = typeof rule.hullSpecId === 'string' ? rule.hullSpecId.trim() : '';
    if (!hullSpecId) {
      throw new Error(
        `NPC spawn rule missing hullSpecId (faction ${rule.factionId}, ${rule.behaviourType}) in sector ${this.sector.coord.x},${this.sector.coord.y}`
      );
    }
    const hullSpec = this.worldState.getHullSpec(hullSpecId);
    if (!hullSpec) {
      throw new Error(
        `NPC spawn rule references unknown hull "${hullSpecId}" in sector ${this.sector.coord.x},${this.sector.coord.y}`
      );
    }
    const variant = rule.loadoutVariant ?? 'basic';
    const loadout = this.worldState.getNpcSpawnPack(hullSpecId, variant);
    const combat = this.worldState.getCombatStateFromEquipmentSlots(loadout.equipmentSlots);
    const maxHullHP = hullSpec.baseHP;
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
      currentHullHP: maxHullHP,
      maxHullHP,
      armourLayers: combat.armourLayers,
      currentShieldHP: combat.currentShieldHP,
      maxShieldHP: combat.maxShieldHP,
      shieldRebooting: false,
      shieldRebootTimer: 0,
      lastHitTime: 0,
      currentJoules: combat.maxJoules,
      fuel: this.worldState.getMaxFuelForSlots(loadout.equipmentSlots),
      equipmentSlots: loadout.equipmentSlots,
      autoBrakeLinearEnabled: true,
      autoBrakeRotationEnabled: true,
      weaponLoadout: loadout.weaponLoadout,
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
      pos.x < -(SECTOR_SIZE / 2) ||
      pos.x > SECTOR_SIZE / 2 ||
      pos.y < -(SECTOR_SIZE / 2) ||
      pos.y > SECTOR_SIZE / 2
    );
  }
}
