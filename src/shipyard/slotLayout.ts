import type { EquipmentSlot, HullSpec } from '../types';

export function getDesiredSlotCounts(hull: HullSpec): Partial<Record<EquipmentSlot['slotType'], number>> {
  const desired = { ...(hull.slotCounts ?? {}) } as Partial<Record<EquipmentSlot['slotType'], number>>;
  if (desired.weapon === undefined) {
    desired.weapon = hull.weaponSlots;
  }
  return desired;
}

/**
 * Ensures `baseSlots` includes every hardpoint for the hull (appends `{ slotType, itemId: null }` rows).
 * Order: preserves existing rows, then appends missing capacity by iterating slot types alphabetically by type key for stability.
 */
export function expandSlotsToFullHull(hull: HullSpec, baseSlots: EquipmentSlot[]): EquipmentSlot[] {
  const slots = baseSlots.map((s) => ({ ...s }));
  const desired = getDesiredSlotCounts(hull);
  const typeOrder = Object.keys(desired).sort() as Array<EquipmentSlot['slotType']>;
  for (const slotType of typeOrder) {
    const countRaw = desired[slotType];
    const count = Math.max(0, Math.floor(Number(countRaw ?? 0)));
    const capped = slotType === 'weapon' ? Math.min(5, count) : count;
    const existing = slots.filter((s) => s.slotType === slotType).length;
    for (let i = existing; i < capped; i += 1) {
      slots.push({ slotType, itemId: null });
    }
  }
  return slots;
}

export function findSlotIndex(slots: EquipmentSlot[], slotType: EquipmentSlot['slotType'], index: number): number {
  let seen = 0;
  for (let i = 0; i < slots.length; i += 1) {
    if (slots[i].slotType !== slotType) {
      continue;
    }
    if (seen === index) {
      return i;
    }
    seen += 1;
  }
  return -1;
}

export function getHullSlotCount(hull: HullSpec | null, slotType: EquipmentSlot['slotType']): number {
  if (!hull) {
    return 0;
  }
  const desired = getDesiredSlotCounts(hull);
  const raw = desired[slotType];
  if (raw === undefined) {
    return 0;
  }
  const count = Math.max(0, Math.floor(Number(raw)));
  return slotType === 'weapon' ? Math.min(5, count) : count;
}

export function getSlotFromLayout(
  slots: EquipmentSlot[],
  hull: HullSpec | null,
  slotType: EquipmentSlot['slotType'],
  index: number
): EquipmentSlot | null {
  if (!hull || index < 0 || index >= getHullSlotCount(hull, slotType)) {
    return null;
  }
  const filtered = slots.filter((s) => s.slotType === slotType);
  return filtered[index] ?? null;
}
