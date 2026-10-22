import {
  listingTitle,
  type PropertyType,
  type TrashKind,
} from '@prime-crm/shared';

/**
 * The trash and activity label of a listing: its title in English (type · bedrooms · area), a
 * snapshot that doesn't change with the reader's language.
 */
export function listingLabel(listing: {
  type: PropertyType;
  bedrooms: number | null;
  area: string;
}): string {
  return listingTitle(listing, 'en');
}

/** A photo's label: its position and its listing's label. */
export function photoLabel(photo: {
  order: number;
  listing: { type: PropertyType; bedrooms: number | null; area: string };
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
