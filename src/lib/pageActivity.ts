/**
 * One shared pair of "the user came back" listeners (tab becomes visible, window gains focus) for
 * every timer on the plan page — the page clock, the race clock tile, the timeline's live marker
 * and the live-update stream. Browsers throttle timers in background tabs, so each of them wants a
 * fresh read the moment the user returns; registering one listener pair here instead of one per
 * component keeps that cheap.
 */
export interface PageActivity {
  /** How long the tab was hidden before this call (0 for a plain window focus). */
  hiddenForMs: number;
}

type Listener = (activity: PageActivity) => void;

const listeners = new Set<Listener>();
let attached = false;
let hiddenAt: number | null = null;

function notify(hiddenForMs: number) {
  for (const listener of [...listeners]) listener({ hiddenForMs });
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    return;
  }
  const hiddenForMs = hiddenAt === null ? 0 : Date.now() - hiddenAt;
  hiddenAt = null;
  notify(hiddenForMs);
}

function onFocus() {
  notify(0);
}

function attach() {
  if (attached) return;
  attached = true;
  hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onFocus);
}

function detach() {
  if (!attached) return;
  attached = false;
  hiddenAt = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('focus', onFocus);
}

export function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Calls `listener` whenever the tab becomes visible again or the window regains focus.
 * Returns the unsubscribe function. */
export function subscribeToPageActivity(listener: Listener): () => void {
  listeners.add(listener);
  attach();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detach();
  };
}
