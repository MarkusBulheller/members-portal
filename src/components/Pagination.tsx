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
    <div className="flex items-center justify-between mt-4">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 border border-white/15 text-white/60 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:pointer-events-none font-heading text-xs uppercase tracking-wide transition-colors"
      >
        Previous
      </button>
      <span className="text-white/65 text-xs font-heading uppercase tracking-wide">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 border border-white/15 text-white/60 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:pointer-events-none font-heading text-xs uppercase tracking-wide transition-colors"
      >
        Next
      </button>
    </div>
  );
}
