import { PAGE_LIMIT_MAX } from '@prime-crm/shared';
import type { Paginated } from '../interfaces/api-response.interface';

/** Safe page/limit (limit capped at `cap`) and the matching skip/take. */
export function pageWindow(
  page = 1,
  limit = PAGE_LIMIT_MAX,
  cap = PAGE_LIMIT_MAX,
): { page: number; limit: number; skip: number; take: number } {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), cap);
  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
  };
}

/** The paginated result `ResponseUtil.paginated` turns into `data` + `meta`. */
export function toPage<T>(
  data: T[],
  total: number,
  window: { page: number; limit: number },
): Paginated<T> {
  return {
    data,
    total,
    page: window.page,
    limit: window.limit,
    hasNextPage: window.page * window.limit < total,
    hasPreviousPage: window.page > 1,
  };
}
