/** Light Suspense fallback for lazy route chunks: a small centred block (not a full-screen
 * spinner) so the shell stays put and the layout doesn't jump. */
export default function RouteFallback({ className = 'min-h-[40vh]' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center text-sm font-semibold text-ds-muted ${className}`}
    >
      Loading…
    </div>
  );
}
