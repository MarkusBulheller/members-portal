import type { AchievementIcon as AchievementIconKey } from '../types/achievement';

/** Simple line-art SVGs, one per AchievementIcon enum value — deliberately minimal (stroke-only,
 * currentColor) so they inherit whatever text color the caller sets and stay legible at badge
 * size. Keep this list in sync with members-backend's AchievementIcon enum. */
const PATHS: Record<AchievementIconKey, string> = {
  TROPHY:
    'M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0V4ZM7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3',
  FLAG: 'M6 3v18M6 4h5l1 2h6l-2 4 2 4h-6l-1-2H6',
  MEDAL: 'M12 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM9 3h6l-1.5 8h-3L9 3ZM12 13v2',
  ODOMETER: 'M4 15a8 8 0 1 1 16 0M12 15l4-5M4 15h1M19 15h1M7 8l.7.7M17 8l-.7.7',
  STOPWATCH: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 10v4l3 2M10 2h4M12 2v2',
  WHEEL:
    'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1',
  STAR: 'm12 3 2.7 5.9 6.3.6-4.7 4.4 1.3 6.3L12 17.3 6.4 20.2l1.3-6.3-4.7-4.4 6.3-.6L12 3Z',
  SHIELD: 'M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3ZM9 12l2 2 4-4',
  FLAME: 'M12 22a6 6 0 0 0 6-6c0-3-2-4.5-3-7-.5 2-1.5 3-2.5 2 .5-2.5-1-4.5-2.5-6-.5 3-2.5 4.5-3.5 7a6 6 0 0 0 5.5 10Z',
  CROWN: 'M4 18h16l1-9-5 3-4-6-4 6-5-3 1 9ZM4 21h16',
  WRENCH:
    'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6-2-2 2.6-2.6Z',
  BOLT: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
};

export default function AchievementIcon({
  icon,
  className = 'h-6 w-6',
}: {
  icon: AchievementIconKey;
  className?: string;
}) {
  const d = PATHS[icon] ?? PATHS.TROPHY;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

export const ACHIEVEMENT_ICON_KEYS = Object.keys(PATHS) as AchievementIconKey[];
