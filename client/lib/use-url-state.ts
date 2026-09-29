'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Filters kept in the query string, so a filtered view can be bookmarked or shared and survives
 * reload. Setting a value to '' or the default removes it from the URL.
 */
export function useUrlState<K extends string>(defaults: Record<K, string>) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const values = Object.fromEntries(
    (Object.keys(defaults) as K[]).map((k) => [k, params.get(k) ?? defaults[k]])
  ) as Record<K, string>;

  const set = useCallback(
    (changes: Partial<Record<K, string>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes) as [K, string][]) {
        if (!v || v === defaults[k]) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    // `defaults` is a literal at each call site; its values don't change between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, pathname, router]
  );

  return [values, set] as const;
}
