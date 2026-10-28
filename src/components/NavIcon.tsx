/** Stroke-only line icons for the sidebar and mobile nav — currentColor, so the caller's text
 * colour (or an explicit className) decides the tint. */
const PATHS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  events: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  results: 'M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0V4ZM7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3',
  recap: 'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z',
  drivers:
    'M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2',
  cars: 'M3 14l2.2-5.5A2 2 0 0 1 7 7h10a2 2 0 0 1 1.8 1.5L21 14v3H3zM7 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM17 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  tracks: 'M6 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  series: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  members: 'M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM2 21c1-4 3.6-6 7-6s6 2 7 6M16 11l2 2 4-4',
  inquiries: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5',
  settings:
    'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  search: 'M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM16 16l4.5 4.5',
} as const;

export type NavIconName = keyof typeof PATHS;

export default function NavIcon({ name, className = 'h-[18px] w-[18px]' }: { name: NavIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
