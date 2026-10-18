/** Categories as iRacing's track catalog reports them (see IracingTrack.category on the backend)
 * — Track.category is free text, so these are the values the form offers, not a closed set. */
export const TRACK_CATEGORIES = [
  { value: 'road', label: 'Road' },
  { value: 'oval', label: 'Oval' },
  { value: 'dirt_road', label: 'Dirt road' },
  { value: 'dirt_oval', label: 'Dirt oval' },
] as const;

/** "dirt_road" -> "Dirt road"; anything unknown (hand-typed, "Unknown", imported placeholder) is
 * shown as typed with the first letter capitalised. */
export function trackCategoryLabel(category: string): string {
  const known = TRACK_CATEGORIES.find((c) => c.value === category.toLowerCase());
  if (known) return known.label;
  const spaced = category.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
