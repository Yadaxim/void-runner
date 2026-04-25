import { GameLoop } from '../core/gameLoop';
import { WorldState } from '../core/worldState';
import { computeGravity } from '../physics/gravity';
import { pointInCircle } from '../physics/collision';
import { Vector2 } from '../physics/vector2';
import type { RenderPipeline } from '../renderer/renderPipeline';
import type { Camera } from '../renderer/camera';
import { PlayerController } from '../simulation/playerController';
import { ShipEntity } from '../simulation/shipEntity';
import type { Landable } from '../types';
import {
  AUTOSAVE_INTERVAL_SECONDS,
  LANDING_RADIUS_MULTIPLIER,
  LANDING_SPEED_THRESHOLD,
  PLACEHOLDER_SHIP_MASS,
  TAKEOFF_VELOCITY
} from '../constants';
import { LandableScreen } from './landableScreen';
import { ScreenManager, type Screen } from './screenManager';

export class FlightScreen implements Screen {
  private gameLoop: GameLoop | null = null;

  private playerController: PlayerController | null = null;

  private playerShip: ShipEntity | null = null;

  private readonly otherShips: ShipEntity[] = [];

  private readonly landables: Landable[] = [];
  private landingCandidate: Landable | null = null;
  private isLanded = false;
  private landedAt: Landable | null = null;
  private landableScreen: LandableScreen | null = null;
  private lastKnownShipPosition: Vector2 = Vector2.zero();
  private lastDt = 0;
  private autosaveAccumulator = 0;
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
      nebulaIntensity: currentSector.ambientVisuals.nebulaIntensity
    });
    this.landables.length = 0;
    this.landables.push(...this.worldState.getLandablesInCurrentSector());
    this.worldState.markVisited(currentSector.coord);
    this.playerController = new PlayerController();
    this.playerShip = new ShipEntity(this.worldState.getPlayerShipState());
    this.otherShips.length = 0;
    this.autosaveAccumulator = 0;
    window.addEventListener('beforeunload', this.onBeforeUnload);

    this.gameLoop = new GameLoop({
      update: (dt: number) => this.update(dt),
      render: () => this.render(this.ctx)
    });
    this.gameLoop.start();
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
    const inputs = this.playerController.update();
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
    this.worldState.updatePlayerShipState({
      position: this.playerShip.state.position,
      velocity: this.playerShip.state.velocity,
      angle: this.playerShip.state.angle,
      angularVelocity: this.playerShip.state.angularVelocity,
      fuel: this.playerShip.state.fuel,
      credits: this.playerShip.state.credits,
      lastLandedLandableId: this.playerShip.state.lastLandedLandableId
    });
    this.autosaveAccumulator += dt;
    if (this.autosaveAccumulator >= AUTOSAVE_INTERVAL_SECONDS) {
      this.worldState.saveToLocalStorage();
      this.autosaveAccumulator = 0;
    }
    this.checkLandingConditions(inputs.landPressed);
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
      camera,
      landingCandidate: this.landingCandidate,
      worldState: this.worldState,
      dt: this.lastDt
    });
    this.landableScreen?.render(this.ctx);
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
