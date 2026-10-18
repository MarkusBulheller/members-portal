import { useCallback, useState } from 'react';

/** Client-side pagination for a list that's already fully fetched (this app's race-result lists
 * are small enough — dozens, not thousands — that paging server-side wasn't worth the API
 * surface). Resets to page 1 whenever `items` changes to a new array (a fresh fetch, e.g. after
 * navigating to a different driver/car/track), so you never land on an out-of-range page.
 *
 * The reset is derived during render (the page is remembered together with the array it was
 * chosen for), not applied by an effect — so there is no extra render and no flash of a stale page. */
export function usePagination<T>(items: T[] | null, pageSize = 8) {
  const [chosen, setChosen] = useState<{ items: T[] | null; page: number }>({ items, page: 1 });
  const page = chosen.items === items ? chosen.page : 1;

  const setPage = useCallback((next: number) => setChosen({ items, page: next }), [items]);

  const totalPages = items ? Math.max(1, Math.ceil(items.length / pageSize)) : 1;
  const pageItems = items ? items.slice((page - 1) * pageSize, page * pageSize) : null;

  return { page, setPage, totalPages, pageItems };
}
