export interface DriverColor {
  bar: string;
  dot: string;
}

const DRIVER_COLORS: DriverColor[] = [
  { bar: 'bg-blue-500', dot: 'bg-blue-400' },
  { bar: 'bg-emerald-500', dot: 'bg-emerald-400' },
  { bar: 'bg-amber-500', dot: 'bg-amber-400' },
  { bar: 'bg-red-500', dot: 'bg-red-400' },
  { bar: 'bg-purple-500', dot: 'bg-purple-400' },
  { bar: 'bg-cyan-500', dot: 'bg-cyan-400' },
];
const UNASSIGNED_COLOR: DriverColor = { bar: 'bg-white/20', dot: 'bg-white/40' };

/** Unique driverUserIds in order of first appearance across a stint list — used to assign colors
 * consistently, e.g. between the Strategy table and the timeline visualization, since both derive
 * this from the same underlying stint order independently rather than sharing state. */
export function orderedDriverIds(stints: { driverUserId: string | null }[]): string[] {
  const order: string[] = [];
  for (const s of stints) {
    if (s.driverUserId !== null && !order.includes(s.driverUserId)) order.push(s.driverUserId);
  }
  return order;
}

export function getDriverColor(driverUserId: string | null, driverOrder: string[]): DriverColor {
  if (driverUserId === null) return UNASSIGNED_COLOR;
  const idx = driverOrder.indexOf(driverUserId);
  return idx === -1 ? UNASSIGNED_COLOR : DRIVER_COLORS[idx % DRIVER_COLORS.length];
}
