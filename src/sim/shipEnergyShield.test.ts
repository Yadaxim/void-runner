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
});
