export interface LicenseClassStyle {
  background: string;
  color: string;
}

/** iRacing's own license-class colors (Rookie through Class A, plus Pro). */
const LICENSE_CLASS_COLORS: Record<string, LicenseClassStyle> = {
  R: { background: '#D64545', color: '#FFFFFF' },
  D: { background: '#E8863C', color: '#FFFFFF' },
  C: { background: '#E0C23C', color: '#1A1A1A' },
  B: { background: '#4CAF50', color: '#FFFFFF' },
  A: { background: '#3B82F6', color: '#FFFFFF' },
  P: { background: '#1A1A1A', color: '#FFFFFF' },
};

const FALLBACK_STYLE: LicenseClassStyle = { background: '#3A3A3A', color: '#FFFFFF' };

/** Parses iRacing's compact "A 4.10" format (license class letter + safety rating) into a badge
 * style matching iRacing's in-game license colors. Falls back to neutral gray for an
 * unrecognized/missing class letter. */
export function licenseClassStyle(safetyRating: string | null | undefined): LicenseClassStyle {
  const letter = safetyRating?.trim().charAt(0).toUpperCase();
  return (letter && LICENSE_CLASS_COLORS[letter]) || FALLBACK_STYLE;
}
