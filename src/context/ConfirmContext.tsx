import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Modal from '../components/Modal';

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (solid red) — the default, since almost every
   * confirm in this app guards a delete/remove/revoke/cancel action. Set false for a neutral
   * confirmation that isn't destructive. */
  danger?: boolean;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends Required<ConfirmOptions> {
  message: string;
}

/** Replaces window.confirm() app-wide with a Modal-based dialog that matches the rest of the UI
 * (and gets Modal's focus trap/dialog semantics for free). Mounted once near the app root; call
 * sites use useConfirm() and `await` it exactly where they used to call the native confirm(). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const confirmFn = useCallback<ConfirmFn>((message, options) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPending({
        message,
        title: options?.title ?? 'Are you sure?',
        confirmLabel: options?.confirmLabel ?? 'Confirm',
        cancelLabel: options?.cancelLabel ?? 'Cancel',
        danger: options?.danger ?? true,
      });
    });
  }, []);

  function respond(value: boolean) {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirmFn}>
      {children}
      {pending && (
        <Modal title={pending.title} onClose={() => respond(false)} initialFocusRef={cancelButtonRef}>
          <p className="text-white/70 text-sm leading-relaxed">{pending.message}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              ref={cancelButtonRef}
              onClick={() => respond(false)}
              className="px-4 py-2 border border-white/20 text-white/60 hover:text-white font-heading text-xs uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-w2w-red"
            >
              {pending.cancelLabel}
            </button>
            <button
              onClick={() => respond(true)}
              className={
                pending.danger
                  ? 'px-4 py-2 bg-w2w-red hover:bg-w2w-red-bright text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
                  : 'px-4 py-2 border border-white/20 text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-w2w-red'
              }
            >
              {pending.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
