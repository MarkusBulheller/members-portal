import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  title,
  onClose,
  children,
  initialFocusRef,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Element to focus on open instead of the close button — e.g. a confirm dialog focusing
   * "Cancel" by default so Enter doesn't accidentally trigger a destructive action. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Callers pass inline arrows; read the latest through a ref so the keydown listener is added once.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Move focus into the dialog on open, and back to whatever triggered it on close — without
  // this, a keyboard/screen-reader user tabbing has no indication a dialog opened at all, and
  // loses their place in the page once it closes.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    (initialFocusRef?.current ?? closeButtonRef.current)?.focus();
    return () => previouslyFocused?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      // Trap Tab/Shift+Tab inside the dialog so background page content isn't reachable while
      // it's open (WCAG 2.4.3 focus order / no keyboard trap around the dialog itself).
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="cut bg-ds-panel text-ds-ink max-w-lg w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id={titleId} className="h2 min-w-0">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="cut-xs h-9 w-9 shrink-0 flex items-center justify-center text-ds-muted hover:text-ds-ink hover:bg-ds-raised transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="square"
              aria-hidden="true"
            >
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
