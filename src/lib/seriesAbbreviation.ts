const WORD_SPLIT = /\s+/;
const STOP_AT = new Set(['by', 'presented', 'powered', 'sponsored']);

/** Short tile text for a series with no logo, derived from its name (the design shows e.g. "GTE"
 * for "GT Endurance Series by Simucube"): a leading ALL-CAPS word of 3+ letters is used as is
 * ("IMSA Endurance Series" -> "IMSA", "BMW M Sim Cup" -> "BMW"); otherwise initials of the words
 * before any "by ..." tail, keeping short ALL-CAPS words whole, capped at 3 characters. */
export function seriesAbbreviation(name: string): string {
  const words: string[] = [];
  for (const raw of name.replace(/\([^)]*\)/g, ' ').split(WORD_SPLIT)) {
    const word = raw.replace(/[^\p{L}\p{N}]/gu, '');
    if (STOP_AT.has(raw.toLowerCase())) break;
    if (word) words.push(word);
  }
  if (words.length === 0) return '?';

  const first = words[0];
  if (first.length >= 3 && first.length <= 5 && first === first.toUpperCase() && /\p{L}/u.test(first)) {
    return first;
  }
  if (words.length === 1) return first.slice(0, 3).toUpperCase();

  let result = '';
  for (const word of words) {
    result += word.length <= 3 && word === word.toUpperCase() ? word : word.charAt(0);
  }
  return result.slice(0, 3).toUpperCase();
}
