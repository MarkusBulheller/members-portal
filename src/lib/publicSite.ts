/** Base URL of the public marketing site (e.g. https://wheel2wheel.racing), from the optional
 * VITE_PUBLIC_SITE_URL env var. Anything that links to the public site is hidden when this is
 * unset (or isn't an http(s) URL). */
export function publicSiteUrl(): string | null {
  const raw = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return raw.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** Host part for display, e.g. "wheel2wheel.racing". */
export function publicSiteHost(): string | null {
  const base = publicSiteUrl();
  return base ? new URL(base).host : null;
}

/** The public site's contact / join form (the "#join" section on its home page). */
export function publicSiteContactUrl(): string | null {
  const base = publicSiteUrl();
  return base ? `${base}/#join` : null;
}
