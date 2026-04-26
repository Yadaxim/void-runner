import { PLACEHOLDER_SHIP_MASS, SECTOR_HEIGHT, SECTOR_WIDTH } from '../constants';
import { childPRNG } from '../core/prng';
import type { WorldState } from '../core/worldState';
import { computeGravity } from '../physics/gravity';
import { Vector2 } from '../physics/vector2';
import type { Landable, SectorMetadata, ShipState, WeaponFireKey, WeaponSlot } from '../types';
import { NPCController, type NPCState } from './npcController';
import { ParticleSystem } from './particleSystem';
import { ShipEntity } from './shipEntity';
import { WeaponSystem } from './weaponSystem';

function toNPCState(input: string): NPCState {
  if (input === 'trade' || input === 'hostile' || input === 'flee') {
    return input;
  }
  return 'patrol';
}

function buildLoadout(): WeaponSlot[] {
  return [{ fireKey: 'Z', itemId: 'pulse_cannon_t1', stackCount: 1, cooldownRemaining: 0 }];
}

export class SectorSimulation {
  private npcShips: ShipEntity[] = [];
  private readonly playerShip: ShipEntity;
  private readonly landables: Landable[];
  private readonly weaponSystem: WeaponSystem;
  private readonly particleSystem: ParticleSystem;
  private readonly prng;

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
  }

  spawnNPCs(): void {
    this.npcShips = [];
    let shipCounter = 0;
    for (const rule of this.sector.npcSpawnRules) {
      const count = this.prng.nextInt(rule.countRange[0], rule.countRange[1]);
      for (let i = 0; i < count; i += 1) {
        let position = Vector2.zero();
        for (let attempts = 0; attempts < 20; attempts += 1) {
          const candidate = new Vector2(
            this.prng.nextInt(-(SECTOR_WIDTH / 2) + 120, SECTOR_WIDTH / 2 - 120),
            this.prng.nextInt(-(SECTOR_HEIGHT / 2) + 120, SECTOR_HEIGHT / 2 - 120)
          );
          if (candidate.magnitude() >= 400) {
            position = candidate;
            break;
          }
        }
        if (position.magnitude() < 400) {
          position = new Vector2(500, 0);
        }
        const hullSpecId =
          rule.factionId === 'federation' ? 'courier_mk1' : 'fighter_raider_mk1';
        const hullSpec = this.worldState.getHullSpec(hullSpecId);
        const maxHP = hullSpec?.baseHP ?? 100;
        const id = `npc_${this.sector.coord.x}_${this.sector.coord.y}_${rule.factionId}_${shipCounter++}`;
        const shipState: ShipState = {
          ...this.playerShip.state,
          id,
          hullSpecId,
          factionId: rule.factionId,
          position,
          velocity: Vector2.zero(),
          angle: this.prng.next() * Math.PI * 2,
          angularVelocity: 0,
          currentHP: maxHP,
          maxHP,
          equipmentSlots: [],
          autoBrakeLinearEnabled: true,
          autoBrakeRotationEnabled: true,
          weaponLoadout: (hullSpec?.defaultWeaponLoadout ?? buildLoadout()).map((slot) => ({
            ...slot
          })),
          isPlayerControlled: false,
          fleetRole: 'escort'
        };
        const ship = new ShipEntity(shipState);
        const initialState = toNPCState(rule.behaviourType);
        ship.attachNPCController(
          new NPCController(initialState, this.sector.seed + shipCounter, rule.factionId),
          initialState
        );
        this.npcShips.push(ship);
      }
    }
  }

  update(dt: number): void {
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
      this.weaponSystem.update(dt, ship.state, fireInputs, this.worldState, 'player');
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

  dispose(): void {
    this.npcShips = [];
  }
}
