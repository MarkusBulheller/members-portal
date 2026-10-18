import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared modal behaviour for dialogs that don't use <Modal>: Escape closes, Tab / Shift+Tab stay
 * inside the container, focus moves to `initialFocusRef` (or the first focusable element) on open
 * and returns to whatever had it when the dialog closes. */
export function useDialogA11y(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  // Callers pass inline arrows; read the latest through a ref so the keydown listener is added once.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const first = initialFocusRef?.current ?? container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
    return () => previouslyFocused?.focus?.();
    // Only on mount/unmount: re-running when callbacks change would steal focus mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      const container = containerRef.current;
      if (e.key !== 'Tab' || !container) return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !container.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !container.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [containerRef]);
}
