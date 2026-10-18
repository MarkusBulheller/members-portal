import type { ReactNode } from 'react';

/** Signed-out / account-status screens: the wordmark centred above one hero panel (cut-lg),
 * matching the canvas's Account status board. `bare` drops the panel and wordmark for pages that
 * lay out their own full-bleed screen (e.g. a split sign-in page) while keeping the page surface. */
export default function AuthLayout({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  if (bare) {
    return <div className="min-h-screen bg-ds-page text-ds-ink">{children}</div>;
  }

  return (
    <div className="min-h-screen box-border bg-ds-page text-ds-ink flex flex-col items-center justify-center gap-7 px-4 py-8">
      <span className="font-logo font-black text-2xl tracking-[0.14em] text-ds-ink">
        W<span className="text-w2w-red">2</span>W
      </span>
      <div className="cut-lg bg-ds-panel w-full max-w-[460px] box-border p-8">{children}</div>
    </div>
  );
}
