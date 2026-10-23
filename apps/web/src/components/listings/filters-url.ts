import {
  AdStatusSchema,
  ListingPurposeSchema,
  ListingSortSchema,
  ListingStatusSchema,
  PropertyTypeSchema,
  type AdStatus,
  type ListingListQuery,
  type ListingPurpose,
  type ListingSort,
  type ListingStatus,
  type PropertyType,
} from '@prime-crm/shared';
import type { ParamUpdates } from '@/lib/use-url-params';

/**
 * The listing search lives in the URL. This turns the URL into a typed filter state (unknown or
 * malformed values are dropped, never sent) and back into param updates, so a reload, a shared
 * link or the back button lands on the same search.
 */
export interface ListingFilters {
  q: string;
  purpose: ListingPurpose | null;
  type: PropertyType[];
  area: string;
  compound: string;
  priceMin: number | null;
  priceMax: number | null;
  sizeMin: number | null;
  sizeMax: number | null;
  bedroomsMin: number | null;
  bathroomsMin: number | null;
  floorMin: number | null;
  floorMax: number | null;
  /** Empty = the API default (Available). */
  status: ListingStatus[];
  adStatus: AdStatus | null;
  checkInDue: boolean;
  sort: ListingSort | null;
}

export const EMPTY_FILTERS: ListingFilters = {
  q: '',
  purpose: null,
  type: [],
  area: '',
  compound: '',
  priceMin: null,
  priceMax: null,
  sizeMin: null,
  sizeMax: null,
  bedroomsMin: null,
  bathroomsMin: null,
  floorMin: null,
  floorMax: null,
  status: [],
  adStatus: null,
  checkInDue: false,
  sort: null,
};

type ParamSource =
  URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: ParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const value = source[key];
  return Array.isArray(value) ? value.join(',') : value;
}

function readInt(source: ParamSource, key: string): number | null {
  const raw = read(source, key);
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function readList<T extends string>(
  source: ParamSource,
  key: string,
  allowed: readonly T[],
): T[] {
  const raw = read(source, key);
  if (!raw) return [];
  const items = raw.split(',').map((s) => s.trim());
  return allowed.filter((value) => items.includes(value));
}

function readEnum<T extends string>(
  source: ParamSource,
  key: string,
  allowed: readonly T[],
): T | null {
  const raw = read(source, key);
  return allowed.find((value) => value === raw) ?? null;
}

export function parseFilters(source: ParamSource): ListingFilters {
  return {
    q: read(source, 'q') ?? '',
    purpose: readEnum(source, 'purpose', ListingPurposeSchema.options),
    type: readList(source, 'type', PropertyTypeSchema.options),
    area: read(source, 'area') ?? '',
    compound: read(source, 'compound') ?? '',
    priceMin: readInt(source, 'priceMin'),
    priceMax: readInt(source, 'priceMax'),
    sizeMin: readInt(source, 'sizeMin'),
    sizeMax: readInt(source, 'sizeMax'),
    bedroomsMin: readInt(source, 'bedroomsMin'),
    bathroomsMin: readInt(source, 'bathroomsMin'),
    floorMin: readInt(source, 'floorMin'),
    floorMax: readInt(source, 'floorMax'),
    status: readList(source, 'status', ListingStatusSchema.options),
    adStatus: readEnum(source, 'adStatus', AdStatusSchema.options),
    checkInDue: read(source, 'checkInDue') === 'true',
    sort: readEnum(source, 'sort', ListingSortSchema.options),
  };
}

/** The API query for a filter state and page (empty values left out). */
export function toQuery(
  filters: ListingFilters,
  page: number,
): ListingListQuery {
  const updates = toParamUpdates(filters);
  const query: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(updates))
    if (value !== null && value !== undefined && value !== '')
      query[key] = value;
  if (page > 1) query.page = page;
  return query as ListingListQuery;
}

/** Every filter key, set or cleared, ready for `useUrlParams().setParams`. */
export function toParamUpdates(filters: ListingFilters): ParamUpdates {
  const text = (value: string) => value.trim() || null;
  return {
    q: text(filters.q),
    purpose: filters.purpose,
    type: filters.type.length ? filters.type.join(',') : null,
    area: text(filters.area),
    compound: text(filters.compound),
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    sizeMin: filters.sizeMin,
    sizeMax: filters.sizeMax,
    bedroomsMin: filters.bedroomsMin,
    bathroomsMin: filters.bathroomsMin,
    floorMin: filters.floorMin,
    floorMax: filters.floorMax,
    status: filters.status.length ? filters.status.join(',') : null,
    adStatus: filters.adStatus,
    checkInDue: filters.checkInDue ? 'true' : null,
    sort: filters.sort,
  };
}

/** How many filters differ from the default search (the search box and sort don't count). */
export function activeFilterCount(filters: ListingFilters): number {
  const isSet = [
    filters.purpose !== null,
    filters.type.length > 0,
    filters.area.trim() !== '',
    filters.compound.trim() !== '',
    filters.priceMin !== null || filters.priceMax !== null,
    filters.sizeMin !== null || filters.sizeMax !== null,
    filters.bedroomsMin !== null,
    filters.bathroomsMin !== null,
    filters.floorMin !== null || filters.floorMax !== null,
    filters.status.length > 0 &&
      !(filters.status.length === 1 && filters.status[0] === 'AVAILABLE'),
    filters.adStatus !== null,
    filters.checkInDue,
  ];
  return isSet.filter(Boolean).length;
}

export type RangeKey = 'price' | 'size' | 'floor';

/** The ranges whose minimum is above their maximum; the search is blocked while any is. */
export function invalidRanges(filters: ListingFilters): RangeKey[] {
  const pairs: [RangeKey, number | null, number | null][] = [
    ['price', filters.priceMin, filters.priceMax],
    ['size', filters.sizeMin, filters.sizeMax],
    ['floor', filters.floorMin, filters.floorMax],
  ];
  return pairs
    .filter(([, min, max]) => min !== null && max !== null && min > max)
    .map(([key]) => key);
}
