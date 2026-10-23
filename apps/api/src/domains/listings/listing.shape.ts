import {
  listingTitle,
  type Language,
  type Listing,
  type ListingRow,
  type Note,
} from '@prime-crm/shared';
import type {
  ListingDetailData,
  ListingRowData,
} from './repositories/listing.repository';

const iso = (at: Date | null) => at?.toISOString() ?? null;

/**
 * `ListingRow` from its row: the title in `language`, and no owner phone for anyone.
 * `checkInDueBefore` is the end of today (Cairo): an open check-in due before it is "due".
 */
export function toListingRow(
  row: ListingRowData,
  language: Language,
  checkInDueBefore: Date,
): ListingRow {
  const checkIn = row.reminders[0];
  return {
    id: row.id,
    title: listingTitle(row, language),
    purpose: row.purpose,
    type: row.type,
    area: row.area,
    compound: row.compound,
    price: row.price,
    sizeSqm: row.sizeSqm,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    floor: row.floor,
    status: row.status,
    coverPhotoUrl: row.photos[0]?.url ?? null,
    adStatus: row.adStatus,
    assignedTo: row.assignedTo,
    checkInDue: checkIn !== undefined && checkIn.dueAt < checkInDueBefore,
  };
}

/** `Listing`: the phone only when `showPhone` (assigned to the caller, or manageAll). */
export function toListing(
  row: ListingDetailData,
  notes: Note[],
  options: { language: Language; checkInDueBefore: Date; showPhone: boolean },
): Listing {
  return {
    ...toListingRow(row, options.language, options.checkInDueBefore),
    coverPhotoUrl: row.photos[0]?.url ?? null,
    address: row.address,
    furnishing: row.furnishing,
    description: row.description,
    photos: row.photos,
    ownerName: row.ownerName,
    ownerPhone: options.showPhone ? row.ownerPhone : null,
    ownerPhoneHidden: !options.showPhone,
    ownerId: row.ownerId,
    ad: {
      link: row.adLink,
      status: row.adStatus,
      postedAt: iso(row.adPostedAt),
      takenDownAt: iso(row.adTakenDownAt),
      lastCheckInAt: iso(row.lastCheckInAt),
      nextCheckInAt: iso(row.reminders[0]?.dueAt ?? null),
    },
    adTakeDownOpen: row._count.reminders > 0,
    notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
