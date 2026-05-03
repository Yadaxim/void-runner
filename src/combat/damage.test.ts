// Exercises resolveShipBulletDamage and applyPlasmaDotToShip (shared player + NPC resolution).
// getDamageTypeKey from src/types/bullet.ts (void category is `void` in code, not `voidtype`).
import { describe, expect, it } from 'vitest';
import type { BulletSpec, DamageCategory, EquipmentItem, MatterType } from '../types';
import { getDamageTypeKey } from '../types';
import { applyPlasmaDotToShip, resolveShipBulletDamage, type ShipDamageWorldView } from './damage';
import { makeArmour, makeBullet, makeShipState, makeShield } from '../test/fixtures';

const MATRIX: Array<{ category: DamageCategory; matter: MatterType; key: string }> = [
  { category: 'kinetic', matter: 'normal', key: 'kinetic' },
  { category: 'kinetic', matter: 'anti', key: 'antimatter_kinetic' },
  { category: 'kinetic', matter: 'dark', key: 'darkmatter_kinetic' },
  { category: 'explosive', matter: 'normal', key: 'explosive' },
  { category: 'explosive', matter: 'anti', key: 'antimatter_explosive' },
  { category: 'explosive', matter: 'dark', key: 'darkmatter_explosive' },
  { category: 'laser', matter: 'normal', key: 'laser' },
  { category: 'laser', matter: 'anti', key: 'anti_photon_laser' },
  { category: 'laser', matter: 'dark', key: 'dark_energy_laser' },
  { category: 'plasma', matter: 'normal', key: 'plasma' },
  { category: 'plasma', matter: 'anti', key: 'antimatter_plasma' },
  { category: 'plasma', matter: 'dark', key: 'darkmatter_plasma' },
  { category: 'void', matter: 'normal', key: 'void' }
];

function viewShieldOnline(online: boolean, catalog: Map<string, EquipmentItem>): ShipDamageWorldView {
  return {
    isShieldOnline: () => online,
    getEquipmentItem: (id) => catalog.get(id) ?? null
  };
}

describe('getDamageTypeKey', () => {
  it.each(MATRIX)('$category/$matter → $key', ({ category, matter, key }) => {
    expect(getDamageTypeKey(category, matter as MatterType)).toBe(key);
  });

  it('rejects void + anti / void + dark', () => {
    expect(() => getDamageTypeKey('void', 'anti')).toThrow(/Invalid damage type combination/);
    expect(() => getDamageTypeKey('void', 'dark')).toThrow(/Invalid damage type combination/);
  });

  it('is pure for identical inputs', () => {
    const a = getDamageTypeKey('plasma', 'anti');
    const b = getDamageTypeKey('plasma', 'anti');
    expect(a).toBe(b);
  });
});

describe('resolveShipBulletDamage', () => {
  const shield = makeShield({ id: 'sh', capacity: 100, rebootTime: 12, regenDelay: 2, joulesPerHPRegen: 1 });
  const armour = makeArmour({ id: 'ar', layers: { kinetic: 0 } });

  function cat(): Map<string, EquipmentItem> {
    return new Map<string, EquipmentItem>([
      ['sh', shield],
      ['ar', armour]
    ]);
  }

  it.each([
    [true, 'player'],
    [false, 'npc_hostile']
  ])('shield absorbs when HP > damage; armour untouched (isPlayer=%s)', (isPlayer, id) => {
    const ship = makeShipState({
      id,
      isPlayerControlled: isPlayer,
      currentShieldHP: 100,
      maxShieldHP: 100,
      shieldRebooting: false,
      armourLayers: [{ itemId: 'ar', currentHP: 50, maxHP: 50 }],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'ar' }
      ]
    });
    const bullet = makeBullet({ damage: 20, damageType: { category: 'kinetic', matter: 'normal' } });
    resolveShipBulletDamage(bullet as BulletSpec, ship, viewShieldOnline(true, cat()));
    expect(ship.currentShieldHP).toBe(80);
    expect(ship.armourLayers[0].currentHP).toBe(50);
  });

  it('shield exactly depleted; armour untouched', () => {
    const ship = makeShipState({
      currentShieldHP: 20,
      armourLayers: [{ itemId: 'ar', currentHP: 50, maxHP: 50 }],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'ar' }
      ]
    });
    const bullet = makeBullet({ damage: 20 });
    resolveShipBulletDamage(bullet as BulletSpec, ship, viewShieldOnline(true, cat()));
    expect(ship.currentShieldHP).toBe(0);
    expect(ship.armourLayers[0].currentHP).toBe(50);
  });

  it('partial shield: excess damage is lost, not applied to armour', () => {
    const ship = makeShipState({
      currentShieldHP: 10,
      armourLayers: [{ itemId: 'ar', currentHP: 50, maxHP: 50 }],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'ar' }
      ]
    });
    resolveShipBulletDamage(makeBullet({ damage: 40 }) as BulletSpec, ship, viewShieldOnline(true, cat()));
    expect(ship.currentShieldHP).toBe(0);
    expect(ship.armourLayers[0].currentHP).toBe(50);
  });

  it.each([
    [true, 'player'],
    [false, 'npc_1']
  ])('shield at 0 and offline path: damage hits armour layer 0 (isPlayer=%s)', (isPlayer, id) => {
    const ship = makeShipState({
      id,
      isPlayerControlled: isPlayer,
      currentShieldHP: 0,
      shieldRebooting: false,
      armourLayers: [{ itemId: 'ar', currentHP: 50, maxHP: 50 }],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'ar' }
      ]
    });
    resolveShipBulletDamage(makeBullet({ damage: 15 }) as BulletSpec, ship, viewShieldOnline(false, cat()));
    expect(ship.armourLayers[0].currentHP).toBe(35);
  });

  it('armour reduction >= damage → 0 effective, layer HP unchanged', () => {
    const heavy = makeArmour({ id: 'ar2', layers: { kinetic: 100 } });
    const m = new Map<string, EquipmentItem>([
      ['sh', shield],
      ['ar2', heavy]
    ]);
    const ship = makeShipState({
      currentShieldHP: 0,
      shieldRebooting: true,
      armourLayers: [{ itemId: 'ar2', currentHP: 50, maxHP: 50 }],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'ar2' }
      ]
    });
    resolveShipBulletDamage(makeBullet({ damage: 10 }) as BulletSpec, ship, viewShieldOnline(false, m));
    expect(ship.armourLayers[0].currentHP).toBe(50);
  });

  it('negative reduction increases effective damage', () => {
    const vuln = makeArmour({ id: 'ar3', layers: { kinetic: -5 } });
    const m = new Map<string, EquipmentItem>([
      ['sh', shield],
      ['ar3', vuln]
    ]);
    const ship = makeShipState({
      currentShieldHP: 0,
      shieldRebooting: true,
      armourLayers: [{ itemId: 'ar3', currentHP: 50, maxHP: 50 }],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'ar3' }
      ]
    });
    resolveShipBulletDamage(makeBullet({ damage: 10 }) as BulletSpec, ship, viewShieldOnline(false, m));
    expect(ship.armourLayers[0].currentHP).toBe(35);
  });

  it('full layer depletion does not carry to next layer same hit', () => {
    const a1 = makeArmour({ id: 'a1', layers: { kinetic: 0 }, hpBonus: 10 });
    const a2 = makeArmour({ id: 'a2', layers: { kinetic: 0 }, hpBonus: 10 });
    const m = new Map<string, EquipmentItem>([
      ['sh', shield],
      ['a1', a1],
      ['a2', a2]
    ]);
    const ship = makeShipState({
      currentShieldHP: 0,
      shieldRebooting: true,
      armourLayers: [
        { itemId: 'a1', currentHP: 5, maxHP: 10 },
        { itemId: 'a2', currentHP: 10, maxHP: 10 }
      ],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'a1' },
        { slotType: 'armour', itemId: 'a2' }
      ]
    });
    resolveShipBulletDamage(makeBullet({ damage: 20 }) as BulletSpec, ship, viewShieldOnline(false, m));
    expect(ship.armourLayers[0].currentHP).toBe(0);
    expect(ship.armourLayers[1].currentHP).toBe(10);
  });

  it('with layer 0 depleted, next hit damages layer 1', () => {
    const a1 = makeArmour({ id: 'a1', layers: { kinetic: 0 } });
    const a2 = makeArmour({ id: 'a2', layers: { kinetic: 0 } });
    const m = new Map<string, EquipmentItem>([
      ['sh', shield],
      ['a1', a1],
      ['a2', a2]
    ]);
    const ship = makeShipState({
      currentShieldHP: 0,
      shieldRebooting: true,
      armourLayers: [
        { itemId: 'a1', currentHP: 0, maxHP: 10 },
        { itemId: 'a2', currentHP: 10, maxHP: 10 }
      ],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'a1' },
        { slotType: 'armour', itemId: 'a2' }
      ]
    });
    resolveShipBulletDamage(makeBullet({ damage: 4 }) as BulletSpec, ship, viewShieldOnline(false, m));
    expect(ship.armourLayers[1].currentHP).toBe(6);
  });

  it('damage reaches hull only when all armour layers at 0', () => {
    const a1 = makeArmour({ id: 'a1', layers: { kinetic: 0 } });
    const m = new Map<string, EquipmentItem>([
      ['sh', shield],
      ['a1', a1]
    ]);
    const ship = makeShipState({
      currentShieldHP: 0,
      shieldRebooting: true,
      currentHullHP: 100,
      armourLayers: [{ itemId: 'a1', currentHP: 0, maxHP: 10 }],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'a1' }
      ]
    });
    resolveShipBulletDamage(makeBullet({ damage: 7 }) as BulletSpec, ship, viewShieldOnline(false, m));
    expect(ship.currentHullHP).toBe(93);
  });

  it('void damage uses shield then armour like kinetic', () => {
    const ship = makeShipState({
      currentShieldHP: 5,
      armourLayers: [{ itemId: 'ar', currentHP: 10, maxHP: 10 }],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'ar' }
      ]
    });
    resolveShipBulletDamage(
      makeBullet({ damage: 10, damageType: { category: 'void', matter: 'normal' } }) as BulletSpec,
      ship,
      viewShieldOnline(true, cat())
    );
    expect(ship.currentShieldHP).toBe(0);
    expect(ship.armourLayers[0].currentHP).toBe(10);
  });

  it('shield collapse sets rebooting and timer', () => {
    const ship = makeShipState({
      currentShieldHP: 5,
      shieldRebooting: false,
      shieldRebootTimer: 0,
      equipmentSlots: [{ slotType: 'shield', itemId: 'sh' }],
      armourLayers: []
    });
    resolveShipBulletDamage(makeBullet({ damage: 10 }) as BulletSpec, ship, viewShieldOnline(true, cat()));
    expect(ship.shieldRebooting).toBe(true);
    expect(ship.shieldRebootTimer).toBe(12);
  });
});

describe('applyPlasmaDotToShip', () => {
  it.each([
    [true, 'player'],
    [false, 'npc_burn']
  ])('applies to outermost armour with HP (isPlayer=%s)', (isPlayer, id) => {
    const a1 = makeArmour({ id: 'x1', layers: { plasma: 0 } });
    const a2 = makeArmour({ id: 'x2', layers: { plasma: 0 } });
    const m = new Map([
      ['x1', a1],
      ['x2', a2]
    ]);
    const state = makeShipState({
      id,
      isPlayerControlled: isPlayer,
      currentHullHP: 100,
      armourLayers: [
        { itemId: 'x1', currentHP: 5, maxHP: 5 },
        { itemId: 'x2', currentHP: 8, maxHP: 8 }
      ]
    });
    applyPlasmaDotToShip(state, 2, (id) => m.get(id) ?? null);
    expect(state.armourLayers[0].currentHP).toBe(3);
    expect(state.armourLayers[1].currentHP).toBe(8);
    expect(state.currentHullHP).toBe(100);
  });

  it('applies to hull when all armour depleted', () => {
    const a1 = makeArmour({ id: 'x1', layers: { plasma: 0 } });
    const state = makeShipState({
      currentHullHP: 100,
      armourLayers: [{ itemId: 'x1', currentHP: 0, maxHP: 5 }]
    });
    applyPlasmaDotToShip(state, 3, () => a1);
    expect(state.currentHullHP).toBe(97);
  });

  it('plasma DoT bypasses shield conceptually (dots are not resolved through shield in this helper)', () => {
    const a1 = makeArmour({ id: 'x1', layers: { plasma: 0 } });
    const state = makeShipState({
      currentShieldHP: 100,
      currentHullHP: 50,
      armourLayers: [{ itemId: 'x1', currentHP: 4, maxHP: 5 }]
    });
    applyPlasmaDotToShip(state, 2, () => a1);
    expect(state.currentShieldHP).toBe(100);
    expect(state.armourLayers[0].currentHP).toBe(2);
  });
});
