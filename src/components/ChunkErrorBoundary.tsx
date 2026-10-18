import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** When this value changes (e.g. the pathname) a previously caught error is cleared, so
   * navigating elsewhere gets a fresh attempt instead of a stuck error screen. */
  resetKey?: string;
  /** Extra classes for the message block (defaults to a centred 40vh block). */
  className?: string;
  /** Message shown when something below failed (default: page-level wording). */
  message?: string;
}

interface State {
  failed: boolean;
  /** The resetKey the failure happened under. */
  failedKey: string | undefined;
}

/** Catches render/chunk-load failures below it — mainly a lazy route chunk that 404s after a
 * deploy replaced the hashed files — and offers a reload instead of a white screen. */
export default class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, failedKey: undefined };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  // A caught error is cleared once the resetKey (e.g. the pathname) differs from the one it
  // happened under, so navigating elsewhere gets a fresh attempt.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.failed && state.failedKey === undefined) return { failedKey: props.resetKey ?? '' };
    if (state.failed && state.failedKey !== (props.resetKey ?? '')) return { failed: false, failedKey: undefined };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page failed to render', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-4 text-center ${this.props.className ?? 'min-h-[40vh]'}`}
      >
        <p className="m-0 text-sm font-semibold text-ds-ink-soft">{this.props.message ?? 'Couldn’t load this page.'}</p>
        <button type="button" className="btn-primary btn-sm" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
