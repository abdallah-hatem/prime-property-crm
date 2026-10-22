import {
  ListingErrorCode,
  type AdStatus,
  type ListingSort,
  type ListingStatus,
  type ReminderKind,
} from '@prime-crm/shared';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { hasPermission } from '../../common/utils/permissions.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `days` whole days after `from` (ad check-ins are due this long after the last one). */
export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/** Who may change a listing (edit, status, ad, check-in, notes, photos): its member, or manageAll. */
export function canManage(
  listing: { assignedToId: string | null },
  user: CurrentUser,
): boolean {
  return (
    hasPermission(user, 'listings.manageAll') ||
    (listing.assignedToId !== null && listing.assignedToId === user.id)
  );
}

/**
 * The owner phone is shown only to the listing's member and to listings.manageAll (invariant:
 * a member never sees a phone of a record not assigned to them).
 */
export const canSeePhone = canManage;

/** `sort` → the Prisma order (stable: ties by id). Default: newest first. */
export function listingOrder(sort: ListingSort | undefined) {
  switch (sort) {
    case 'priceAsc':
      return [{ price: 'asc' as const }, { id: 'asc' as const }];
    case 'priceDesc':
      return [{ price: 'desc' as const }, { id: 'desc' as const }];
    case 'sizeDesc':
      return [{ sizeSqm: 'desc' as const }, { id: 'desc' as const }];
    default:
      return [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
  }
}

/** The reminder work a status change triggers (business doc, flow 7). */
export interface StatusEffects {
  /** Leaving Available: the open check-in closes (no check-ins after a sale). */
  closeCheckIn: boolean;
  /** Leaving Available while the ad is Live: a take-down task, unless one is already open. */
  openTakeDown: boolean;
  /** Back to Available while the ad is Live: check-ins resume, unless one is already open. */
  scheduleCheckIn: boolean;
}

export function statusEffects(
  from: ListingStatus,
  to: ListingStatus,
  adStatus: AdStatus,
  open: { takeDown: boolean; checkIn: boolean },
): StatusEffects {
  const leaving = from === 'AVAILABLE' && to !== 'AVAILABLE';
  const returning = from !== 'AVAILABLE' && to === 'AVAILABLE';
  const live = adStatus === 'LIVE';
  return {
    closeCheckIn: leaving,
    openTakeDown: leaving && live && !open.takeDown,
    scheduleCheckIn: returning && live && !open.checkIn,
  };
}

/** What `PUT /listings/:id/ad` does, or why it refuses. */
export type AdChange =
  | { kind: 'refused'; error: ListingErrorCode; message: string }
  | {
      kind: 'ok';
      link: string | null;
      /** Set postedAt (going Live) / clear it (Not posted); undefined = keep. */
      postedAt?: Date | null;
      /** Set takenDownAt (Taken down) / clear it (Live, Not posted); undefined = keep. */
      takenDownAt?: Date | null;
      /** Ad reminders to close. */
      close: ReminderKind[];
      /** Schedule the first check-in (unless one is open). */
      scheduleCheckIn: boolean;
    };

/**
 * The ad lifecycle. Live needs a link and an Available listing; going Live dates the ad and
 * starts check-ins. Taken down closes the take-down task and any open check-in. Back to Not
 * posted stops check-ins but leaves a take-down task open (it closes only on Taken down).
 * An omitted `link` keeps the stored one.
 */
export function adChange(
  listing: { status: ListingStatus; adStatus: AdStatus; adLink: string | null },
  body: { status: AdStatus; link?: string | null; postedAt?: string },
  now: Date,
): AdChange {
  const link = body.link === undefined ? listing.adLink : body.link;
  const postedAt = body.postedAt ? new Date(body.postedAt) : undefined;

  switch (body.status) {
    case 'LIVE': {
      if (!link) {
        return {
          kind: 'refused',
          error: ListingErrorCode.AD_LINK_REQUIRED,
          message: 'An ad goes Live only with its link',
        };
      }
      if (listing.status !== 'AVAILABLE') {
        return {
          kind: 'refused',
          error: ListingErrorCode.LISTING_NOT_AVAILABLE,
          message: 'An ad goes Live only on an Available listing',
        };
      }
      const goingLive = listing.adStatus !== 'LIVE';
      return {
        kind: 'ok',
        link,
        postedAt: goingLive ? (postedAt ?? now) : postedAt,
        takenDownAt: goingLive ? null : undefined,
        close: [],
        scheduleCheckIn: goingLive,
      };
    }
    case 'TAKEN_DOWN':
      return {
        kind: 'ok',
        link,
        postedAt,
        takenDownAt: listing.adStatus === 'TAKEN_DOWN' ? undefined : now,
        close: ['AD_TAKE_DOWN', 'AD_CHECK_IN'],
        scheduleCheckIn: false,
      };
    case 'NOT_POSTED':
      return {
        kind: 'ok',
        link,
        postedAt: null,
        takenDownAt: null,
        close: ['AD_CHECK_IN'],
        scheduleCheckIn: false,
      };
  }
}

/** Why a check-in is refused, or null when it may go ahead. */
export function checkInRefusal(listing: {
  status: ListingStatus;
  adStatus: AdStatus;
}): { error: ListingErrorCode; message: string } | null {
  if (listing.adStatus !== 'LIVE') {
    return {
      error: ListingErrorCode.AD_NOT_LIVE,
      message: 'Check-ins are for Live ads only',
    };
  }
  if (listing.status !== 'AVAILABLE') {
    return {
      error: ListingErrorCode.LISTING_NOT_AVAILABLE,
      message: 'A listing that is no longer Available gets no check-ins',
    };
  }
  return null;
}
