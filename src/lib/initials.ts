/** Avatar initials: first letter of the first two words, uppercased ("Markus B." -> "MB").
 *  A single word gives its first two letters; an empty name gives "?". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
