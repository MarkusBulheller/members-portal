/** Renders an actual SVG flag (via the flag-icons package) rather than a Unicode flag emoji —
 * Windows/Chrome doesn't reliably render regional-indicator flag emoji as color glyphs, so that
 * approach silently rendered nothing on this platform. `countryCode` is an ISO 3166-1 alpha-2
 * code, e.g. "DE". */
export default function CountryFlag({
  countryCode,
  className,
}: {
  countryCode: string | null | undefined;
  className?: string;
}) {
  if (!countryCode || countryCode.length !== 2) return null;
  return <span className={`fi fi-${countryCode.toLowerCase()} ${className ?? ''}`} />;
}
