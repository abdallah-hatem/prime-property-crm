import {
  AREA_MAX_LENGTH,
  LeadStatusSchema,
  OwnerSortSchema,
  SEARCH_MAX_LENGTH,
  type LeadStatus,
  type OwnerSort,
} from '@prime-crm/shared';
import { z } from 'zod';

/** The admin owners table's filters, as they live in the URL (unknown values are dropped). */
export interface OwnerFilters {
  q: string;
  status?: LeadStatus;
  /** `unassigned` or a user id; absent = anyone. */
  assignedTo?: string;
  area?: string;
  importId?: string;
  hasReminder?: boolean;
  sort?: OwnerSort;
}

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const AssignedSchema = z.union([z.literal('unassigned'), z.uuid()]);

export function parseOwnerFilters(params: Params): OwnerFilters {
  const pick = <T>(schema: z.ZodType<T>, key: string): T | undefined => {
    const parsed = schema.safeParse(one(params[key]));
    return parsed.success ? parsed.data : undefined;
  };
  const reminder = one(params.hasReminder);
  const area = (one(params.area) ?? '').trim().slice(0, AREA_MAX_LENGTH);
  return {
    q: (one(params.q) ?? '').slice(0, SEARCH_MAX_LENGTH),
    status: pick(LeadStatusSchema, 'status'),
    assignedTo: pick(AssignedSchema, 'assignedTo'),
    area: area || undefined,
    importId: pick(z.uuid(), 'importId'),
    hasReminder:
      reminder === 'true' ? true : reminder === 'false' ? false : undefined,
    sort: pick(OwnerSortSchema, 'sort'),
  };
}

/** The `GET /owners` / `GET /owners/ids` query for these filters (no paging). */
export function ownerQueryOf(filters: OwnerFilters) {
  return {
    q: filters.q || undefined,
    status: filters.status ? [filters.status] : undefined,
    assignedTo: filters.assignedTo,
    area: filters.area,
    importId: filters.importId,
    hasReminder:
      filters.hasReminder === undefined
        ? undefined
        : filters.hasReminder
          ? ('true' as const)
          : ('false' as const),
    sort: filters.sort,
  };
}

/** Whether anything narrows the list (decides the empty state's wording). */
export const isFiltered = (filters: OwnerFilters): boolean =>
  !!(
    filters.q ||
    filters.status ||
    filters.assignedTo ||
    filters.area ||
    filters.importId ||
    filters.hasReminder !== undefined
  );

/** A stable key of what the list shows; a selection made under other filters is dropped. */
export const filtersKey = (filters: OwnerFilters): string =>
  JSON.stringify({ ...filters, sort: undefined });
