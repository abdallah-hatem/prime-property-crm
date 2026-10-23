import {
  listingTitle,
  type Language,
  type PropertyType,
  type TrashKind,
} from '@prime-crm/shared';

type LabelledListing = {
  type: PropertyType;
  bedrooms: number | null;
  area: string;
};

/**
 * A listing's label: its title (type · bedrooms · area) in `language`. The activity log keeps the
 * English one as a snapshot (the default); the trash list shows it in the reader's language.
 */
export function listingLabel(
  listing: LabelledListing,
  language: Language = 'en',
): string {
  return listingTitle(listing, language);
}

const PHOTO_WORD: Record<Language, string> = { en: 'Photo', ar: 'صورة' };

/** A photo's label: its position and its listing's label, in `language`. */
export function photoLabel(
  photo: { order: number; listing: LabelledListing },
  language: Language = 'en',
): string {
  return `${PHOTO_WORD[language]} ${photo.order + 1} · ${listingLabel(photo.listing, language)}`;
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
