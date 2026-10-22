import type { TrashKind } from '@prime-crm/shared';

/** APARTMENT -> Apartment, TWIN_HOUSE -> Twin house. */
function humanize(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The trash and activity label of a listing: type · bedrooms · area. An English snapshot; the
 * listings task owns the localized title and may replace this.
 */
export function listingLabel(listing: {
  type: string;
  bedrooms: number | null;
  area: string;
}): string {
  return [
    humanize(listing.type),
    listing.bedrooms != null ? `${listing.bedrooms} BR` : null,
    listing.area,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A photo's label: its position and its listing's label. */
export function photoLabel(photo: {
  order: number;
  listing: { type: string; bedrooms: number | null; area: string };
}): string {
  return `Photo ${photo.order + 1} · ${listingLabel(photo.listing)}`;
}

const KIND_WORD: Record<TrashKind, string> = {
  OWNER: 'owner',
  LISTING: 'listing',
  PHOTO: 'photo',
};

/** "Deleted owner Ahmed Ali" / "Restored listing Villa · 4 BR · Sheikh Zayed". */
export function trashSummary(
  action: 'Deleted' | 'Restored',
  kind: TrashKind,
  label: string,
): string {
  return `${action} ${KIND_WORD[kind]} ${label}`;
}
