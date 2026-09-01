import { useEffect, useState } from 'react';

/** Client-side pagination for a list that's already fully fetched (this app's race-result lists
 * are small enough — dozens, not thousands — that paging server-side wasn't worth the API
 * surface). Resets to page 1 whenever `items` changes to a new array (a fresh fetch, e.g. after
 * navigating to a different driver/car/track), so you never land on an out-of-range page. */
export function usePagination<T>(items: T[] | null, pageSize = 8) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const totalPages = items ? Math.max(1, Math.ceil(items.length / pageSize)) : 1;
  const pageItems = items ? items.slice((page - 1) * pageSize, page * pageSize) : null;

  return { page, setPage, totalPages, pageItems };
}
