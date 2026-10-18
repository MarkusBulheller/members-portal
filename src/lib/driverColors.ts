export interface DriverColor {
  bar: string;
  dot: string;
}

// Full class names so Tailwind picks them up. Keep lib/teamPlanClock.ts's OUTLINE_BY_DOT in step.
const DRIVER_COLORS: DriverColor[] = [
  { bar: 'bg-blue-500', dot: 'bg-blue-500' },
  { bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { bar: 'bg-amber-500', dot: 'bg-amber-500' },
  { bar: 'bg-red-500', dot: 'bg-red-500' },
  { bar: 'bg-purple-500', dot: 'bg-purple-500' },
  { bar: 'bg-cyan-500', dot: 'bg-cyan-500' },
  { bar: 'bg-pink-500', dot: 'bg-pink-500' },
  { bar: 'bg-lime-500', dot: 'bg-lime-500' },
];
const UNASSIGNED_COLOR: DriverColor = { bar: 'bg-white/20', dot: 'bg-white/40' };

/** Unique driverUserIds in order of first appearance across a stint list (timeline lane order). */
export function driverIdsInStintOrder(stints: { driverUserId: string | null }[]): string[] {
  const order: string[] = [];
  for (const s of stints) {
    if (s.driverUserId !== null && !order.includes(s.driverUserId)) order.push(s.driverUserId);
  }
  return order;
}

/** The drivers whose colours are being assigned, in a STABLE order (sorted ids) — not the order
 * stints happen to be assigned in, which is what used to make a driver's colour change whenever
 * the plan was reshuffled. Pass the team's whole roster plus any ids that only appear in stints,
 * so a driver's colour doesn't depend on whether they have a stint yet. */
export function orderedDriverIds(items: { driverUserId: string | null }[]): string[] {
  const ids = new Set<string>();
  for (const item of items) if (item.driverUserId !== null) ids.add(item.driverUserId);
  return [...ids].sort();
}

/** 32-bit FNV-1a — a tiny stable string hash (the same id always gives the same number). */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const slotCache = new Map<string, Map<string, number>>();

function isSorted(ids: readonly string[]): boolean {
  for (let i = 1; i < ids.length; i++) if (ids[i - 1] > ids[i]) return false;
  return true;
}

/** Colour slot per driver: each driver prefers the slot their id hashes to and, if a driver
 * earlier in the (sorted) list already holds it, takes the next free one. The result depends only
 * on WHO is in the set — never on who got which stint — so colours stay put while stints move
 * around, and only shift if the roster itself changes. `sortedOrder` MUST already be sorted. */
function slotsFor(sortedOrder: readonly string[]): Map<string, number> {
  const key = sortedOrder.join('|');
  const cached = slotCache.get(key);
  if (cached) return cached;

  const slots = new Map<string, number>();
  const used = new Set<number>();
  for (const id of sortedOrder) {
    let slot = hashId(id) % DRIVER_COLORS.length;
    if (used.size < DRIVER_COLORS.length) {
      while (used.has(slot)) slot = (slot + 1) % DRIVER_COLORS.length;
    }
    used.add(slot);
    slots.set(id, slot);
  }
  if (slotCache.size > 200) slotCache.clear();
  slotCache.set(key, slots);
  return slots;
}

/** Per order-array memo: callers pass the same (memoised) array for every row, so the sort check,
 * the join and the cache lookup happen once per roster instead of once per call. The array is
 * treated as immutable — a caller that mutates it in place would get stale colours. */
const slotsByOrder = new WeakMap<readonly string[], Map<string, number>>();

function slotsOfOrder(driverOrder: readonly string[]): Map<string, number> {
  let slots = slotsByOrder.get(driverOrder);
  if (!slots) {
    slots = slotsFor(isSorted(driverOrder) ? driverOrder : [...driverOrder].sort());
    slotsByOrder.set(driverOrder, slots);
  }
  return slots;
}

export function getDriverColor(driverUserId: string | null, driverOrder: readonly string[]): DriverColor {
  if (driverUserId === null) return UNASSIGNED_COLOR;
  let slot = slotsOfOrder(driverOrder).get(driverUserId);
  // A driver that isn't in the roster list is slotted as if they were part of it (rare: only for
  // an id the caller didn't include) — the one path that still builds a sorted copy per call.
  if (slot === undefined) slot = slotsFor([...driverOrder, driverUserId].sort()).get(driverUserId);
  return slot === undefined ? UNASSIGNED_COLOR : DRIVER_COLORS[slot];
}
