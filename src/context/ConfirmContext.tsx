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
      // A confirm is already open: settle its promise as "no" rather than leaving it hanging forever.
      resolveRef.current?.(false);
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
          <p className="text-ds-ink-soft text-sm leading-relaxed">{pending.message}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button ref={cancelButtonRef} onClick={() => respond(false)} className="btn-secondary">
              {pending.cancelLabel}
            </button>
            <button onClick={() => respond(true)} className={pending.danger ? 'btn-danger' : 'btn-primary'}>
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
