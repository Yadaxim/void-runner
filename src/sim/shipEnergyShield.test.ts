import { describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../core/worldState';
import type { EquipmentItem, ShipState } from '../types';
import { makeReactor, makeShield, makeShipState } from '../test/fixtures';
import { tickShipEnergyAndShield } from './shipEnergyShield';

function mockWorldState(
  catalog: Map<string, EquipmentItem>,
  shieldOnline: boolean
): WorldState {
  return {
    getEquipmentItem: (id: string) => catalog.get(id) ?? null,
    isShieldOnlineForShip: (_ship: ShipState) => shieldOnline
  } as unknown as WorldState;
}

describe('tickShipEnergyAndShield (player and NPC ship state)', () => {
  it.each([
    [true, 'player'],
    [false, 'npc_energy']
  ])('reactor charges battery from fuel (isPlayerControlled=%s)', (isPlayer, id) => {
    const reactor = makeReactor({ id: 'r1', capacityJoules: 500, chargeRate: 40, fuelPerJoule: 0.002 });
    const cat = new Map<string, EquipmentItem>([['r1', reactor]]);
    const ws = mockWorldState(cat, true);
    const ship = makeShipState({
      id,
      isPlayerControlled: isPlayer,
      currentJoules: 10,
      fuel: 500,
      equipmentSlots: [{ slotType: 'reactor', itemId: 'r1' }]
    });
    const before = ship.currentJoules;
    tickShipEnergyAndShield(ship, ws, 0.5, Date.now());
    expect(ship.currentJoules).toBeGreaterThan(before);
  });

  it.each([
    [true, 'player'],
    [false, 'npc_shield']
  ])('shield regen converts joules to HP after regenDelay (isPlayerControlled=%s)', (isPlayer, id) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(20_000_000));
    const reactor = makeReactor({ id: 'r2', capacityJoules: 500, chargeRate: 100, fuelPerJoule: 0.001 });
    const shield = makeShield({
      id: 's2',
      capacity: 80,
      regenDelay: 1,
      rebootTime: 8,
      joulesPerHPRegen: 10,
      regenRateHPPerSecond: 20
    });
    const cat = new Map<string, EquipmentItem>([
      ['r2', reactor],
      ['s2', shield]
    ]);
    const ws = mockWorldState(cat, true);
    const ship = makeShipState({
      id,
      isPlayerControlled: isPlayer,
      currentShieldHP: 0,
      maxShieldHP: 80,
      shieldRebooting: false,
      lastHitTime: Date.now() - 100_000,
      currentJoules: 500,
      fuel: 200,
      equipmentSlots: [
        { slotType: 'reactor', itemId: 'r2' },
        { slotType: 'shield', itemId: 's2' }
      ]
    });
    const joulesBefore = ship.currentJoules;
    tickShipEnergyAndShield(ship, ws, 1, Date.now());
    const expectedHpGain = Math.min(
      shield.regenRateHPPerSecond * 1,
      shield.shieldHP - 0,
      joulesBefore / shield.joulesPerHPRegen
    );
    expect(ship.currentShieldHP).toBeCloseTo(expectedHpGain, 5);
    expect(ship.currentJoules).toBeCloseTo(joulesBefore - expectedHpGain * shield.joulesPerHPRegen, 5);
    vi.useRealTimers();
  });

  it.each([
    [true, 'player'],
    [false, 'npc_reboot']
  ])('shield reboot timer counts down and clears rebooting flag (isPlayerControlled=%s)', (isPlayer, id) => {
    const reactor = makeReactor({ id: 'r_re' });
    const shield = makeShield({ id: 's_re' });
    const cat = new Map<string, EquipmentItem>([
      ['r_re', reactor],
      ['s_re', shield]
    ]);
    const ws = mockWorldState(cat, true);
    const ship = makeShipState({
      id,
      isPlayerControlled: isPlayer,
      shieldRebooting: true,
      shieldRebootTimer: 2,
      currentJoules: 100,
      fuel: 50,
      equipmentSlots: [
        { slotType: 'reactor', itemId: 'r_re' },
        { slotType: 'shield', itemId: 's_re' }
      ]
    });
    tickShipEnergyAndShield(ship, ws, 0.5, Date.now());
    expect(ship.shieldRebootTimer).toBeCloseTo(1.5);
    expect(ship.shieldRebooting).toBe(true);
    tickShipEnergyAndShield(ship, ws, 2, Date.now());
    expect(ship.shieldRebooting).toBe(false);
    expect(ship.shieldRebootTimer).toBe(0);
  });

  it.each([
    [true, 'player'],
    [false, 'npc_noreact']
  ])('ship without reactor slot drains joules to zero (isPlayerControlled=%s)', (isPlayer, id) => {
    const ws = mockWorldState(new Map(), true);
    const ship = makeShipState({
      id,
      isPlayerControlled: isPlayer,
      currentJoules: 50,
      fuel: 100,
      equipmentSlots: []
    });
    tickShipEnergyAndShield(ship, ws, 0.1, Date.now());
    expect(ship.currentJoules).toBe(0);
  });

  it('does not regen shield when isShieldOnlineForShip is false', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(20_000_000));
    const reactor = makeReactor({ id: 'r3' });
    const shield = makeShield({ id: 's3', regenDelay: 0 });
    const cat = new Map<string, EquipmentItem>([
      ['r3', reactor],
      ['s3', shield]
    ]);
    const ws = mockWorldState(cat, false);
    const ship = makeShipState({
      currentShieldHP: 0,
      maxShieldHP: 80,
      shieldRebooting: false,
      lastHitTime: 0,
      currentJoules: 500,
      fuel: 200,
      equipmentSlots: [
        { slotType: 'reactor', itemId: 'r3' },
        { slotType: 'shield', itemId: 's3' }
      ]
    });
    tickShipEnergyAndShield(ship, ws, 1, Date.now());
    expect(ship.currentShieldHP).toBe(0);
    vi.useRealTimers();
  });

  it('does not charge reactor when battery already at capacity', () => {
    const reactor = makeReactor({ id: 'r_cap', capacityJoules: 200, chargeRate: 50, fuelPerJoule: 0.01 });
    const cat = new Map<string, EquipmentItem>([['r_cap', reactor]]);
    const ws = mockWorldState(cat, true);
    const ship = makeShipState({
      currentJoules: 200,
      fuel: 100,
      equipmentSlots: [{ slotType: 'reactor', itemId: 'r_cap' }]
    });
    tickShipEnergyAndShield(ship, ws, 1, Date.now());
    expect(ship.currentJoules).toBe(200);
    expect(ship.fuel).toBe(100);
  });

  it('does not charge reactor when fuel is insufficient for the joule chunk', () => {
    const reactor = makeReactor({ id: 'r_lowf', capacityJoules: 1000, chargeRate: 500, fuelPerJoule: 0.01 });
    const cat = new Map<string, EquipmentItem>([['r_lowf', reactor]]);
    const ws = mockWorldState(cat, true);
    const ship = makeShipState({
      currentJoules: 0,
      fuel: 0.5,
      equipmentSlots: [{ slotType: 'reactor', itemId: 'r_lowf' }]
    });
    tickShipEnergyAndShield(ship, ws, 1, Date.now());
    expect(ship.currentJoules).toBe(0);
    expect(ship.fuel).toBe(0.5);
  });

  it('syncs maxShieldHP from equipped shield item while shield path runs', () => {
    const shield = makeShield({ id: 's_sync', capacity: 120 });
    const cat = new Map<string, EquipmentItem>([['s_sync', shield]]);
    const ws = mockWorldState(cat, true);
    const ship = makeShipState({
      currentShieldHP: 40,
      maxShieldHP: 10,
      shieldRebooting: false,
      lastHitTime: 0,
      currentJoules: 0,
      equipmentSlots: [{ slotType: 'shield', itemId: 's_sync' }]
    });
    tickShipEnergyAndShield(ship, ws, 0.016, Date.now());
    expect(ship.maxShieldHP).toBe(120);
  });

  it('does not regen shield until regenDelay elapsed since lastHitTime', () => {
    vi.useFakeTimers();
    const t0 = 30_000_000;
    vi.setSystemTime(new Date(t0));
    const reactor = makeReactor({ id: 'r_del' });
    const shield = makeShield({ id: 's_del', capacity: 50, regenDelay: 3, joulesPerHPRegen: 1, regenRateHPPerSecond: 100 });
    const cat = new Map<string, EquipmentItem>([
      ['r_del', reactor],
      ['s_del', shield]
    ]);
    const ws = mockWorldState(cat, true);
    const ship = makeShipState({
      currentShieldHP: 0,
      maxShieldHP: 50,
      shieldRebooting: false,
      lastHitTime: t0 - 1000,
      currentJoules: 500,
      fuel: 50,
      equipmentSlots: [
        { slotType: 'reactor', itemId: 'r_del' },
        { slotType: 'shield', itemId: 's_del' }
      ]
    });
    tickShipEnergyAndShield(ship, ws, 1, t0);
    expect(ship.currentShieldHP).toBe(0);
    vi.useRealTimers();
  });

  it('does not spend joules on shield regen when joules below full tick cost', () => {
    vi.useFakeTimers();
    const t0 = 40_000_000;
    vi.setSystemTime(new Date(t0));
    const reactor = makeReactor({ id: 'r_j' });
    const shield = makeShield({
      id: 's_j',
      capacity: 100,
      regenDelay: 0,
      joulesPerHPRegen: 100,
      regenRateHPPerSecond: 50
    });
    const cat = new Map<string, EquipmentItem>([
      ['r_j', reactor],
      ['s_j', shield]
    ]);
    const ws = mockWorldState(cat, true);
    const ship = makeShipState({
      currentShieldHP: 0,
      maxShieldHP: 100,
      shieldRebooting: false,
      lastHitTime: t0 - 60_000,
      currentJoules: 30,
      fuel: 0,
      equipmentSlots: [
        { slotType: 'reactor', itemId: 'r_j' },
        { slotType: 'shield', itemId: 's_j' }
      ]
    });
    tickShipEnergyAndShield(ship, ws, 1, t0);
    expect(ship.currentShieldHP).toBe(0);
    expect(ship.currentJoules).toBe(30);
    vi.useRealTimers();
  });

  it('clamps currentShieldHP to max when shield is offline', () => {
    const ws = mockWorldState(new Map(), false);
    const ship = makeShipState({
      currentShieldHP: 90,
      maxShieldHP: 40,
      equipmentSlots: [{ slotType: 'shield', itemId: 's_x' }]
    });
    tickShipEnergyAndShield(ship, ws, 0.1, Date.now());
    expect(ship.currentShieldHP).toBe(40);
  });

  it.each([
    [true, 'player'],
    [false, 'npc_upd']
  ])('returns true when reactor mutates state (isPlayerControlled=%s)', (isPlayer, id) => {
    const reactor = makeReactor({ id: 'r_u', capacityJoules: 300, chargeRate: 200, fuelPerJoule: 0.001 });
    const cat = new Map<string, EquipmentItem>([['r_u', reactor]]);
    const ws = mockWorldState(cat, true);
    const ship = makeShipState({
      id,
      isPlayerControlled: isPlayer,
      currentJoules: 0,
      fuel: 100,
      equipmentSlots: [{ slotType: 'reactor', itemId: 'r_u' }]
    });
    expect(tickShipEnergyAndShield(ship, ws, 0.5, Date.now())).toBe(true);
  });
});
