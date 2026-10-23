import { SEARCH_LISTINGS } from '@/apis';
import {
  invalidRanges,
  parseFilters,
  toQuery,
} from '@/components/listings/filters-url';
import { ListingSearch } from '@/components/listings/listing-search';

/** Listings search: the URL holds every filter; the server renders the matching page. */
export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const page = Math.max(
    1,
    Number.parseInt(String(params.page ?? '1'), 10) || 1,
  );

  // A hand-edited URL with a minimum above its maximum: search without those ranges.
  const bad = invalidRanges(filters);
  for (const key of bad) {
    filters[`${key}Min`] = null;
    filters[`${key}Max`] = null;
  }

  const res = await SEARCH_LISTINGS(toQuery(filters, page));
  if (!res.success) return <ListingSearch rows={[]} failed />;
  return <ListingSearch rows={res.data} meta={res.meta} />;
}
