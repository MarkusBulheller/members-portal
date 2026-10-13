export const CAR_CLASSES = ['GT3', 'GTP', 'LMP2', 'GT4', 'P-CUP', 'Hypercar', 'LMGT3'] as const;

export type CarClass = (typeof CAR_CLASSES)[number];

/** Classes an event can run, per sim — CAR_CLASSES above stays the full set (a Car's class is
 * validated against all of them), these just narrow what the event form offers. LMP2 exists in
 * both sims. */
export const CAR_CLASSES_BY_SIM = {
  IRACING: ['GT3', 'GTP', 'LMP2', 'GT4', 'P-CUP'],
  LMU: ['Hypercar', 'LMP2', 'LMGT3'],
} as const satisfies Record<string, readonly CarClass[]>;
