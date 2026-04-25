import { GameLoop } from '../core/gameLoop';
import { computeGravity } from '../physics/gravity';
import { pointInCircle } from '../physics/collision';
import { Vector2 } from '../physics/vector2';
import type { RenderPipeline } from '../renderer/renderPipeline';
import type { Camera } from '../renderer/camera';
import { PlayerController } from '../simulation/playerController';
import { ShipEntity } from '../simulation/shipEntity';
import type { Landable, ShipState } from '../types';
import {
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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly pipeline: RenderPipeline,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly screenManager: ScreenManager
  ) {}

  onEnter(): void {
    const testPlanet: Landable = {
      id: 'test_planet',
      name: 'Test Prime',
      type: 'planet',
      description: '',
      atmosphere: '',
      factionId: null,
      mass: 100000,
      radius: 60,
      position: new Vector2(400, -200),
      services: [],
      rotationSpeed: 0,
      seed: 12345
    };

    const playerShipState: ShipState = {
      id: 'player',
      hullSpecId: 'fighter_mk1',
      factionId: null,
      position: Vector2.zero(),
      velocity: Vector2.zero(),
      angle: 0,
      angularVelocity: 0,
      currentHP: 100,
      maxHP: 100,
      fuel: 1000,
      maxFuel: 1000,
      credits: 1000,
      cargo: [],
      equipmentSlots: [],
      weaponLoadout: [],
      activeMissions: [],
      brain: null,
      memoryCards: [],
      activeCardId: null,
      activeMode: null,
      guardMode: false,
      fleetRole: 'lead',
      targets: {},
      isPlayerControlled: true,
      insuranceActive: true,
      lastLandedLandableId: null
    };

    this.landables.length = 0;
    this.landables.push(testPlanet);
    this.playerController = new PlayerController();
    this.playerShip = new ShipEntity(playerShipState);

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
      landingCandidate: this.landingCandidate
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
    this.landableScreen = new LandableScreen(this.canvas, landable, this.playerShip, () => this.takeOff());
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
    this.isLanded = false;
    this.landedAt = null;
    this.landingCandidate = null;
    this.landableScreen = null;
    this.screenManager.pop();
  }
}
