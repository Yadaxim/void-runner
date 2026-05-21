// Exercises resolveShipBulletDamage and applyMatterDotToShip (shared player + NPC resolution).
import { describe, expect, it } from 'vitest';
import type { BulletSpec, EquipmentItem, MatterType } from '../types';
import { applyMatterDotToShip, resolveShipBulletDamage, type ShipDamageWorldView } from './damage';
import { makeArmour, makeBullet, makeShipState, makeShield } from '../test/fixtures';

function viewShieldOnline(online: boolean, catalog: Map<string, EquipmentItem>): ShipDamageWorldView {
  return {
    isShieldOnline: () => online,
    getEquipmentItem: (id) => catalog.get(id) ?? null
  };
}

describe('resolveShipBulletDamage', () => {
  const shield = makeShield({ id: 'sh', capacity: 100, rebootTime: 12, regenDelay: 2, joulesPerHPRegen: 1 });
  const armour = makeArmour({ id: 'ar', layers: { normal: 0 } });

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
    const bullet = makeBullet({ damage: 20, matterType: 'normal' });
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
    const heavy = makeArmour({ id: 'ar2', layers: { normal: 100 } });
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
    const vuln = makeArmour({ id: 'ar3', layers: { normal: -5 } });
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
    const a1 = makeArmour({ id: 'a1', layers: { normal: 0 }, hpBonus: 10 });
    const a2 = makeArmour({ id: 'a2', layers: { normal: 0 }, hpBonus: 10 });
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
    const a1 = makeArmour({ id: 'a1', layers: { normal: 0 } });
    const a2 = makeArmour({ id: 'a2', layers: { normal: 0 } });
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
    const a1 = makeArmour({ id: 'a1', layers: { normal: 0 } });
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

  it('void matter uses void reduction on armour like other matters', () => {
    const voidPlate = makeArmour({ id: 'ar', layers: { void: 3, normal: 0 } });
    const m = new Map<string, EquipmentItem>([
      ['sh', shield],
      ['ar', voidPlate]
    ]);
    const ship = makeShipState({
      currentShieldHP: 0,
      shieldRebooting: true,
      armourLayers: [{ itemId: 'ar', currentHP: 50, maxHP: 50 }],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'ar' }
      ]
    });
    resolveShipBulletDamage(makeBullet({ damage: 10, matterType: 'void' }) as BulletSpec, ship, viewShieldOnline(false, m));
    expect(ship.armourLayers[0].currentHP).toBe(43);
  });

  it('uses matter type for armour reduction (anti vs normal)', () => {
    const mixed = makeArmour({ id: 'mix', layers: { normal: 8, anti: 100 } });
    const m = new Map<string, EquipmentItem>([
      ['sh', shield],
      ['mix', mixed]
    ]);
    const ship = makeShipState({
      currentShieldHP: 0,
      shieldRebooting: true,
      armourLayers: [{ itemId: 'mix', currentHP: 30, maxHP: 30 }],
      equipmentSlots: [
        { slotType: 'shield', itemId: 'sh' },
        { slotType: 'armour', itemId: 'mix' }
      ]
    });
    resolveShipBulletDamage(makeBullet({ damage: 10, matterType: 'normal' }) as BulletSpec, ship, viewShieldOnline(false, m));
    expect(ship.armourLayers[0].currentHP).toBe(28);
    const anti = resolveShipBulletDamage(
      makeBullet({ damage: 10, matterType: 'anti' }) as BulletSpec,
      makeShipState({
        ...ship,
        armourLayers: [{ itemId: 'mix', currentHP: 30, maxHP: 30 }]
      }),
      viewShieldOnline(false, m)
    );
    expect(anti.effectiveDamage).toBe(0);
    expect(anti.totalReduction).toBe(100);
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

describe('applyMatterDotToShip', () => {
  it.each([
    [true, 'player'],
    [false, 'npc_burn']
  ])('applies to outermost armour with HP (isPlayer=%s)', (isPlayer, id) => {
    const a1 = makeArmour({ id: 'x1', layers: { normal: 0 } });
    const a2 = makeArmour({ id: 'x2', layers: { normal: 0 } });
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
    applyMatterDotToShip(state, 2, 'normal', (id) => m.get(id) ?? null);
    expect(state.armourLayers[0].currentHP).toBe(3);
    expect(state.armourLayers[1].currentHP).toBe(8);
    expect(state.currentHullHP).toBe(100);
  });

  it('applies to hull when all armour depleted', () => {
    const a1 = makeArmour({ id: 'x1', layers: { normal: 0 } });
    const state = makeShipState({
      currentHullHP: 100,
      armourLayers: [{ itemId: 'x1', currentHP: 0, maxHP: 5 }]
    });
    applyMatterDotToShip(state, 3, 'normal', () => a1);
    expect(state.currentHullHP).toBe(97);
  });

  it('DoT bypasses shield', () => {
    const a1 = makeArmour({ id: 'x1', layers: { normal: 0 } });
    const state = makeShipState({
      currentShieldHP: 100,
      currentHullHP: 50,
      armourLayers: [{ itemId: 'x1', currentHP: 4, maxHP: 5 }]
    });
    applyMatterDotToShip(state, 2, 'normal', () => a1);
    expect(state.currentShieldHP).toBe(100);
    expect(state.armourLayers[0].currentHP).toBe(2);
  });
});
