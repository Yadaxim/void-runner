import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildStarterShipState, WorldState } from '../core/worldState';
import { Vector2 } from '../physics/vector2';
import { makeShipState } from '../test/fixtures';
import type { GridCoord, ShipState, WorldFile } from '../types';
import { validateWorldFile } from '../world/validation';
import { SectorSimulation } from '../simulation/sector';
import { ShipEntity } from '../simulation/shipEntity';

export function loadTestWorldFile(): WorldFile {
  const path = join(process.cwd(), 'public/testWorld.json');
  const wf = JSON.parse(readFileSync(path, 'utf-8')) as WorldFile;
  const r = validateWorldFile(wf);
  if (!r.ok) {
    const lines = r.errors.map((e) => `  • ${e}`).join('\n');
    throw new Error(`testWorld.json failed validation (fix JSON or validation rules):\n${lines}`);
  }
  return wf;
}

export interface HeadlessSimOptions {
  worldFile: WorldFile;
  sectorCoord?: GridCoord;
  /** Applied after starter ship is built from world starting conditions. */
  playerOverrides?: Partial<ShipState>;
}

/**
 * Headless sector sim: player `ShipEntity` shares state reference with `WorldState.getPlayerShipState()`.
 */
export function makeHeadlessSim(opts: HeadlessSimOptions): {
  worldState: WorldState;
  sectorSimulation: SectorSimulation;
  playerShip: ShipEntity;
} {
  const { worldFile, sectorCoord, playerOverrides } = opts;
  const coord = sectorCoord ?? worldFile.startingConditions.sectorCoord;
  const rawSector =
    worldFile.sectors.find((s) => s.coord.x === coord.x && s.coord.y === coord.y) ?? worldFile.sectors[0];
  const sector = {
    ...rawSector,
    landables: rawSector.landables.map((l) => ({
      ...l,
      position: new Vector2(
        (l.position as { x: number; y: number }).x,
        (l.position as { x: number; y: number }).y
      )
    }))
  };
  const ws = new WorldState(
    worldFile,
    coord,
    makeShipState({ id: 'player', hullSpecId: worldFile.startingConditions.hullSpecId }) as ShipState
  );
  ws.updatePlayerShipState(buildStarterShipState(ws));
  if (playerOverrides) {
    ws.updatePlayerShipState(playerOverrides);
  }
  const playerShip = new ShipEntity(ws.getPlayerShipState());
  const sectorSimulation = new SectorSimulation(sector, playerShip, ws, worldFile.metadata.seed);
  sectorSimulation.spawnNPCs();
  return { worldState: ws, sectorSimulation, playerShip };
}
