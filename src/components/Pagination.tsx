function Chevron({ direction }: { direction: 'prev' | 'next' }) {
  return (
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
      <path d={direction === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

const pageButton =
  'cut-xs h-9 w-9 flex items-center justify-center border-0 bg-ds-control text-ds-ink hover:bg-ds-control-hover transition-colors disabled:bg-ds-raised disabled:text-ds-disabled disabled:cursor-default disabled:pointer-events-none';

export default function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-2.5 border-t border-ds-line pt-3.5">
      <span className="text-[13px] text-ds-muted">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-1.5">
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={pageButton}
        >
          <Chevron direction="prev" />
        </button>
        <button
          type="button"
          aria-label="Next page"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={pageButton}
        >
          <Chevron direction="next" />
        </button>
      </div>
    </div>
  );
}
