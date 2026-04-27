import { GameLoop } from '../core/gameLoop';
import { buildStarterShipState, WorldState } from '../core/worldState';
import { computeGravity } from '../physics/gravity';
import { pointInCircle } from '../physics/collision';
import { Vector2 } from '../physics/vector2';
import type { RenderPipeline } from '../renderer/renderPipeline';
import type { Camera } from '../renderer/camera';
import { PlayerController } from '../simulation/playerController';
import { SectorSimulation } from '../simulation/sector';
import { ShipEntity } from '../simulation/shipEntity';
import { TargetingSystem } from '../simulation/targetingSystem';
import type { Landable } from '../types';
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
import type { ReactorItem, ShieldItem } from '../types';

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
  private isPaused = false;
  private pauseSelection: 0 | 1 | 2 = 0;
  private pauseConfirmMainMenu = false;
  private pauseMouseResumeRect: { x: number; y: number; width: number; height: number } | null = null;
  private pauseMouseHelpRect: { x: number; y: number; width: number; height: number } | null = null;
  private pauseMouseMainRect: { x: number; y: number; width: number; height: number } | null = null;
  private pauseConfirmYesRect: { x: number; y: number; width: number; height: number } | null = null;
  private pauseConfirmNoRect: { x: number; y: number; width: number; height: number } | null = null;
  private missionsPanelExpanded = false;
  private showControlsOverlay = false;
  private readonly onBeforeUnload = (): void => {
    this.worldState.saveToLocalStorage();
  };
  private readonly onPauseKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      if (this.pauseConfirmMainMenu) {
        this.pauseConfirmMainMenu = false;
      } else {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
          this.pauseSelection = 0;
        } else {
          this.showControlsOverlay = false;
          this.pauseSelection = 0;
        }
      }
      return;
    }
    if (!this.isPaused) {
      return;
    }
    if (this.pauseConfirmMainMenu) {
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || event.code === 'Tab') {
        event.preventDefault();
        this.pauseSelection = this.pauseSelection === 1 ? 0 : 1;
      } else if (event.code === 'Enter') {
        event.preventDefault();
        if (this.pauseSelection === 1) {
          this.returnToMainMenu();
        } else {
          this.pauseConfirmMainMenu = false;
          this.pauseSelection = 1;
        }
      }
      return;
    }
    if (event.code === 'ArrowUp') {
      event.preventDefault();
      this.pauseSelection = this.pauseSelection === 0 ? 2 : ((this.pauseSelection - 1) as 0 | 1 | 2);
    } else if (event.code === 'ArrowDown') {
      event.preventDefault();
      this.pauseSelection = this.pauseSelection === 2 ? 0 : ((this.pauseSelection + 1) as 0 | 1 | 2);
    } else if (event.code === 'Enter') {
      event.preventDefault();
      this.activatePauseSelection();
    }
  };
  private readonly onPauseMouseDown = (event: MouseEvent): void => {
    if (!this.isPaused) {
      return;
    }
    const point = this.getCanvasPoint(event);
    if (!point) {
      return;
    }
    if (this.pauseConfirmMainMenu) {
      if (this.pauseConfirmYesRect && this.inRect(point.x, point.y, this.pauseConfirmYesRect)) {
        this.returnToMainMenu();
        return;
      }
      if (this.pauseConfirmNoRect && this.inRect(point.x, point.y, this.pauseConfirmNoRect)) {
        this.pauseConfirmMainMenu = false;
        this.pauseSelection = 1;
      }
      return;
    }
    if (this.pauseMouseResumeRect && this.inRect(point.x, point.y, this.pauseMouseResumeRect)) {
      this.pauseSelection = 0;
      this.activatePauseSelection();
    } else if (this.pauseMouseHelpRect && this.inRect(point.x, point.y, this.pauseMouseHelpRect)) {
      this.pauseSelection = 1;
      this.activatePauseSelection();
    } else if (this.pauseMouseMainRect && this.inRect(point.x, point.y, this.pauseMouseMainRect)) {
      this.pauseSelection = 2;
      this.activatePauseSelection();
    }
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
      currentHullHP: this.playerShip.state.currentHullHP,
      maxHullHP: this.playerShip.state.maxHullHP
    });
    this.playerController = new PlayerController({
      autoBrakeLinearEnabled: this.playerShip.state.autoBrakeLinearEnabled,
      autoBrakeRotationEnabled: this.playerShip.state.autoBrakeRotationEnabled
    });
    this.ensureDefaultLoadout();
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
    window.addEventListener('keydown', this.onPauseKeyDown);
    this.canvas.addEventListener('mousedown', this.onPauseMouseDown);

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
    const starter = buildStarterShipState(this.worldState);
    const hasAnyEquipment = this.playerShip.state.equipmentSlots.some((slot) => slot.itemId !== null);
    const hasAnyWeapons = this.playerShip.state.weaponLoadout.length > 0;
    if (hasAnyEquipment || hasAnyWeapons) {
      return;
    }
    this.playerShip.state = {
      ...this.playerShip.state,
      equipmentSlots: starter.equipmentSlots,
      weaponLoadout: starter.weaponLoadout
    };
    this.worldState.updatePlayerShipState({
      equipmentSlots: starter.equipmentSlots,
      weaponLoadout: starter.weaponLoadout
    });
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
    window.removeEventListener('keydown', this.onPauseKeyDown);
    this.canvas.removeEventListener('mousedown', this.onPauseMouseDown);
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

    if (this.isPaused) {
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
        fuel: this.worldState.getMaxFuel()
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
    if (targetInputs.toggleMissionsPanel) {
      this.missionsPanelExpanded = !this.missionsPanelExpanded;
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
    this.updateEnergyAndShield(dt);
    this.worldState.addPlayTime(dt);
    this.worldState.updatePlayerShipState({
      position: this.playerShip.state.position,
      velocity: this.playerShip.state.velocity,
      angle: this.playerShip.state.angle,
      angularVelocity: this.playerShip.state.angularVelocity,
      currentHullHP: this.playerShip.state.currentHullHP,
      maxHullHP: this.playerShip.state.maxHullHP,
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
      missionsPanelExpanded: this.missionsPanelExpanded,
      spawnRuleDebugLines: (this.sectorSimulation?.getSpawnRuleDebugRows() ?? []).map((row) => {
        const next = row.nextArrivalIn.toFixed(1).padStart(5, ' ');
        return `RULE ${row.factionId.slice(0, 5)} ${row.behaviourType.slice(0, 4)} ${row.currentCount}/${row.maxPresent} t:${next}s`;
      })
    });
    this.landableScreen?.render(this.ctx);
    this.insuranceScreen?.render(this.ctx);
    if (this.isPaused) {
      this.renderPauseOverlay(this.ctx);
    }
    if (this.showControlsOverlay && this.isPaused) {
      this.renderControlsOverlay(this.ctx);
    }
  }

  private renderPauseOverlay(ctx: CanvasRenderingContext2D): void {
    const panelWidth = 420;
    const panelHeight = this.pauseConfirmMainMenu ? 220 : 318;
    const panelX = (this.canvas.width - panelWidth) / 2;
    const panelY = (this.canvas.height - panelHeight) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(8, 8, 16, 0.95)';
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "22px 'Courier New', monospace";
    ctx.fillText('PAUSED', panelX + panelWidth / 2, panelY + 34);

    if (this.pauseConfirmMainMenu) {
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.WARNING;
      ctx.fillText(
        'YOUR PROGRESS IS SAVED. RETURN TO MAIN MENU?',
        panelX + panelWidth / 2,
        panelY + 88
      );
      this.pauseConfirmYesRect = { x: panelX + 100, y: panelY + 130, width: 90, height: 36 };
      this.pauseConfirmNoRect = { x: panelX + 230, y: panelY + 130, width: 90, height: 36 };
      this.drawPauseButton(ctx, this.pauseConfirmYesRect, '[ YES ]', this.pauseSelection === 1);
      this.drawPauseButton(ctx, this.pauseConfirmNoRect, '[ NO ]', this.pauseSelection === 0);
    } else {
      const options = ['[ RESUME ]', this.showControlsOverlay ? '[ HIDE HELP ]' : '[ HELP ]', '[ MAIN MENU ]'];
      const baseY = panelY + 90;
      const buttonWidth = 220;
      const buttonHeight = 40;
      this.pauseMouseResumeRect = { x: panelX + 100, y: baseY, width: buttonWidth, height: buttonHeight };
      this.pauseMouseHelpRect = { x: panelX + 100, y: baseY + 52, width: buttonWidth, height: buttonHeight };
      this.pauseMouseMainRect = { x: panelX + 100, y: baseY + 104, width: buttonWidth, height: buttonHeight };
      const rects = [this.pauseMouseResumeRect, this.pauseMouseHelpRect, this.pauseMouseMainRect];
      for (let i = 0; i < rects.length; i += 1) {
        this.drawPauseButton(ctx, rects[i], options[i], this.pauseSelection === i);
      }
    }
    ctx.restore();
  }

  private renderControlsOverlay(ctx: CanvasRenderingContext2D): void {
    const panelWidth = 560;
    const panelHeight = 300;
    const panelX = (this.canvas.width - panelWidth) / 2;
    const panelY = 34;
    ctx.save();
    ctx.fillStyle = 'rgba(8, 8, 16, 0.94)';
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillText('FLIGHT CONTROLS', panelX + 16, panelY + 10);
    ctx.font = "13px 'Courier New', monospace";
    const lines = [
      'Arrow Up/Down: forward/reverse thrust',
      'Arrow Left/Right: rotate',
      'Q: linear auto-brake, E: rotation auto-brake',
      'L: land when landing prompt appears',
      'M: toggle active missions panel',
      'Tab: cycle ship target, G: cycle landable target',
      'Z/X/C/V/B: fire weapon groups',
      'Esc: pause'
    ];
    let y = panelY + 44;
    for (const line of lines) {
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.fillText(`- ${line}`, panelX + 22, y);
      y += 22;
    }
    ctx.fillStyle = COLOURS.WARNING;
    ctx.fillText('Landing tip: toggle both auto-brakes before approach.', panelX + 16, panelY + panelHeight - 38);
    ctx.restore();
  }

  private drawPauseButton(
    ctx: CanvasRenderingContext2D,
    rect: { x: number; y: number; width: number; height: number },
    label: string,
    selected: boolean
  ): void {
    ctx.strokeStyle = selected ? COLOURS.UI_ACCENT : COLOURS.UI_SECONDARY;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.fillStyle = selected ? COLOURS.UI_PRIMARY : COLOURS.UI_SECONDARY;
    ctx.font = "16px 'Courier New', monospace";
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  }

  private activatePauseSelection(): void {
    if (this.pauseSelection === 0) {
      this.isPaused = false;
      this.showControlsOverlay = false;
      return;
    }
    if (this.pauseSelection === 1) {
      this.showControlsOverlay = !this.showControlsOverlay;
      return;
    }
    if (this.pauseSelection === 2) {
      this.pauseConfirmMainMenu = true;
      this.pauseSelection = 0;
      return;
    }
  }

  private returnToMainMenu(): void {
    this.worldState.saveToLocalStorage();
    this.isPaused = false;
    this.showControlsOverlay = false;
    this.pauseConfirmMainMenu = false;
    this.screenManager.popToRoot();
  }

  private inRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  private getCanvasPoint(event: MouseEvent): { x: number; y: number } | null {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }
    const scaleX = this.canvas.width / bounds.width;
    const scaleY = this.canvas.height / bounds.height;
    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY
    };
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
    const newHP = Math.max(0, this.playerShip.state.currentHullHP - damage);
    this.playerShip.state = {
      ...this.playerShip.state,
      currentHullHP: newHP
    };
    this.worldState.updatePlayerShipState({ currentHullHP: newHP });

    if (newHP <= 0) {
      this.handleShipDestruction();
    }
  }

  private updateEnergyAndShield(dt: number): void {
    if (!this.playerShip) {
      return;
    }
    const ship = this.playerShip.state;
    let updated = false;

    const reactorSlot = ship.equipmentSlots.find((s) => s.slotType === 'reactor');
    if (reactorSlot?.itemId) {
      const reactorItem = this.worldState.getEquipmentItem(reactorSlot.itemId);
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
    if (shieldSlot?.itemId && this.worldState.isShieldOnline()) {
      const shieldItem = this.worldState.getEquipmentItem(shieldSlot.itemId);
      if (shieldItem?.type === 'shield') {
        const shield = shieldItem as ShieldItem;
        ship.maxShieldHP = shield.shieldHP;
        const timeSinceHit = (Date.now() - ship.lastHitTime) / 1000;
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

    if (updated) {
      this.playerShip.state = ship;
      this.worldState.updatePlayerShipState(ship);
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
        currentHullHP: ship.maxHullHP,
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
    const starter = buildStarterShipState(this.worldState);
    const maxFuel = this.worldState.getMaxFuel();
    return {
      ...current,
      ...starter,
      fuel: maxFuel,
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
    return candidates[0]?.coord ?? this.worldState.getStartingConditions().sectorCoord;
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
