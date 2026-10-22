import type {
  AdStatus,
  ListingPurpose,
  ListingStatus,
  PropertyType,
} from '@prime-crm/shared';

/** `q` after parsing and scoping. */
export interface ListingSearch {
  text: string;
  /** Digits to look for in owner phones; null = text only. */
  phoneDigits: string | null;
  /**
   * Phone digits match only listings assigned to this member (the caller); null = every
   * listing (listings.manageAll). A member's search never reaches a phone they can't see.
   */
  phoneMemberId: string | null;
}

/** The `GET /listings` filters after defaults and scoping. */
export interface ListingFilter {
  purpose?: ListingPurpose;
  types?: PropertyType[];
  area?: string;
  compound?: string;
  priceMin?: number;
  priceMax?: number;
  sizeMin?: number;
  sizeMax?: number;
  bedroomsMin?: number;
  bathroomsMin?: number;
  floorMin?: number;
  floorMax?: number;
  /** Never empty: defaults to AVAILABLE. */
  statuses: ListingStatus[];
  adStatus?: AdStatus;
  /** `null` = unassigned only. */
  assignedTo?: string | null;
  /** Has (due) or lacks (!due) an open check-in due before `before` (end of today, Cairo). */
  checkInDue?: { due: boolean; before: Date };
  search?: ListingSearch;
}

/** A listings-export row (T11): the search row's fields plus details; owner only where visible. */
export interface ListingExportRow {
  title: string;
  purpose: ListingPurpose;
  type: PropertyType;
  area: string;
  compound: string | null;
  address: string | null;
  price: number;
  sizeSqm: number;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  furnishing: 'UNFURNISHED' | 'SEMI_FURNISHED' | 'FURNISHED' | null;
  status: ListingStatus;
  adStatus: AdStatus;
  adLink: string | null;
  /** Null where the caller may not see the owner's phone. */
  ownerName: string | null;
  ownerPhone: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: Date;
}
