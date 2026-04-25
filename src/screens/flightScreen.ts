import { GameLoop } from '../core/gameLoop';
import { WorldState } from '../core/worldState';
import { computeGravity } from '../physics/gravity';
import { pointInCircle } from '../physics/collision';
import { Vector2 } from '../physics/vector2';
import type { RenderPipeline } from '../renderer/renderPipeline';
import type { Camera } from '../renderer/camera';
import { PlayerController } from '../simulation/playerController';
import { ParticleSystem } from '../simulation/particleSystem';
import { ShipEntity } from '../simulation/shipEntity';
import { TargetingSystem } from '../simulation/targetingSystem';
import { WeaponSystem } from '../simulation/weaponSystem';
import type { Landable, WeaponSlot } from '../types';
import {
  ARRIVAL_MESSAGE_DURATION_MS,
  AUTOSAVE_INTERVAL_SECONDS,
  LANDING_RADIUS_MULTIPLIER,
  LANDING_SPEED_THRESHOLD,
  MAX_RADIATION_DAMAGE_PER_SECOND,
  SECTOR_EDGE_THRESHOLD,
  SECTOR_HEIGHT,
  SECTOR_WIDTH,
  PLACEHOLDER_SHIP_MASS,
  TAKEOFF_VELOCITY
} from '../constants';
import { LandableScreen } from './landableScreen';
import { ScreenManager, type Screen } from './screenManager';

type SectorEdge = 'north' | 'south' | 'east' | 'west';

export class FlightScreen implements Screen {
  private gameLoop: GameLoop | null = null;

  private playerController: PlayerController | null = null;

  private playerShip: ShipEntity | null = null;

  private otherShips: ShipEntity[] = [];
  private targeting = new TargetingSystem();
  private particleSystem = new ParticleSystem();
  private weaponSystem = new WeaponSystem(this.particleSystem);
  private heldFireKeys = { Z: false, X: false, C: false, V: false, B: false };

  private readonly landables: Landable[] = [];
  private landingCandidate: Landable | null = null;
  private isLanded = false;
  private landedAt: Landable | null = null;
  private landableScreen: LandableScreen | null = null;
  private lastKnownShipPosition: Vector2 = Vector2.zero();
  private lastDt = 0;
  private autosaveAccumulator = 0;
  private isTransitioning = false;
  private boundaryWarningUntilMs = 0;
  private arrivalMessageUntilMs = 0;
  private arrivalMessageSectorName = '';
  private arrivalMessageLandables = '';
  private destructionMessageUntilMs = 0;
  private readonly onBeforeUnload = (): void => {
    this.worldState.saveToLocalStorage();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly pipeline: RenderPipeline,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly screenManager: ScreenManager,
    private readonly worldState: WorldState
  ) {}

  onEnter(): void {
    const currentSector = this.worldState.getCurrentSector();
    this.pipeline.setSectorContext(currentSector.seed, {
      hasNebula: currentSector.ambientVisuals.hasNebula,
      nebulaHue: currentSector.ambientVisuals.nebulaHue,
      nebulaIntensity: currentSector.ambientVisuals.nebulaIntensity,
      starDensityMultiplier: currentSector.ambientVisuals.starDensityMultiplier
    });
    this.landables.length = 0;
    this.landables.push(...this.worldState.getLandablesInCurrentSector());
    this.worldState.markVisited(currentSector.coord);
    this.playerController = new PlayerController();
    this.playerShip = new ShipEntity(this.worldState.getPlayerShipState());
    this.ensureDefaultWeaponLoadout();
    this.otherShips.length = 0;
    this.spawnDummyTargetAhead();
    this.targeting = new TargetingSystem();
    this.particleSystem = new ParticleSystem();
    this.weaponSystem = new WeaponSystem(this.particleSystem);
    this.autosaveAccumulator = 0;
    window.addEventListener('beforeunload', this.onBeforeUnload);

    this.gameLoop = new GameLoop({
      update: (dt: number) => this.update(dt),
      render: () => this.render(this.ctx)
    });
    this.gameLoop.start();
  }

  private ensureDefaultWeaponLoadout(): void {
    if (!this.playerShip) {
      return;
    }
    if (this.playerShip.state.weaponLoadout.length > 0) {
      return;
    }
    const defaultLoadout: WeaponSlot[] = [
      { fireKey: 'Z', itemId: 'pulse_cannon_t1', stackCount: 1, cooldownRemaining: 0 },
      { fireKey: 'X', itemId: 'slug_thrower_t1', stackCount: 1, cooldownRemaining: 0 },
      { fireKey: 'C', itemId: 'seeker_launcher_t1', stackCount: 1, cooldownRemaining: 0 },
      { fireKey: 'V', itemId: 'plasma_launcher_t1', stackCount: 1, cooldownRemaining: 0 }
    ];
    this.playerShip.state = {
      ...this.playerShip.state,
      weaponLoadout: defaultLoadout
    };
    this.worldState.updatePlayerShipState({ weaponLoadout: defaultLoadout });
    this.worldState.saveToLocalStorage();
  }

  onExit(): void {
    if (this.landableScreen) {
      this.screenManager.pop();
      this.landableScreen = null;
    }
    this.gameLoop?.stop();
    this.gameLoop = null;
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.worldState.saveToLocalStorage();
    this.playerController?.destroy();
    this.playerController = null;
    this.playerShip = null;
  }

  update(dt: number): void {
    if (!this.playerController || !this.playerShip) {
      return;
    }

    if (this.isLanded) {
      this.landableScreen?.update(dt);
      return;
    }

    this.lastDt = dt;
    const inputs = this.isTransitioning
      ? {
          forward: false,
          reverse: false,
          rotateCW: false,
          rotateCCW: false,
          autoBrakeLinear: false,
          autoBrakeRotation: false,
          landPressed: false
        }
      : this.playerController.update();
    const targetInputs = this.playerController.getTargetInputs();
    const fireInputs = this.playerController.getFireInputs();
    this.heldFireKeys = { ...fireInputs };
    const devInputs = this.playerController.getDevInputs();
    this.lastKnownShipPosition = this.playerShip.state.position as Vector2;
    this.playerShip.applyThrusterInputs(inputs);
    const gravity = computeGravity(
      this.playerShip.state.position as Vector2,
      PLACEHOLDER_SHIP_MASS,
      this.landables.map((landable) => ({
        position: landable.position as Vector2,
        mass: landable.mass,
        radius: landable.radius
      }))
    );
    this.playerShip.applyExternalForce(gravity);
    this.playerShip.update(dt);
    this.handleDevDummySpawn(devInputs.spawnDummyTarget);
    if (targetInputs.cycleShipTarget) {
      this.targeting.cycleShipTarget(
        this.playerShip.state.position as Vector2,
        this.otherShips,
        this.targeting.getShipTargetId()
      );
    }
    if (targetInputs.cycleLandableTarget) {
      this.targeting.cycleLandableTarget(
        this.playerShip.state.position as Vector2,
        this.landables,
        this.targeting.getLandableTargetId()
      );
    }
    this.weaponSystem.update(
      dt,
      this.playerShip.state,
      fireInputs,
      this.worldState,
      this.targeting.getShipTargetId()
    );
    this.weaponSystem.updateBullets(
      dt,
      this.landables.filter((landable) => landable.mass > 0).map((landable) => ({
        position: landable.position as Vector2,
        mass: landable.mass
      })),
      this.otherShips,
      this.landables
    );
    this.weaponSystem.pruneExpired();
    this.particleSystem.update(dt);
    this.otherShips = this.otherShips.filter((ship) => ship.state.currentHP > 0);
    this.applyRadiationDamage(dt);
    this.worldState.updatePlayerShipState({
      position: this.playerShip.state.position,
      velocity: this.playerShip.state.velocity,
      angle: this.playerShip.state.angle,
      angularVelocity: this.playerShip.state.angularVelocity,
      fuel: this.playerShip.state.fuel,
      credits: this.playerShip.state.credits,
      weaponLoadout: this.playerShip.state.weaponLoadout,
      targets: this.targeting.getTargetState(),
      lastLandedLandableId: this.playerShip.state.lastLandedLandableId
    });
    this.autosaveAccumulator += dt;
    if (this.autosaveAccumulator >= AUTOSAVE_INTERVAL_SECONDS) {
      this.worldState.saveToLocalStorage();
      this.autosaveAccumulator = 0;
    }
    this.checkLandingConditions(inputs.landPressed);
    if (this.isTransitioning) {
      return;
    }
    const crossedEdge = this.checkSectorEdge();
    if (crossedEdge) {
      const current = this.worldState.getCurrentSectorCoord();
      const adjacent = this.getAdjacentCoord(current, crossedEdge);
      if (!this.isWithinGalaxyBounds(adjacent)) {
        this.applyBoundaryClamp(crossedEdge);
        this.boundaryWarningUntilMs = performance.now() + 2000;
      } else {
        void this.transitionToSector(crossedEdge);
      }
    }
  }

  render(_ctx: CanvasRenderingContext2D): void {
    if (!this.playerShip) {
      return;
    }

    const camera: Camera = {
      playerWorldPos: this.playerShip.state.position,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height
    };

    this.pipeline.render({
      playerShip: this.playerShip,
      otherShips: this.otherShips,
      landables: this.landables,
      bullets: this.weaponSystem.getActiveBullets(),
      particles: this.particleSystem.getParticles(),
      camera,
      landingCandidate: this.landingCandidate,
      shipTargetId: this.targeting.getShipTargetId(),
      landableTargetId: this.targeting.getLandableTargetId(),
      heldFireKeys: this.heldFireKeys,
      worldState: this.worldState,
      dt: this.lastDt,
      showBoundaryWarning: performance.now() <= this.boundaryWarningUntilMs,
      radiationIntensity: this.worldState.getRadiationIntensity(),
      arrivalMessage: this.getArrivalMessage(),
      destructionMessageAlpha: this.getDestructionMessageAlpha()
    });
    this.landableScreen?.render(this.ctx);
  }

  private handleDevDummySpawn(shouldSpawn: boolean): void {
    if (!shouldSpawn || !this.playerShip) {
      return;
    }
    const existingIndex = this.otherShips.findIndex((ship) => ship.state.id === 'dummy_target');
    if (existingIndex >= 0) {
      this.otherShips.splice(existingIndex, 1);
      this.targeting.setShipTarget(null);
      return;
    }

    this.spawnDummyTargetAhead();
  }

  private spawnDummyTargetAhead(): void {
    if (!this.playerShip) {
      return;
    }
    if (this.otherShips.some((ship) => ship.state.id === 'dummy_target')) {
      return;
    }
    const forward = Vector2.fromAngle(this.playerShip.state.angle);
    const spawnPos = (this.playerShip.state.position as Vector2).add(forward.scale(400));
    this.otherShips.push(
      new ShipEntity({
        ...this.playerShip.state,
        id: 'dummy_target',
        position: spawnPos,
        velocity: Vector2.zero(),
        angle: this.playerShip.state.angle,
        angularVelocity: 0,
        currentHP: 200,
        maxHP: 200,
        isPlayerControlled: false
      })
    );
  }

  private getDestructionMessageAlpha(): number {
    const now = performance.now();
    if (now > this.destructionMessageUntilMs) {
      return 0;
    }
    const duration = 3000;
    return (this.destructionMessageUntilMs - now) / duration;
  }

  private getArrivalMessage():
    | {
        title: string;
        landablesLine: string;
        alpha: number;
      }
    | null {
    const now = performance.now();
    if (now > this.arrivalMessageUntilMs) {
      return null;
    }
    const duration = ARRIVAL_MESSAGE_DURATION_MS;
    const elapsed = duration - (this.arrivalMessageUntilMs - now);
    const fadeOutStart = duration * 0.6;
    const fadeOutProgress = elapsed > fadeOutStart ? (elapsed - fadeOutStart) / (duration - fadeOutStart) : 0;
    const alpha = 1 - Math.max(0, Math.min(1, fadeOutProgress));
    return {
      title: this.arrivalMessageSectorName,
      landablesLine: this.arrivalMessageLandables,
      alpha
    };
  }

  private setArrivalMessageForSector(): void {
    const sector = this.worldState.getCurrentSector();
    this.arrivalMessageSectorName = `ARRIVING AT ${sector.coord.x} : ${sector.coord.y}`;
    if (sector.landables.length === 0) {
      this.arrivalMessageLandables = 'LANDABLES: NONE';
    } else {
      const names = sector.landables.map((landable) => landable.name.toUpperCase()).join(', ');
      this.arrivalMessageLandables = `LANDABLES: ${names}`;
    }
    this.arrivalMessageUntilMs = performance.now() + ARRIVAL_MESSAGE_DURATION_MS;
  }

  private checkSectorEdge(): SectorEdge | null {
    if (!this.playerShip) {
      return null;
    }
    const position = this.playerShip.state.position as Vector2;
    if (position.y < -(SECTOR_HEIGHT / 2) + SECTOR_EDGE_THRESHOLD) {
      return 'north';
    }
    if (position.y > SECTOR_HEIGHT / 2 - SECTOR_EDGE_THRESHOLD) {
      return 'south';
    }
    if (position.x > SECTOR_WIDTH / 2 - SECTOR_EDGE_THRESHOLD) {
      return 'east';
    }
    if (position.x < -(SECTOR_WIDTH / 2) + SECTOR_EDGE_THRESHOLD) {
      return 'west';
    }
    return null;
  }

  private getAdjacentCoord(coord: { x: number; y: number }, edge: SectorEdge): { x: number; y: number } {
    if (edge === 'north') {
      return { x: coord.x, y: coord.y + 1 };
    }
    if (edge === 'south') {
      return { x: coord.x, y: coord.y - 1 };
    }
    if (edge === 'east') {
      return { x: coord.x + 1, y: coord.y };
    }
    return { x: coord.x - 1, y: coord.y };
  }

  private isWithinGalaxyBounds(coord: { x: number; y: number }): boolean {
    const gridHalfWidth = this.worldState.getGridWidth() / 2;
    const gridHalfHeight = this.worldState.getGridHeight() / 2;
    return (
      coord.x >= -gridHalfWidth &&
      coord.x < gridHalfWidth &&
      coord.y >= -gridHalfHeight &&
      coord.y < gridHalfHeight
    );
  }

  private applyRadiationDamage(dt: number): void {
    if (!this.playerShip) {
      return;
    }

    const intensity = this.worldState.getRadiationIntensity();
    if (intensity <= 0) {
      return;
    }

    const damage = MAX_RADIATION_DAMAGE_PER_SECOND * intensity * dt;
    const newHP = Math.max(0, this.playerShip.state.currentHP - damage);
    this.playerShip.state = {
      ...this.playerShip.state,
      currentHP: newHP
    };
    this.worldState.updatePlayerShipState({ currentHP: newHP });

    if (newHP <= 0) {
      this.handleShipDestruction();
    }
  }

  private handleShipDestruction(): void {
    if (!this.playerShip) {
      return;
    }

    const penalty = 500;
    const ship = this.worldState.getPlayerShipState();
    const resetState = {
      currentHP: ship.maxHP,
      fuel: ship.maxFuel,
      credits: Math.max(0, ship.credits - penalty),
      position: Vector2.zero(),
      velocity: Vector2.zero(),
      angularVelocity: 0
    };

    this.worldState.updatePlayerShipState(resetState);
    this.playerShip.state = {
      ...this.playerShip.state,
      ...resetState
    };

    this.worldState.setCurrentSector({ x: 5, y: 5 });
    this.loadCurrentSector();
    this.worldState.saveToLocalStorage();
    this.destructionMessageUntilMs = performance.now() + 3000;
  }

  private loadCurrentSector(): void {
    const sector = this.worldState.getCurrentSector();
    this.landables.length = 0;
    this.landables.push(...sector.landables);
    this.worldState.markVisited(sector.coord);
    this.pipeline.setSectorContext(sector.seed, {
      hasNebula: sector.ambientVisuals.hasNebula,
      nebulaHue: sector.ambientVisuals.nebulaHue,
      nebulaIntensity: sector.ambientVisuals.nebulaIntensity,
      starDensityMultiplier: sector.ambientVisuals.starDensityMultiplier
    });
    this.landingCandidate = null;
    this.arrivalMessageUntilMs = 0;
  }

  private applyBoundaryClamp(edge: SectorEdge): void {
    if (!this.playerShip) {
      return;
    }
    const position = this.playerShip.state.position as Vector2;
    const velocity = this.playerShip.state.velocity as Vector2;
    let nextPosition = position;
    let nextVelocity = velocity;
    if (edge === 'east') {
      nextPosition = new Vector2(SECTOR_WIDTH / 2 - SECTOR_EDGE_THRESHOLD, position.y);
      nextVelocity = new Vector2(Math.min(0, velocity.x), velocity.y);
    } else if (edge === 'west') {
      nextPosition = new Vector2(-(SECTOR_WIDTH / 2) + SECTOR_EDGE_THRESHOLD, position.y);
      nextVelocity = new Vector2(Math.max(0, velocity.x), velocity.y);
    } else if (edge === 'north') {
      nextPosition = new Vector2(position.x, -(SECTOR_HEIGHT / 2) + SECTOR_EDGE_THRESHOLD);
      nextVelocity = new Vector2(velocity.x, Math.max(0, velocity.y));
    } else {
      nextPosition = new Vector2(position.x, SECTOR_HEIGHT / 2 - SECTOR_EDGE_THRESHOLD);
      nextVelocity = new Vector2(velocity.x, Math.min(0, velocity.y));
    }
    this.playerShip.state = {
      ...this.playerShip.state,
      position: nextPosition,
      velocity: nextVelocity
    };
    this.worldState.updatePlayerShipState({
      position: nextPosition,
      velocity: nextVelocity
    });
  }

  private async transitionToSector(edge: SectorEdge): Promise<void> {
    if (!this.playerShip || this.isTransitioning) {
      return;
    }
    this.isTransitioning = true;
    try {
      await this.pipeline.playTransitionOut(this.ctx, 300);
      const currentCoord = this.worldState.getCurrentSectorCoord();
      const nextCoord = this.getAdjacentCoord(currentCoord, edge);
      this.worldState.setCurrentSector(nextCoord);
      this.worldState.markVisited(nextCoord);

      const previousPosition = this.playerShip.state.position as Vector2;
      const spawnInset = SECTOR_EDGE_THRESHOLD * 2;
      let nextPosition = previousPosition;
      if (edge === 'east') {
        nextPosition = new Vector2(-(SECTOR_WIDTH / 2) + spawnInset, previousPosition.y);
      } else if (edge === 'west') {
        nextPosition = new Vector2(SECTOR_WIDTH / 2 - spawnInset, previousPosition.y);
      } else if (edge === 'north') {
        nextPosition = new Vector2(previousPosition.x, SECTOR_HEIGHT / 2 - spawnInset);
      } else {
        nextPosition = new Vector2(previousPosition.x, -(SECTOR_HEIGHT / 2) + spawnInset);
      }
      this.playerShip.state = {
        ...this.playerShip.state,
        position: nextPosition
      };
      this.worldState.updatePlayerShipState({
        position: nextPosition,
        velocity: this.playerShip.state.velocity
      });

      const newSector = this.worldState.getCurrentSector();
      this.landables.length = 0;
      this.landables.push(...newSector.landables);
      this.pipeline.setSectorContext(newSector.seed, {
        hasNebula: newSector.ambientVisuals.hasNebula,
        nebulaHue: newSector.ambientVisuals.nebulaHue,
        nebulaIntensity: newSector.ambientVisuals.nebulaIntensity,
        starDensityMultiplier: newSector.ambientVisuals.starDensityMultiplier
      });
      this.landingCandidate = null;
      this.setArrivalMessageForSector();
      await this.pipeline.playTransitionIn(this.ctx, 200);
      this.worldState.saveToLocalStorage();
    } finally {
      this.isTransitioning = false;
    }
  }

  private checkLandingConditions(landPressed: boolean): void {
    if (!this.playerShip) {
      return;
    }
    const position = this.playerShip.state.position as Vector2;
    const speed = (this.playerShip.state.velocity as Vector2).magnitude();
    this.landingCandidate = null;
    for (const landable of this.landables) {
      const isInRange = pointInCircle(
        position,
        landable.position as Vector2,
        landable.radius * LANDING_RADIUS_MULTIPLIER
      );
      if (isInRange && speed < LANDING_SPEED_THRESHOLD) {
        this.landingCandidate = landable;
        break;
      }
    }
    if (this.landingCandidate && landPressed) {
      this.land(this.landingCandidate);
    }
  }

  private land(landable: Landable): void {
    if (!this.playerShip || this.isLanded) {
      return;
    }
    this.isLanded = true;
    this.landedAt = landable;
    this.playerShip.state = {
      ...this.playerShip.state,
      velocity: Vector2.zero(),
      angularVelocity: 0,
      lastLandedLandableId: landable.id
    };
    this.worldState.updatePlayerShipState(this.playerShip.state);
    this.worldState.saveToLocalStorage();
    this.landableScreen = new LandableScreen(this.canvas, landable, this.worldState, () => this.takeOff());
    this.screenManager.push(this.landableScreen);
  }

  private takeOff(): void {
    if (!this.playerShip || !this.landedAt) {
      return;
    }
    const landable = this.landedAt;
    const outward = this.lastKnownShipPosition.sub(landable.position as Vector2).normalise();
    const takeoffDirection = outward.magnitude() === 0 ? new Vector2(1, 0) : outward;
    this.playerShip.state = {
      ...this.playerShip.state,
      position: new Vector2(landable.position.x + takeoffDirection.x * (landable.radius + 14), landable.position.y + takeoffDirection.y * (landable.radius + 14)),
      velocity: takeoffDirection.scale(TAKEOFF_VELOCITY)
    };
    this.worldState.updatePlayerShipState(this.playerShip.state);
    this.isLanded = false;
    this.landedAt = null;
    this.landingCandidate = null;
    this.landableScreen = null;
    this.screenManager.pop();
  }
}
