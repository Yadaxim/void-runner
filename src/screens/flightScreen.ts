import { GameLoop } from '../core/gameLoop';
import { computeGravity } from '../physics/gravity';
import { Vector2 } from '../physics/vector2';
import type { RenderPipeline } from '../renderer/renderPipeline';
import type { Camera } from '../renderer/camera';
import { PlayerController } from '../simulation/playerController';
import { ShipEntity } from '../simulation/shipEntity';
import type { Landable, ShipState } from '../types';
import { PLACEHOLDER_SHIP_MASS } from '../constants';
import type { Screen } from './screenManager';

export class FlightScreen implements Screen {
  private gameLoop: GameLoop | null = null;

  private playerController: PlayerController | null = null;

  private playerShip: ShipEntity | null = null;

  private readonly otherShips: ShipEntity[] = [];

  private readonly landables: Landable[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly pipeline: RenderPipeline,
    private readonly ctx: CanvasRenderingContext2D
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
      fuel: 100,
      maxFuel: 100,
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
      insuranceActive: true
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

    const inputs = this.playerController.update();
    this.playerShip.applyThrusterInputs(inputs);
    const gravity = computeGravity(
      this.playerShip.state.position as Vector2,
      PLACEHOLDER_SHIP_MASS,
      this.landables.map((landable) => ({ position: landable.position as Vector2, mass: landable.mass }))
    );
    this.playerShip.applyExternalForce(gravity);
    this.playerShip.update(dt);
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
      camera
    });
  }
}
