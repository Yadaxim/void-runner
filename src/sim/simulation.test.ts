import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  INSURANCE_PAYOUT_FRACTION,
  INSURANCE_REPAIR_COST_FRACTION,
  TRANSIT_LOITER_RADIUS
} from '../constants';
import { buildStarterShipState, WorldState } from '../core/worldState';
import { Vector2 } from '../physics/vector2';
import { applyForce } from '../physics/newtonian';
import { tickShipEnergyAndShield } from './shipEnergyShield';
import { getAdjacentSectorCoord, playerSpawnPositionAfterCrossing, type SectorEdge } from './sectorNav';
import { makeHeadlessSim } from './headlessSim';
import { NPCController } from '../simulation/npcController';
import { ShipEntity } from '../simulation/shipEntity';
import type { ShipState, WorldFile } from '../types';
import { makeShipState } from '../test/fixtures';

function loadWorld(): WorldFile {
  return JSON.parse(readFileSync(join(process.cwd(), 'public/testWorld.json'), 'utf-8')) as WorldFile;
}

function sampleFactionIds(wf: WorldFile): { pirateId: string; lawfulId: string } {
  const pirate = wf.factions.find((f) => f.isPirate);
  const lawful = wf.factions.find((f) => !f.isPirate);
  if (!pirate || !lawful) {
    throw new Error('test world needs at least one pirate and one non-pirate faction');
  }
  return { pirateId: pirate.id, lawfulId: lawful.id };
}

describe('headless SectorSimulation', () => {
  it('ship reactor raises battery when below capacity', () => {
    const wf = loadWorld();
    const { worldState, playerShip } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: { currentJoules: 10, fuel: 500 }
    });
    const before = playerShip.state.currentJoules;
    tickShipEnergyAndShield(playerShip.state, worldState, 0.5, Date.now());
    expect(playerShip.state.currentJoules).toBeGreaterThan(before);
  });

  it('battery does not exceed reactor capacityJoules', () => {
    const wf = loadWorld();
    const { worldState, playerShip } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: { currentJoules: 299, fuel: 500 }
    });
    for (let i = 0; i < 50; i += 1) {
      tickShipEnergyAndShield(playerShip.state, worldState, 0.2, Date.now());
    }
    const reactor = worldState.getInstalledReactorItem();
    expect(reactor).toBeTruthy();
    expect(playerShip.state.currentJoules).toBeLessThanOrEqual(reactor!.capacityJoules + 1e-9);
  });

  it('fuel decreases at chargeRate × fuelPerJoule × dt when charging', () => {
    const wf = loadWorld();
    const { worldState, playerShip } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: { currentJoules: 0, fuel: 100 }
    });
    const reactor = worldState.getInstalledReactorItem()!;
    const fuel0 = playerShip.state.fuel;
    tickShipEnergyAndShield(playerShip.state, worldState, 1, Date.now());
    const generated = Math.min(reactor.chargeRateJoulesPerSecond * 1, reactor.capacityJoules);
    const expectedFuel = fuel0 - generated * reactor.fuelPerJoule;
    expect(playerShip.state.fuel).toBeCloseTo(expectedFuel, 5);
  });

  it('shield regen converts joules to HP using joulesPerHPRegen', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(20_000_000));
    const wf = loadWorld();
    const { worldState, playerShip } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: {
        currentShieldHP: 0,
        maxShieldHP: 80,
        shieldRebooting: false,
        lastHitTime: Date.now() - 100_000,
        currentJoules: 500
      }
    });
    const shield = worldState.getInstalledShieldItem()!;
    const joulesBefore = playerShip.state.currentJoules;
    tickShipEnergyAndShield(playerShip.state, worldState, 1, Date.now());
    const expectedHpGain = Math.min(
      shield.regenRateHPPerSecond * 1,
      shield.shieldHP - 0,
      joulesBefore / shield.joulesPerHPRegen
    );
    expect(playerShip.state.currentShieldHP).toBeCloseTo(expectedHpGain, 5);
    expect(playerShip.state.currentJoules).toBeCloseTo(joulesBefore - expectedHpGain * shield.joulesPerHPRegen, 5);
    vi.useRealTimers();
  });

  it('shield regen waits regenDelay after hit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000));
    const wf = loadWorld();
    const { worldState, playerShip } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: {
        currentShieldHP: 50,
        maxShieldHP: 80,
        shieldRebooting: false,
        lastHitTime: Date.now()
      }
    });
    const shield = worldState.getInstalledShieldItem()!;
    const hp0 = playerShip.state.currentShieldHP;
    tickShipEnergyAndShield(playerShip.state, worldState, 0.1, Date.now());
    expect(playerShip.state.currentShieldHP).toBe(hp0);
    vi.setSystemTime(new Date(1_000_000 + (shield.regenDelay - 0.1) * 1000));
    tickShipEnergyAndShield(playerShip.state, worldState, 0.1, Date.now());
    expect(playerShip.state.currentShieldHP).toBe(hp0);
    vi.setSystemTime(new Date(1_000_000 + shield.regenDelay * 1000));
    tickShipEnergyAndShield(playerShip.state, worldState, 0.5, Date.now());
    expect(playerShip.state.currentShieldHP).toBeGreaterThan(hp0);
    vi.useRealTimers();
  });

  it('shield regen does not run while shieldRebooting', () => {
    const wf = loadWorld();
    const { worldState, playerShip } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: {
        currentShieldHP: 10,
        shieldRebooting: true,
        shieldRebootTimer: 5,
        lastHitTime: 0
      }
    });
    const hp0 = playerShip.state.currentShieldHP;
    tickShipEnergyAndShield(playerShip.state, worldState, 1, Date.now());
    expect(playerShip.state.currentShieldHP).toBe(hp0);
  });

  it('shield reboot timer counts down and clears rebooting', () => {
    const wf = loadWorld();
    const { worldState, playerShip } = makeHeadlessSim({
      worldFile: wf,
      playerOverrides: {
        currentShieldHP: 0,
        shieldRebooting: true,
        shieldRebootTimer: 2,
        lastHitTime: 0
      }
    });
    tickShipEnergyAndShield(playerShip.state, worldState, 1, Date.now());
    expect(playerShip.state.shieldRebootTimer).toBeCloseTo(1);
    tickShipEnergyAndShield(playerShip.state, worldState, 1.1, Date.now());
    expect(playerShip.state.shieldRebooting).toBe(false);
    expect(playerShip.state.shieldRebootTimer).toBe(0);
  });

  it('hostile NPC decreases distance to player after aggro', () => {
    const wf = loadWorld();
    const { pirateId } = sampleFactionIds(wf);
    const ws = new WorldState(wf, { x: 5, y: 5 }, makeShipState({ id: 'player' }) as ShipState);
    ws.updatePlayerShipState(buildStarterShipState(ws));
    const player = new ShipEntity(ws.getPlayerShipState());
    player.state.position = new Vector2(0, 0);
    const hostileBase: ShipState = {
      ...ws.getPlayerShipState(),
      id: 'h1',
      isPlayerControlled: false,
      factionId: pirateId,
      position: new Vector2(0, 400),
      velocity: new Vector2(0, 0)
    };
    const hostile = new ShipEntity(hostileBase);
    hostile.attachNPCController(new NPCController('hostile', 9, pirateId), 'hostile');
    hostile.getNPCController()!.receiveAttack('player', null, 50);
    const d0 = Vector2.distance(hostile.state.position as Vector2, player.state.position as Vector2);
    for (let i = 0; i < 40; i += 1) {
      hostile.update(0.05, ws, undefined, { player, otherNPCs: [], landables: [] });
    }
    const d1 = Vector2.distance(hostile.state.position as Vector2, player.state.position as Vector2);
    expect(d1).toBeLessThan(d0);
  });

  it('transit NPC enters loiter when within TRANSIT_LOITER_RADIUS of target landable', () => {
    const wf = loadWorld();
    const sector = wf.sectors.find((s) => s.coord.x === 5 && s.coord.y === 4)!;
    const landables = sector.landables.map((l) => ({
      ...l,
      position: new Vector2((l.position as { x: number; y: number }).x, (l.position as { x: number; y: number }).y)
    }));
    const land = landables[0];
    const pos = land.position as Vector2;
    const ws = new WorldState(wf, sector.coord, makeShipState({ id: 'npc_t' }) as ShipState);
    ws.updatePlayerShipState(buildStarterShipState(ws));
    const player = new ShipEntity(ws.getPlayerShipState());
    const { lawfulId } = sampleFactionIds(wf);
    const npcState: ShipState = {
      ...ws.getPlayerShipState(),
      id: 'npc_transit',
      isPlayerControlled: false,
      factionId: lawfulId,
      position: pos,
      velocity: new Vector2(0, 0)
    };
    const npc = new ShipEntity(npcState);
    npc.attachNPCController(new NPCController('transit', 42, lawfulId), 'transit');
    expect(TRANSIT_LOITER_RADIUS).toBeGreaterThan(0);
    npc.update(0.016, ws, undefined, {
      player,
      otherNPCs: [],
      landables
    });
    expect(npc.getNPCController()?.getDebugModeLabel()).toContain('loiter');
  });

  it('spawn counts never exceed maxPresent over many ticks', () => {
    const wf = loadWorld();
    const { sectorSimulation } = makeHeadlessSim({ worldFile: wf, sectorCoord: { x: 5, y: 5 } });
    for (let i = 0; i < 1000; i += 1) {
      sectorSimulation.update(0.05);
      for (const row of sectorSimulation.getSpawnRuleDebugRows()) {
        expect(row.currentCount).toBeLessThanOrEqual(row.maxPresent);
      }
    }
  });

  it('aggro target stays on higher-threat NPC when player is closer', () => {
    const wf = loadWorld();
    const { pirateId, lawfulId } = sampleFactionIds(wf);
    const ws = new WorldState(wf, { x: 5, y: 5 }, makeShipState({ id: 'player' }) as ShipState);
    ws.updatePlayerShipState(buildStarterShipState(ws));
    const player = new ShipEntity(ws.getPlayerShipState());
    player.state.position = new Vector2(0, 0);
    const farTarget = new ShipEntity(
      makeShipState({
        id: 'npc_far',
        isPlayerControlled: false,
        factionId: pirateId,
        position: new Vector2(0, 800),
        velocity: new Vector2(0, 0)
      })
    );
    const hostile = new ShipEntity(
      makeShipState({
        id: 'npc_hostile',
        isPlayerControlled: false,
        factionId: lawfulId,
        position: new Vector2(0, 100),
        velocity: new Vector2(0, 0)
      })
    );
    hostile.attachNPCController(new NPCController('patrol', 2, lawfulId), 'patrol');
    const ctl = hostile.getNPCController()!;
    ctl.receiveAttack('npc_far', pirateId, 100);
    expect(ctl.getAggroTargetId()).toBe('npc_far');
    for (let i = 0; i < 5; i += 1) {
      hostile.update(0.05, ws, undefined, {
        player,
        otherNPCs: [farTarget],
        landables: []
      });
    }
    expect(ctl.getAggroTargetId()).toBe('npc_far');
  });

  it('cannot sell required thruster_forward slot', () => {
    const wf = loadWorld();
    wf.startingConditions.hullSpecId = 'dogfighter_mk1';
    wf.startingConditions.equipmentSlots = [];
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }) as ShipState);
    ws.updatePlayerShipState(buildStarterShipState(ws));
    const before = structuredClone(ws.getPlayerShipState());
    const res = ws.sellFromSlot('thruster_forward', 0);
    expect(res.success).toBe(false);
    expect(ws.getPlayerShipState()).toEqual(before);
  });

  it('cargo mass reduces linear acceleration from equal force', () => {
    const wf = loadWorld();
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }) as ShipState);
    ws.updatePlayerShipState(buildStarterShipState(ws));
    const light = structuredClone(ws.getPlayerShipState());
    const heavy = structuredClone(ws.getPlayerShipState());
    heavy.cargo = [{ missionId: 'x', description: 'rock', weight: 1000 }];
    const f = new Vector2(1000, 0);
    const mLight = new ShipEntity(light).getEffectiveMass(ws);
    const mHeavy = new ShipEntity(heavy).getEffectiveMass(ws);
    const vL = applyForce(new Vector2(0, 0), f, mLight, 1);
    const vH = applyForce(new Vector2(0, 0), f, mHeavy, 1);
    expect(vH.magnitude() / vL.magnitude()).toBeCloseTo(mLight / mHeavy, 5);
  });

  it('insurance option A deducts 10% of ship value from credits', () => {
    const shipValue = 1000;
    const cost = Math.ceil(shipValue * INSURANCE_REPAIR_COST_FRACTION);
    expect(cost).toBe(100);
    expect(5000 - cost).toBe(4900);
  });

  it('insurance option B pays 90% of ship value', () => {
    const shipValue = 1000;
    expect(Math.floor(shipValue * INSURANCE_PAYOUT_FRACTION)).toBe(900);
  });

  it('save → load round-trip preserves key player fields', () => {
    const store: Record<string, string> = {};
    const ls = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length;
      }
    };
    vi.stubGlobal('localStorage', ls as Storage);
    const wf = loadWorld();
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }) as ShipState);
    ws.updatePlayerShipState(buildStarterShipState(ws));
    ws.updatePlayerShipState({ credits: 12345 });
    ws.saveToLocalStorage();
    const loaded = WorldState.loadFromLocalStorage(wf, ws.getActiveSaveId());
    expect(loaded).not.toBeNull();
    expect(loaded!.getPlayerShipState().credits).toBe(12345);
    expect(loaded!.getPlayerShipState().hullSpecId).toBe(ws.getPlayerShipState().hullSpecId);
    vi.unstubAllGlobals();
  });

  it('getRadiationIntensityAtCoord matches current sector intensity', () => {
    const wf = loadWorld();
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }) as ShipState);
    const c = ws.getCurrentSectorCoord();
    expect(ws.getRadiationIntensityAtCoord(c)).toBe(ws.getRadiationIntensity());
  });

  it('armHyperspaceCooldownFromEquippedDrive uses equipped drive cooldown seconds', () => {
    const wf = loadWorld();
    wf.startingConditions.hullSpecId = 'courier_transport_mk1';
    wf.startingConditions.equipmentSlots = [];
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }) as ShipState);
    ws.updatePlayerShipState(buildStarterShipState(ws));
    const drive = ws.getPlayerHyperspaceDrive();
    expect(drive).not.toBeNull();
    ws.addPlayTime(50);
    ws.armHyperspaceCooldownFromEquippedDrive();
    expect(ws.getHyperspaceCooldownRemainingSeconds()).toBeCloseTo(drive!.cooldown, 5);
  });

  it('save → load preserves hyperspace cooldown until play time', () => {
    const store: Record<string, string> = {};
    const ls = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length;
      }
    };
    vi.stubGlobal('localStorage', ls as Storage);
    const wf = loadWorld();
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }) as ShipState);
    ws.addPlayTime(100);
    ws.armHyperspaceCooldown(30);
    ws.saveToLocalStorage();
    const loaded = WorldState.loadFromLocalStorage(wf, ws.getActiveSaveId());
    expect(loaded?.getHyperspaceCooldownRemainingSeconds()).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('save → load preserves hyperspace target coord', () => {
    const store: Record<string, string> = {};
    const ls = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length;
      }
    };
    vi.stubGlobal('localStorage', ls as Storage);
    const wf = loadWorld();
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }) as ShipState);
    ws.setHyperspaceTargetCoord({ x: 3, y: -2 });
    ws.saveToLocalStorage();
    const loaded = WorldState.loadFromLocalStorage(wf, ws.getActiveSaveId());
    expect(loaded?.getHyperspaceTargetCoord()).toEqual({ x: 3, y: -2 });
    vi.unstubAllGlobals();
  });

  it('two careers for the same world keep independent save slots', () => {
    const store: Record<string, string> = {};
    const ls = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length;
      }
    };
    vi.stubGlobal('localStorage', ls as Storage);
    const wf = loadWorld();
    const coord = wf.startingConditions.sectorCoord;
    const wsA = new WorldState(wf, coord, makeShipState({ id: 'player' }) as ShipState, {
      activeSaveId: 'career-a'
    });
    wsA.updatePlayerShipState(buildStarterShipState(wsA));
    wsA.updatePlayerShipState({ credits: 111 });
    wsA.setPilotName('Alpha');
    wsA.saveToLocalStorage();
    const wsB = new WorldState(wf, coord, makeShipState({ id: 'player' }) as ShipState, {
      activeSaveId: 'career-b'
    });
    wsB.updatePlayerShipState(buildStarterShipState(wsB));
    wsB.updatePlayerShipState({ credits: 222 });
    wsB.setPilotName('Beta');
    wsB.saveToLocalStorage();
    const list = WorldState.listSaves().filter((s) => s.worldSeed === wf.metadata.seed);
    expect(list.length).toBe(2);
    const loadedA = WorldState.loadFromLocalStorage(wf, 'career-a');
    const loadedB = WorldState.loadFromLocalStorage(wf, 'career-b');
    expect(loadedA?.getPlayerShipState().credits).toBe(111);
    expect(loadedB?.getPlayerShipState().credits).toBe(222);
    expect(loadedA?.getPilotName()).toBe('Alpha');
    expect(loadedB?.getPilotName()).toBe('Beta');
    WorldState.deleteSave(wf.metadata.seed, 'career-a');
    expect(WorldState.loadFromLocalStorage(wf, 'career-a')).toBeNull();
    expect(WorldState.loadFromLocalStorage(wf, 'career-b')).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it('sector edge crossing updates coord and position for all 4 directions', () => {
    const wf = loadWorld();
    const start = { x: 5, y: 5 };
    const ws = new WorldState(wf, start, makeShipState({ id: 'player' }) as ShipState);
    ws.updatePlayerShipState(buildStarterShipState(ws));
    const edges: SectorEdge[] = ['north', 'south', 'east', 'west'];
    for (const edge of edges) {
      ws.setCurrentSector(start);
      const prev = new Vector2(100, 200);
      ws.updatePlayerShipState({ position: prev });
      const nextCoord = getAdjacentSectorCoord(
        ws.getCurrentSectorCoord(),
        edge,
        ws.getGridWidth(),
        ws.getGridHeight()
      );
      const nextPos = playerSpawnPositionAfterCrossing(edge, prev);
      ws.setCurrentSector(nextCoord);
      ws.updatePlayerShipState({ position: nextPos });
      expect(ws.getCurrentSectorCoord()).toEqual(nextCoord);
      expect(ws.getSector(nextCoord)).toBeTruthy();
      if (edge === 'east' || edge === 'west') {
        expect(ws.getPlayerShipState().position.y).toBeCloseTo(prev.y);
      } else {
        expect(ws.getPlayerShipState().position.x).toBeCloseTo(prev.x);
      }
    }
  });
});
