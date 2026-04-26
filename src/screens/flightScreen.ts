import { GameLoop } from '../core/gameLoop';
import { WorldState } from '../core/worldState';
import { computeGravity } from '../physics/gravity';
import { pointInCircle } from '../physics/collision';
import { Vector2 } from '../physics/vector2';
import type { RenderPipeline } from '../renderer/renderPipeline';
import type { Camera } from '../renderer/camera';
import { PlayerController } from '../simulation/playerController';
import { SectorSimulation } from '../simulation/sector';
import { ShipEntity } from '../simulation/shipEntity';
import { TargetingSystem } from '../simulation/targetingSystem';
import type { Landable, WeaponSlot } from '../types';
import {
  ARRIVAL_MESSAGE_DURATION_MS,
  AUTOSAVE_INTERVAL_SECONDS,
  COLOURS,
  INSURANCE_PAYOUT_FRACTION,
  INSURANCE_REPAIR_COST_FRACTION,
  LANDING_RADIUS_MULTIPLIER,
  LANDING_SPEED_THRESHOLD,
  MAX_RADIATION_DAMAGE_PER_SECOND,
  SECTOR_EDGE_THRESHOLD,
  SECTOR_HEIGHT,
  SECTOR_WIDTH,
  TAKEOFF_VELOCITY
} from '../constants';
import { LandableScreen } from './landableScreen';
import { InsuranceScreen, type InsuranceChoice } from './insuranceScreen';
import { ScreenManager, type Screen } from './screenManager';

type SectorEdge = 'north' | 'south' | 'east' | 'west';

export class FlightScreen implements Screen {
  private static readonly TAKEOFF_LANDING_COOLDOWN_SECONDS = 0.35;
  private gameLoop: GameLoop | null = null;

  private playerController: PlayerController | null = null;

  private playerShip: ShipEntity | null = null;

  private sectorSimulation: SectorSimulation | null = null;
  private targeting = new TargetingSystem();
  private heldFireKeys = { Z: false, X: false, C: false, V: false, B: false };

  private readonly landables: Landable[] = [];
  private landingCandidate: Landable | null = null;
  private isLanded = false;
  private landedAt: Landable | null = null;
  private landableScreen: LandableScreen | null = null;
  private landingCooldownSeconds = 0;
  private lastKnownShipPosition: Vector2 = Vector2.zero();
  private lastDt = 0;
  private autosaveAccumulator = 0;
  private isTransitioning = false;
  private boundaryWarningUntilMs = 0;
  private arrivalMessageUntilMs = 0;
  private arrivalMessageSectorName = '';
  private arrivalMessageLandables = '';
  private destructionMessageUntilMs = 0;
  private pendingInsuranceSeconds = 0;
  private insuranceScreen: InsuranceScreen | null = null;
  private destructionPending = false;
  private lastShipValue = 0;
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
    this.playerShip = new ShipEntity(this.worldState.getPlayerShipState());
    this.playerShip.recalculateMaxHP(this.worldState);
    this.worldState.updatePlayerShipState({
      currentHP: this.playerShip.state.currentHP,
      maxHP: this.playerShip.state.maxHP
    });
    this.playerController = new PlayerController({
      autoBrakeLinearEnabled: this.playerShip.state.autoBrakeLinearEnabled,
      autoBrakeRotationEnabled: this.playerShip.state.autoBrakeRotationEnabled
    });
    this.ensureDefaultLoadout();
    this.ensurePlayerAutoBrakeInstalled();
    this.ensurePlayerDevWeaponLoadout();
    this.sectorSimulation = new SectorSimulation(
      currentSector,
      this.playerShip,
      this.worldState,
      currentSector.seed
    );
    this.sectorSimulation.spawnNPCs();
    this.targeting = new TargetingSystem();
    this.autosaveAccumulator = 0;
    window.addEventListener('beforeunload', this.onBeforeUnload);

    this.gameLoop = new GameLoop({
      update: (dt: number) => this.update(dt),
      render: () => this.render(this.ctx)
    });
    this.gameLoop.start();
  }

  private ensureDefaultLoadout(): void {
    if (!this.playerShip) {
      return;
    }
    const hasMovementThrusters = this.playerShip.state.equipmentSlots.some(
      (slot) =>
        !!slot.itemId &&
        (slot.slotType === 'thruster_forward' ||
          slot.slotType === 'thruster_reverse' ||
          slot.slotType === 'thruster_rotateCW' ||
          slot.slotType === 'thruster_rotateCCW')
    );
    if (hasMovementThrusters && this.playerShip.state.weaponLoadout.length > 0) {
      return;
    }
    const defaultLoadout = this.worldState.getDefaultLoadout('fighter');
    this.playerShip.state = {
      ...this.playerShip.state,
      equipmentSlots: defaultLoadout.equipmentSlots,
      weaponLoadout: defaultLoadout.weaponLoadout
    };
    this.worldState.updatePlayerShipState({
      equipmentSlots: defaultLoadout.equipmentSlots,
      weaponLoadout: defaultLoadout.weaponLoadout
    });
    this.worldState.saveToLocalStorage();
  }

  private ensurePlayerAutoBrakeInstalled(): void {
    if (!this.playerShip) {
      return;
    }
    const hasAutoBrake = this.playerShip.state.equipmentSlots.some(
      (slot) => slot.slotType === 'autoBrake' && slot.itemId !== null
    );
    if (hasAutoBrake) {
      return;
    }
    const nextEquipmentSlots = [
      ...this.playerShip.state.equipmentSlots,
      { slotType: 'autoBrake' as const, itemId: 'auto_brake_t1' }
    ];
    this.playerShip.state = {
      ...this.playerShip.state,
      equipmentSlots: nextEquipmentSlots
    };
    this.worldState.updatePlayerShipState({ equipmentSlots: nextEquipmentSlots });
    this.worldState.saveToLocalStorage();
  }

  private ensurePlayerDevWeaponLoadout(): void {
    if (!this.playerShip) {
      return;
    }
    const devLoadout: WeaponSlot[] = [
      { fireKey: 'Z', itemId: 'pulse_cannon_t1', stackCount: 1, cooldownRemaining: 0 },
      { fireKey: 'X', itemId: 'slug_thrower_t1', stackCount: 1, cooldownRemaining: 0 },
      { fireKey: 'C', itemId: 'seeker_launcher_t1', stackCount: 1, cooldownRemaining: 0 },
      { fireKey: 'V', itemId: 'plasma_launcher_t1', stackCount: 1, cooldownRemaining: 0 }
    ];
    const existingByKey = new Map(this.playerShip.state.weaponLoadout.map((slot) => [slot.fireKey, slot]));
    const hasAllDevWeapons = devLoadout.every((slot) => {
      const existing = existingByKey.get(slot.fireKey);
      return existing?.itemId === slot.itemId;
    });
    if (hasAllDevWeapons) {
      return;
    }
    this.playerShip.state = {
      ...this.playerShip.state,
      weaponLoadout: devLoadout
    };
    this.worldState.updatePlayerShipState({ weaponLoadout: devLoadout });
    this.worldState.saveToLocalStorage();
  }

  onExit(): void {
    if (this.insuranceScreen) {
      this.screenManager.pop();
      this.insuranceScreen = null;
    }
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
    this.sectorSimulation?.dispose();
    this.sectorSimulation = null;
  }

  update(dt: number): void {
    if (!this.playerController || !this.playerShip) {
      return;
    }
    if (this.insuranceScreen) {
      this.insuranceScreen.update(dt);
      return;
    }
    if (this.destructionPending) {
      this.pendingInsuranceSeconds = Math.max(0, this.pendingInsuranceSeconds - dt);
      if (this.pendingInsuranceSeconds <= 0) {
        this.openInsuranceScreen();
      }
      return;
    }

    if (this.isLanded) {
      this.landableScreen?.update(dt);
      return;
    }

    this.lastDt = dt;
    if (this.landingCooldownSeconds > 0) {
      this.landingCooldownSeconds = Math.max(0, this.landingCooldownSeconds - dt);
    }
    const inputs = this.isTransitioning
      ? {
          forward: false,
          reverse: false,
          rotateCW: false,
          rotateCCW: false,
          autoBrakeLinear: false,
          autoBrakeRotation: false,
          landPressed: false,
          devRefuelPressed: false
        }
      : this.playerController.update();
    const targetInputs = this.playerController.getTargetInputs();
    const fireInputs = this.playerController.getFireInputs();
    this.heldFireKeys = { ...fireInputs };
    this.lastKnownShipPosition = this.playerShip.state.position as Vector2;
    this.playerShip.applyThrusterInputs(inputs, this.worldState, dt);
    const playerMass = this.playerShip.getEffectiveMass(this.worldState);
    const gravity = computeGravity(
      this.playerShip.state.position as Vector2,
      playerMass,
      this.landables.map((landable) => ({
        position: landable.position as Vector2,
        mass: landable.mass,
        radius: landable.radius
      }))
    );
    this.playerShip.applyExternalForce(gravity);
    this.playerShip.update(dt, this.worldState);
    if (inputs.devRefuelPressed) {
      this.playerShip.state = {
        ...this.playerShip.state,
        fuel: this.playerShip.state.maxFuel
      };
    }
    const npcShips = this.sectorSimulation?.getNPCShips() ?? [];
    if (targetInputs.cycleShipTarget) {
      this.targeting.cycleShipTarget(
        this.playerShip.state.position as Vector2,
        npcShips,
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
    this.sectorSimulation?.getWeaponSystem().update(
      dt,
      this.playerShip.state,
      fireInputs,
      this.worldState,
      this.targeting.getShipTargetId()
    );
    this.sectorSimulation?.update(dt);
    if (this.sectorSimulation?.getWeaponSystem().wasPlayerDestroyed()) {
      this.handleShipDestruction();
      return;
    }
    this.applyRadiationDamage(dt);
    this.worldState.updatePlayerShipState({
      position: this.playerShip.state.position,
      velocity: this.playerShip.state.velocity,
      angle: this.playerShip.state.angle,
      angularVelocity: this.playerShip.state.angularVelocity,
      currentHP: this.playerShip.state.currentHP,
      maxHP: this.playerShip.state.maxHP,
      fuel: this.playerShip.state.fuel,
      credits: this.playerShip.state.credits,
      autoBrakeLinearEnabled: this.playerShip.isLinearAutoBrakeEnabled(),
      autoBrakeRotationEnabled: this.playerShip.isRotationAutoBrakeEnabled(),
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
      otherShips: this.sectorSimulation?.getNPCShips() ?? [],
      landables: this.landables,
      bullets: this.sectorSimulation?.getWeaponSystem().getActiveBullets() ?? [],
      particles: this.sectorSimulation?.getParticleSystem().getParticles() ?? [],
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
      destructionMessageAlpha: this.getDestructionMessageAlpha(),
      activeBurns: this.sectorSimulation?.getWeaponSystem().getActiveBurns() ?? [],
      spawnRuleDebugLines: (this.sectorSimulation?.getSpawnRuleDebugRows() ?? []).map((row) => {
        const next = row.nextArrivalIn.toFixed(1).padStart(5, ' ');
        return `RULE ${row.factionId.slice(0, 5)} ${row.behaviourType.slice(0, 4)} ${row.currentCount}/${row.maxPresent} t:${next}s`;
      })
    });
    this.landableScreen?.render(this.ctx);
    this.insuranceScreen?.render(this.ctx);
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
    if (!this.playerShip || this.destructionPending || this.insuranceScreen) {
      return;
    }
    this.lastShipValue = this.worldState.calculateShipValue(this.worldState.getPlayerShipState());
    const playerPos = this.playerShip.state.position as Vector2;
    this.sectorSimulation
      ?.getParticleSystem()
      .spawnExplosion(new Vector2(playerPos.x, playerPos.y), COLOURS.DANGER, 36);
    this.destructionPending = true;
    this.pendingInsuranceSeconds = 1.5;
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
    this.sectorSimulation?.dispose();
    if (this.playerShip) {
      this.sectorSimulation = new SectorSimulation(
        sector,
        this.playerShip,
        this.worldState,
        sector.seed
      );
      this.sectorSimulation.spawnNPCs();
    }
  }

  private openInsuranceScreen(): void {
    this.pendingInsuranceSeconds = 0;
    this.insuranceScreen = new InsuranceScreen(
      this.canvas,
      this.worldState,
      this.lastShipValue,
      (choice) => this.handleInsuranceChoice(choice)
    );
    this.screenManager.push(this.insuranceScreen);
  }

  private handleInsuranceChoice(choice: InsuranceChoice): void {
    const ship = this.worldState.getPlayerShipState();
    let respawnLandable: Landable | null = null;
    if (choice.type === 'repair') {
      const cost = Math.ceil(this.lastShipValue * INSURANCE_REPAIR_COST_FRACTION);
      if (ship.credits < cost) {
        return;
      }
      const respawnSector = this.findLastVisitedLandableSectorCoord();
      respawnLandable = this.findLandableInSector(respawnSector, ship.lastLandedLandableId ?? null);
      this.worldState.setCurrentSector(respawnSector);
      const respawnPosition = respawnLandable ? new Vector2(respawnLandable.position.x, respawnLandable.position.y) : Vector2.zero();
      this.worldState.updatePlayerShipState({
        currentHP: ship.maxHP,
        credits: ship.credits - cost,
        position: respawnPosition,
        velocity: Vector2.zero(),
        angularVelocity: 0,
        lastLandedLandableId: respawnLandable?.id ?? ship.lastLandedLandableId ?? null
      });
      this.playerShip!.state = {
        ...this.playerShip!.state,
        ...this.worldState.getPlayerShipState()
      };
      this.loadCurrentSector();
    } else if (choice.type === 'payout') {
      const payout = Math.floor(this.lastShipValue * INSURANCE_PAYOUT_FRACTION);
      const starterState = this.buildStarterShipState();
      const respawnSector = this.findNearestAccessibleSector();
      respawnLandable = this.findLandableInSector(respawnSector, null);
      const respawnPosition = respawnLandable ? new Vector2(respawnLandable.position.x, respawnLandable.position.y) : Vector2.zero();
      this.worldState.updatePlayerShipState({
        ...starterState,
        credits: ship.credits + payout,
        position: respawnPosition,
        lastLandedLandableId: respawnLandable?.id ?? null
      });
      this.worldState.setCurrentSector(respawnSector);
      this.playerShip!.state = this.worldState.getPlayerShipState();
      this.loadCurrentSector();
    }
    this.worldState.saveToLocalStorage();
    this.destructionPending = false;
    this.lastShipValue = 0;
    this.insuranceScreen = null;
    this.screenManager.pop();
    if (respawnLandable) {
      this.land(respawnLandable);
    }
  }

  private buildStarterShipState() {
    const current = this.worldState.getPlayerShipState();
    const loadout = this.worldState.getDefaultLoadout('fighter');
    const hull = this.worldState.getHullSpec('fighter_mk1');
    const baseHP = hull?.baseHP ?? 100;
    const maxFuel = current.maxFuel;
    return {
      ...current,
      hullSpecId: 'fighter_mk1',
      currentHP: baseHP,
      maxHP: baseHP,
      fuel: maxFuel,
      maxFuel,
      equipmentSlots: loadout.equipmentSlots,
      weaponLoadout: loadout.weaponLoadout,
      position: Vector2.zero(),
      velocity: Vector2.zero(),
      angle: 0,
      angularVelocity: 0
    };
  }

  private findNearestAccessibleSector(): { x: number; y: number } {
    const current = this.worldState.getCurrentSectorCoord();
    const candidates = this.worldState
      .getVisitedSectorCoords()
      .map((coord) => this.worldState.getSector(coord))
      .filter((sector) => sector && sector.landables.length > 0)
      .filter((sector) => !sector!.factionId || this.worldState.getReputationTier(sector!.factionId) !== 'hostile')
      .sort((a, b) => {
        const da = Math.abs(a!.coord.x - current.x) + Math.abs(a!.coord.y - current.y);
        const db = Math.abs(b!.coord.x - current.x) + Math.abs(b!.coord.y - current.y);
        return da - db;
      });
    return candidates[0]?.coord ?? { x: 5, y: 5 };
  }

  private findLastVisitedLandableSectorCoord(): { x: number; y: number } {
    const lastLandableId = this.worldState.getPlayerShipState().lastLandedLandableId;
    if (!lastLandableId) {
      return this.worldState.getCurrentSectorCoord();
    }
    const coord = this.worldState.getSectorCoordByLandableId(lastLandableId);
    if (coord) {
      return coord;
    }
    return this.worldState.getCurrentSectorCoord();
  }

  private findLandableInSector(
    coord: { x: number; y: number },
    preferredLandableId: string | null
  ): Landable | null {
    const sector = this.worldState.getSector(coord);
    if (!sector || sector.landables.length === 0) {
      return null;
    }
    if (preferredLandableId) {
      const preferred = sector.landables.find((landable) => landable.id === preferredLandableId);
      if (preferred) {
        return preferred;
      }
    }
    return sector.landables[0];
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

      this.loadCurrentSector();
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
    if (this.landingCooldownSeconds > 0) {
      this.landingCandidate = null;
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
    const persistedShipState = this.worldState.getPlayerShipState();
    this.playerShip.state = {
      ...this.playerShip.state,
      ...persistedShipState,
      position: new Vector2(landable.position.x + takeoffDirection.x * (landable.radius + 14), landable.position.y + takeoffDirection.y * (landable.radius + 14)),
      velocity: takeoffDirection.scale(TAKEOFF_VELOCITY)
    };
    this.playerShip.recalculateMaxHP(this.worldState);
    this.worldState.updatePlayerShipState(this.playerShip.state);
    this.sectorSimulation?.respawnNPCs();
    this.playerController?.getLandPressed();
    this.landingCooldownSeconds = FlightScreen.TAKEOFF_LANDING_COOLDOWN_SECONDS;
    this.isLanded = false;
    this.landedAt = null;
    this.landingCandidate = null;
    this.landableScreen = null;
    this.screenManager.pop();
  }
}
