import { z } from 'zod';
import { PhoneInputSchema } from './auth';
import { PAGE_LIMIT_MAX } from './envelope';
import {
  AdStatusSchema,
  FurnishingSchema,
  ListingPurposeSchema,
  ListingStatusSchema,
  PropertyTypeSchema,
  type Language,
  type PropertyType,
} from './enums';
import { NoteBodySchema, NoteSchema } from './notes';
import {
  AREA_MAX_LENGTH,
  OWNER_NAME_MAX_LENGTH,
  SEARCH_MAX_LENGTH,
} from './owners';
import { PhotoSchema } from './photos';
import { InstantSchema } from './reminders';
import { UserSummarySchema } from './summary';

/**
 * Listings contract (spec, "Listings — /listings"). The API's DTOs mirror these schemas with
 * class-validator; `apps/api/src/domains/listings/dto/listings-contract.spec.ts` checks they
 * agree.
 */

/** Price is a whole EGP amount in this range (business doc, Listing). */
export const LISTING_PRICE_MIN = 1;
export const LISTING_PRICE_MAX = 1_000_000_000;
/** Size in whole square metres, above zero. */
export const LISTING_SIZE_MIN = 1;
export const LISTING_SIZE_MAX = 1_000_000;
/** Negative floors are basements. */
export const LISTING_FLOOR_MIN = -10;
export const LISTING_FLOOR_MAX = 200;
export const LISTING_ROOMS_MAX = 50;
export const COMPOUND_MAX_LENGTH = 100;
export const ADDRESS_MAX_LENGTH = 300;
export const LISTING_DESCRIPTION_MAX_LENGTH = 5000;
export const AD_LINK_MAX_LENGTH = 2000;
/** `POST /listings/assign` accepts at most this many ids. */
export const LISTING_BULK_MAX = 500;
/** A `Listing` carries this many of its latest notes. */
export const LISTING_LATEST_NOTES = 3;

/** Domain error codes of the listing endpoints. */
export const ListingErrorCode = {
  /** The owner already has a live listing. */
  OWNER_ALREADY_LISTED: 'OWNER_ALREADY_LISTED',
  /** Another live listing already has this owner phone. */
  PHONE_IN_LISTING: 'PHONE_IN_LISTING',
  /** The phone belongs to a trashed owner (only told to callers with trash.restore). */
  PHONE_IN_TRASH: 'PHONE_IN_TRASH',
  /** The phone belongs to another owner (a listing's phone can't be moved onto it). */
  PHONE_EXISTS: 'PHONE_EXISTS',
  /** An ad goes Live only with a link. */
  AD_LINK_REQUIRED: 'AD_LINK_REQUIRED',
  /** An ad goes Live, or is checked in, only on an Available listing. */
  LISTING_NOT_AVAILABLE: 'LISTING_NOT_AVAILABLE',
  /** A check-in needs a Live ad. */
  AD_NOT_LIVE: 'AD_NOT_LIVE',
  /** The assignee is missing or deactivated. */
  INVALID_ASSIGNEE: 'INVALID_ASSIGNEE',
} as const;
export type ListingErrorCode =
  (typeof ListingErrorCode)[keyof typeof ListingErrorCode];

// ------------------------------------------------------------------ title

const TYPE_LABEL: Record<Language, Record<PropertyType, string>> = {
  en: {
    APARTMENT: 'Apartment',
    DUPLEX: 'Duplex',
    PENTHOUSE: 'Penthouse',
    STUDIO: 'Studio',
    VILLA: 'Villa',
    TOWNHOUSE: 'Townhouse',
    TWIN_HOUSE: 'Twin house',
    CHALET: 'Chalet',
    OFFICE: 'Office',
    SHOP: 'Shop',
    LAND: 'Land',
  },
  ar: {
    APARTMENT: 'شقة',
    DUPLEX: 'دوبلكس',
    PENTHOUSE: 'بنتهاوس',
    STUDIO: 'استوديو',
    VILLA: 'فيلا',
    TOWNHOUSE: 'تاون هاوس',
    TWIN_HOUSE: 'توين هاوس',
    CHALET: 'شاليه',
    OFFICE: 'مكتب',
    SHOP: 'محل',
    LAND: 'أرض',
  },
};

/** A property type in `language` ("Twin house", "توين هاوس"). */
export function propertyTypeLabel(
  type: PropertyType,
  language: Language,
): string {
  return TYPE_LABEL[language][type];
}

function bedroomsLabel(bedrooms: number, language: Language): string {
  return language === 'ar' ? `${bedrooms} غرف` : `${bedrooms} BR`;
}

/**
 * A listing's title is derived, never typed: type · bedrooms · area, in the reader's language
 * ("Villa · 4 BR · Sheikh Zayed", "فيلا · 4 غرف · Sheikh Zayed"). The area is shown as entered.
 */
export function listingTitle(
  listing: { type: PropertyType; bedrooms: number | null; area: string },
  language: Language,
): string {
  return [
    propertyTypeLabel(listing.type, language),
    listing.bedrooms != null ? bedroomsLabel(listing.bedrooms, language) : null,
    listing.area,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ------------------------------------------------------------------ requests

const OwnerNameSchema = z.string().trim().min(1).max(OWNER_NAME_MAX_LENGTH);
const AreaSchema = z.string().trim().min(1).max(AREA_MAX_LENGTH);
const CompoundSchema = z.string().trim().min(1).max(COMPOUND_MAX_LENGTH);
const AddressSchema = z.string().trim().min(1).max(ADDRESS_MAX_LENGTH);
const DescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(LISTING_DESCRIPTION_MAX_LENGTH);
export const ListingPriceSchema = z
  .number()
  .int()
  .min(LISTING_PRICE_MIN)
  .max(LISTING_PRICE_MAX);
const SizeSchema = z.number().int().min(LISTING_SIZE_MIN).max(LISTING_SIZE_MAX);
const FloorSchema = z
  .number()
  .int()
  .min(LISTING_FLOOR_MIN)
  .max(LISTING_FLOOR_MAX);
const RoomsSchema = z.number().int().min(0).max(LISTING_ROOMS_MAX);

/** The editable property fields, shared by create and update. */
const listingFields = {
  purpose: ListingPurposeSchema,
  type: PropertyTypeSchema,
  area: AreaSchema,
  compound: CompoundSchema,
  address: AddressSchema,
  sizeSqm: SizeSchema,
  floor: FloorSchema,
  bedrooms: RoomsSchema,
  bathrooms: RoomsSchema,
  price: ListingPriceSchema,
  furnishing: FurnishingSchema,
  description: DescriptionSchema,
};

/**
 * `POST /listings`. Either `ownerId` (from an owner: any member for an own owner) or
 * `ownerName` + `ownerPhone` (direct: needs listings.create), never both. `assignedTo` needs
 * owners.assign; by default a listing from an owner goes to the owner's member (else the
 * creator) and a direct one to the creator (a linked owner lead moves with it).
 */
export const CreateListingRequestSchema = z
  .strictObject({
    ownerId: z.uuid().optional(),
    ownerName: OwnerNameSchema.optional(),
    ownerPhone: PhoneInputSchema.optional(),
    purpose: listingFields.purpose,
    type: listingFields.type,
    area: listingFields.area,
    compound: listingFields.compound.optional(),
    address: listingFields.address.optional(),
    sizeSqm: listingFields.sizeSqm,
    floor: listingFields.floor.optional(),
    bedrooms: listingFields.bedrooms.optional(),
    bathrooms: listingFields.bathrooms.optional(),
    price: listingFields.price,
    furnishing: listingFields.furnishing.optional(),
    description: listingFields.description.optional(),
    assignedTo: z.uuid().optional(),
  })
  .refine(
    (body) =>
      body.ownerId !== undefined
        ? body.ownerName === undefined && body.ownerPhone === undefined
        : body.ownerName !== undefined && body.ownerPhone !== undefined,
    'give either ownerId, or ownerName and ownerPhone',
  );
export type CreateListingRequest = z.input<typeof CreateListingRequestSchema>;

/**
 * `PATCH /listings/:id`: any create field except `ownerId` and `assignedTo`. `null` clears an
 * optional field.
 */
export const UpdateListingRequestSchema = z.strictObject({
  ownerName: OwnerNameSchema.optional(),
  ownerPhone: PhoneInputSchema.optional(),
  purpose: listingFields.purpose.optional(),
  type: listingFields.type.optional(),
  area: listingFields.area.optional(),
  compound: listingFields.compound.nullable().optional(),
  address: listingFields.address.nullable().optional(),
  sizeSqm: listingFields.sizeSqm.optional(),
  floor: listingFields.floor.nullable().optional(),
  bedrooms: listingFields.bedrooms.nullable().optional(),
  bathrooms: listingFields.bathrooms.nullable().optional(),
  price: listingFields.price.optional(),
  furnishing: listingFields.furnishing.nullable().optional(),
  description: listingFields.description.nullable().optional(),
});
export type UpdateListingRequest = z.input<typeof UpdateListingRequestSchema>;

/** `POST /listings/:id/status`. */
export const ListingStatusRequestSchema = z.strictObject({
  status: ListingStatusSchema,
});
export type ListingStatusRequest = z.infer<typeof ListingStatusRequestSchema>;

/** An ad link: an http(s) URL. */
export const AdLinkSchema = z
  .url({ protocol: /^https?$/ })
  .max(AD_LINK_MAX_LENGTH);

/**
 * `PUT /listings/:id/ad`. An omitted `link` keeps the stored one; `null` clears it. `LIVE`
 * needs a link and an Available listing. `postedAt` defaults to now when the ad goes Live.
 */
export const UpdateAdRequestSchema = z.strictObject({
  link: AdLinkSchema.nullable().optional(),
  status: AdStatusSchema,
  postedAt: InstantSchema.optional(),
});
export type UpdateAdRequest = z.input<typeof UpdateAdRequestSchema>;

/** `POST /listings/:id/ad/check-in`. The note is added to the listing's notes. */
export const AdCheckInRequestSchema = z.strictObject({
  stillAvailable: z.boolean(),
  note: NoteBodySchema.optional(),
});
export type AdCheckInRequest = z.input<typeof AdCheckInRequestSchema>;

export const AssignListingsRequestSchema = z.strictObject({
  listingIds: z.array(z.uuid()).min(1).max(LISTING_BULK_MAX),
  /** `null` = unassigned. */
  assigneeId: z.uuid().nullable(),
});
export type AssignListingsRequest = z.infer<typeof AssignListingsRequestSchema>;

export const AssignListingsResponseSchema = z.object({
  moved: z.number().int(),
});
export type AssignListingsResponse = z.infer<
  typeof AssignListingsResponseSchema
>;

export const ListingSortSchema = z.enum([
  'newest',
  'priceAsc',
  'priceDesc',
  'sizeDesc',
]);
export type ListingSort = z.infer<typeof ListingSortSchema>;

/** `?type=A&type=B` and `?type=A,B` are the same filter. */
const listParam = (value: unknown) => {
  if (value === undefined || value === '') return undefined;
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) =>
    typeof item === 'string'
      ? item
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [item],
  );
};

const booleanParam = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');
const intParam = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max);

/**
 * `GET /listings` (also `GET /exports/listings`). `status` defaults to `AVAILABLE`. `q` matches
 * the area, compound, address, description or owner name; phone digits match only listings the
 * caller may see the phone of. A min above its max is a 400.
 */
export const ListingListQuerySchema = z
  .strictObject({
    purpose: ListingPurposeSchema.optional(),
    type: z.preprocess(listParam, z.array(PropertyTypeSchema).optional()),
    area: z.string().max(AREA_MAX_LENGTH).optional(),
    compound: z.string().max(COMPOUND_MAX_LENGTH).optional(),
    priceMin: intParam(0, LISTING_PRICE_MAX).optional(),
    priceMax: intParam(0, LISTING_PRICE_MAX).optional(),
    sizeMin: intParam(0, LISTING_SIZE_MAX).optional(),
    sizeMax: intParam(0, LISTING_SIZE_MAX).optional(),
    bedroomsMin: intParam(0, LISTING_ROOMS_MAX).optional(),
    bathroomsMin: intParam(0, LISTING_ROOMS_MAX).optional(),
    floorMin: intParam(LISTING_FLOOR_MIN, LISTING_FLOOR_MAX).optional(),
    floorMax: intParam(LISTING_FLOOR_MIN, LISTING_FLOOR_MAX).optional(),
    status: z.preprocess(listParam, z.array(ListingStatusSchema).optional()),
    adStatus: AdStatusSchema.optional(),
    assignedTo: z
      .union([z.literal('me'), z.literal('unassigned'), z.uuid()])
      .optional(),
    checkInDue: booleanParam.optional(),
    q: z.string().max(SEARCH_MAX_LENGTH).optional(),
    sort: ListingSortSchema.optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).optional(),
  })
  .refine(
    (q) =>
      [
        [q.priceMin, q.priceMax],
        [q.sizeMin, q.sizeMax],
        [q.floorMin, q.floorMax],
      ].every(
        ([min, max]) => min === undefined || max === undefined || min <= max,
      ),
    'a minimum must not be above its maximum',
  );
export type ListingListQuery = z.input<typeof ListingListQuerySchema>;

// ------------------------------------------------------------------ responses

/** A search row. It never carries the owner's phone, for anyone. */
export const ListingRowSchema = z.object({
  id: z.uuid(),
  /** Derived: type · bedrooms · area, in the caller's language. */
  title: z.string(),
  purpose: ListingPurposeSchema,
  type: PropertyTypeSchema,
  area: z.string(),
  compound: z.string().nullable(),
  price: z.number().int(),
  sizeSqm: z.number().int(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  floor: z.number().int().nullable(),
  status: ListingStatusSchema,
  coverPhotoUrl: z.string().nullable(),
  adStatus: AdStatusSchema,
  assignedTo: UserSummarySchema.nullable(),
  /** An open ad check-in is due by the end of today (Cairo). */
  checkInDue: z.boolean(),
});
export type ListingRow = z.infer<typeof ListingRowSchema>;

export const ListingAdSchema = z.object({
  link: z.string().nullable(),
  status: AdStatusSchema,
  postedAt: z.string().nullable(),
  takenDownAt: z.string().nullable(),
  lastCheckInAt: z.string().nullable(),
  /** Due time of the open check-in, if any. */
  nextCheckInAt: z.string().nullable(),
});
export type ListingAd = z.infer<typeof ListingAdSchema>;

/**
 * One listing. `ownerPhone` is null with `ownerPhoneHidden: true` unless the listing is
 * assigned to the caller or the caller holds listings.manageAll.
 */
export const ListingSchema = ListingRowSchema.extend({
  address: z.string().nullable(),
  furnishing: FurnishingSchema.nullable(),
  description: z.string().nullable(),
  /** Live photos in display order; the first is the cover. */
  photos: z.array(PhotoSchema),
  ownerName: z.string(),
  ownerPhone: z.string().nullable(),
  ownerPhoneHidden: z.boolean(),
  ownerId: z.uuid().nullable(),
  ad: ListingAdSchema,
  /** The latest 3 notes, newest first. */
  notes: z.array(NoteSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Listing = z.infer<typeof ListingSchema>;
