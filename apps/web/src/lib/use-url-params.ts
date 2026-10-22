'use client';

import { useCallback, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type ParamUpdates = Record<string, string | number | null | undefined>;

/**
 * List state lives in the URL (page, filters, search, sort). `setParams` changes it without moving
 * the viewport (`scroll: false`) and reports `isPending` while the server renders the new rows, so
 * the list can dim the rows it already shows instead of swapping to skeletons.
 * `null` / `undefined` / `''` removes a param. Changing anything but `page` resets to page 1.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setParams = useCallback(
    (updates: ParamUpdates) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === '')
          next.delete(key);
        else next.set(key, String(value));
      }
      if (!('page' in updates)) next.delete('page');
      if (next.get('page') === '1') next.delete('page');
      const qs = next.toString();
      startTransition(() =>
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }),
      );
    },
    [pathname, router, searchParams],
  );

  return { searchParams, setParams, isPending };
}
