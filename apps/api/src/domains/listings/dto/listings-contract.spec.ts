import 'reflect-metadata';
import {
  AdCheckInRequestSchema,
  AssignListingsRequestSchema,
  CreateListingRequestSchema,
  LISTING_BULK_MAX,
  ListingListQuerySchema,
  ListingPhotoUploadRequestSchema,
  ListingStatusRequestSchema,
  RegisterPhotoRequestSchema,
  ReorderPhotosRequestSchema,
  UpdateAdRequestSchema,
  UpdateListingRequestSchema,
} from '@prime-crm/shared';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { ZodType } from 'zod';
import { RegisterPhotoDto, ReorderPhotosDto } from '../../photos/dto/photo.dto';
import { ListingPhotoUploadDto } from '../../uploads/dto/listing-photo-upload.dto';
import { CreateListingDto } from './create-listing.dto';
import {
  AdCheckInDto,
  AssignListingsDto,
  ListingStatusDto,
  UpdateAdDto,
} from './listing-actions.dto';
import { ListingListQueryDto } from './listing-query.dto';
import { UpdateListingDto } from './update-listing.dto';

/** The DTOs mirror the shared zod contract: both accept and refuse the same bodies. */
async function dtoAccepts(dto: ClassConstructor<object>, body: unknown) {
  const errors = await validate(plainToInstance(dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.length === 0;
}

const ID = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';
const HOST = 'store.private.blob.vercel-storage.com';
const BASE = {
  purpose: 'SALE',
  type: 'VILLA',
  area: 'Sheikh Zayed',
  sizeSqm: 300,
  price: 9_000_000,
};
const DIRECT = { ...BASE, ownerName: 'أحمد', ownerPhone: '01001234567' };

const cases: [string, ClassConstructor<object>, ZodType, unknown[]][] = [
  [
    'create listing',
    CreateListingDto,
    CreateListingRequestSchema,
    [
      { ...BASE, ownerId: ID },
      DIRECT,
      {
        ...DIRECT,
        compound: ' Allegria ',
        address: 'St 9',
        floor: -1,
        bedrooms: 0,
        bathrooms: 2,
        furnishing: 'FURNISHED',
        description: 'فيلا 🌳',
        assignedTo: ID,
      },
      BASE,
      { ...BASE, ownerName: 'A' },
      { ...BASE, ownerPhone: '01001234567' },
      { ...DIRECT, ownerId: ID },
      { ...BASE, ownerId: ID, ownerPhone: '01001234567' },
      { ...BASE, ownerId: 'x' },
      { ...DIRECT, ownerPhone: '12345' },
      { ...DIRECT, price: 0 },
      { ...DIRECT, price: 1 },
      { ...DIRECT, price: 1_000_000_000 },
      { ...DIRECT, price: 1_000_000_001 },
      { ...DIRECT, price: 1500.5 },
      { ...DIRECT, price: '100' },
      { ...DIRECT, sizeSqm: 0 },
      { ...DIRECT, sizeSqm: 1.5 },
      { ...DIRECT, floor: -11 },
      { ...DIRECT, floor: 201 },
      { ...DIRECT, bedrooms: -1 },
      { ...DIRECT, bedrooms: 51 },
      { ...DIRECT, purpose: 'LEASE' },
      { ...DIRECT, type: 'CASTLE' },
      { ...DIRECT, area: '  ' },
      { ...DIRECT, area: 'a'.repeat(101) },
      { ...DIRECT, compound: null },
      { ...DIRECT, description: 'd'.repeat(5001) },
      { ...DIRECT, status: 'SOLD' },
      { ...DIRECT, assignedTo: 'x' },
      { ...DIRECT, assignedTo: null },
    ],
  ],
  [
    'update listing',
    UpdateListingDto,
    UpdateListingRequestSchema,
    [
      {},
      { price: 5 },
      { compound: null, floor: null, bedrooms: null, furnishing: null },
      { ownerName: 'Sara', ownerPhone: '+20 110 123 4567' },
      { price: null },
      { area: null },
      { ownerId: ID },
      { assignedTo: ID },
      { price: 1500.5 },
      { sizeSqm: 0 },
      { furnishing: 'NONE' },
    ],
  ],
  [
    'status',
    ListingStatusDto,
    ListingStatusRequestSchema,
    [{ status: 'SOLD' }, { status: 'GONE' }, {}, { status: 'SOLD', x: 1 }],
  ],
  [
    'ad',
    UpdateAdDto,
    UpdateAdRequestSchema,
    [
      { status: 'LIVE', link: 'https://www.propertyfinder.eg/en/plp/1.html' },
      { status: 'LIVE' },
      { status: 'NOT_POSTED', link: null },
      { status: 'TAKEN_DOWN', postedAt: '2026-10-20T09:00:00Z' },
      { status: 'LIVE', link: 'http://x' },
      { status: 'LIVE', link: 'ftp://x.com' },
      { status: 'LIVE', link: 'http:example.com' },
      { status: 'LIVE', link: 'javascript:alert(1)' },
      { status: 'LIVE', link: 'not a url' },
      { status: 'LIVE', postedAt: '2026-10-20' },
      { status: 'LIVE', postedAt: null },
      { status: 'GONE' },
      { link: 'https://x.com' },
    ],
  ],
  [
    'check-in',
    AdCheckInDto,
    AdCheckInRequestSchema,
    [
      { stillAvailable: true },
      { stillAvailable: false, note: ' متاحة ' },
      { stillAvailable: 'true' },
      { stillAvailable: true, note: '  ' },
      { stillAvailable: true, note: null },
      {},
    ],
  ],
  [
    'assign listings',
    AssignListingsDto,
    AssignListingsRequestSchema,
    [
      { listingIds: [ID], assigneeId: ID },
      { listingIds: [ID], assigneeId: null },
      { listingIds: [ID] },
      { listingIds: [], assigneeId: null },
      { listingIds: ['x'], assigneeId: null },
      {
        listingIds: Array.from({ length: LISTING_BULK_MAX + 1 }, () => ID),
        assigneeId: null,
      },
    ],
  ],
  [
    'register photo',
    RegisterPhotoDto,
    RegisterPhotoRequestSchema,
    [
      {
        url: `https://${HOST}/listings/${ID}/a.jpg`,
        pathname: `listings/${ID}/a.jpg`,
      },
      { url: `http://${HOST}/a.jpg`, pathname: 'a.jpg' },
      { url: 'nope', pathname: 'a.jpg' },
      { url: `https://${HOST}/a.jpg`, pathname: '' },
      { url: `https://${HOST}/a.jpg` },
    ],
  ],
  [
    'reorder photos',
    ReorderPhotosDto,
    ReorderPhotosRequestSchema,
    [
      { photoIds: [ID] },
      { photoIds: [] },
      { photoIds: [ID, ID] },
      { photoIds: ['x'] },
      {
        photoIds: Array.from({ length: 31 }, (_, i) =>
          ID.replace(/0$/, String(i % 10)),
        ),
      },
    ],
  ],
  [
    'upload handshake',
    ListingPhotoUploadDto,
    ListingPhotoUploadRequestSchema,
    [
      {
        type: 'blob.generate-client-token',
        payload: { pathname: 'a.jpg', clientPayload: '{}', multipart: false },
      },
      { type: 'blob.generate-client-token', payload: { pathname: 'a.jpg' } },
      {
        type: 'blob.generate-client-token',
        payload: { pathname: 'a.jpg', clientPayload: null },
      },
      { type: 'blob.upload-completed', payload: { pathname: 'a.jpg' } },
      { type: 'blob.generate-client-token', payload: { pathname: '' } },
      {
        type: 'blob.generate-client-token',
        payload: { pathname: 'a.jpg', extra: 1 },
      },
      { type: 'blob.generate-client-token' },
    ],
  ],
];

const queries: Record<string, string | string[]>[] = [
  {},
  { type: 'VILLA,STUDIO', status: ['SOLD', 'RENTED'] },
  { priceMin: '10', priceMax: '5' },
  { priceMin: '5', priceMax: '10' },
  { sizeMin: '200', sizeMax: '100' },
  { floorMin: '-2', floorMax: '-1' },
  { floorMin: '3', floorMax: '1' },
  { bedroomsMin: '0' },
  { priceMin: '-1' },
  { floorMin: '1.5' },
  { type: 'CASTLE' },
  { assignedTo: 'me' },
  { assignedTo: 'bob' },
  { checkInDue: 'true' },
  { checkInDue: 'yes' },
  { sort: 'priceAsc' },
  { sort: 'cheap' },
  { limit: '21' },
  { page: '0' },
  { unknown: '1' },
];

describe('listing DTOs agree with the shared contract', () => {
  for (const [name, dto, schema, bodies] of cases) {
    it.each(bodies.map((body) => [JSON.stringify(body).slice(0, 80), body]))(
      `${name}: %s`,
      async (_label, body) => {
        expect(await dtoAccepts(dto, body)).toBe(
          schema.safeParse(body).success,
        );
      },
    );
  }

  it.each(queries.map((q) => [JSON.stringify(q), q]))(
    'search query: %s',
    async (_label, query) => {
      expect(await dtoAccepts(ListingListQueryDto, query)).toBe(
        ListingListQuerySchema.safeParse(query).success,
      );
    },
  );
});
