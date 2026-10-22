import { describe, expect, it } from 'vitest';
import {
  CreateListingRequestSchema,
  ListingListQuerySchema,
  listingTitle,
  UpdateListingRequestSchema,
} from './listings';
import { listingPhotoPathname, ReorderPhotosRequestSchema } from './photos';

const ID = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';
const BASE = {
  purpose: 'SALE',
  type: 'VILLA',
  area: 'Sheikh Zayed',
  sizeSqm: 300,
  price: 9_000_000,
};

describe('listings contract', () => {
  it('derives the title in the reader language', () => {
    const villa = { type: 'VILLA' as const, bedrooms: 4, area: 'Sheikh Zayed' };
    expect(listingTitle(villa, 'en')).toBe('Villa · 4 BR · Sheikh Zayed');
    expect(listingTitle(villa, 'ar')).toBe('فيلا · 4 غرف · Sheikh Zayed');
    expect(
      listingTitle({ type: 'TWIN_HOUSE', bedrooms: null, area: 'Maadi' }, 'en'),
    ).toBe('Twin house · Maadi');
    expect(
      listingTitle({ type: 'STUDIO', bedrooms: 0, area: 'Maadi' }, 'en'),
    ).toBe('Studio · 0 BR · Maadi');
  });

  it('create takes ownerId or ownerName + ownerPhone, never both', () => {
    const ok = (body: object) =>
      CreateListingRequestSchema.safeParse({ ...BASE, ...body }).success;
    expect(ok({ ownerId: ID })).toBe(true);
    expect(ok({ ownerName: 'أحمد', ownerPhone: '01001234567' })).toBe(true);
    expect(ok({})).toBe(false);
    expect(ok({ ownerName: 'أحمد' })).toBe(false);
    expect(ok({ ownerId: ID, ownerPhone: '01001234567' })).toBe(false);
  });

  it('price is a whole EGP amount from 1 to 1,000,000,000', () => {
    const ok = (price: unknown) =>
      CreateListingRequestSchema.safeParse({ ...BASE, ownerId: ID, price })
        .success;
    expect([0, 1, 1e9, 1e9 + 1, 1500.5, -1, '100'].map(ok)).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('update refuses ownerId and assignedTo', () => {
    expect(UpdateListingRequestSchema.safeParse({ ownerId: ID }).success).toBe(
      false,
    );
    expect(
      UpdateListingRequestSchema.safeParse({ assignedTo: ID }).success,
    ).toBe(false);
    expect(UpdateListingRequestSchema.safeParse({ floor: null }).success).toBe(
      true,
    );
  });

  it('search: min above max is refused, negative floors are allowed', () => {
    const ok = (q: object) => ListingListQuerySchema.safeParse(q).success;
    expect(ok({ priceMin: '10', priceMax: '5' })).toBe(false);
    expect(ok({ sizeMin: '10', sizeMax: '5' })).toBe(false);
    expect(ok({ floorMin: '2', floorMax: '-1' })).toBe(false);
    expect(ok({ floorMin: '-2', floorMax: '3', bedroomsMin: '0' })).toBe(true);
    expect(ok({ type: 'VILLA,STUDIO', status: ['SOLD'] })).toBe(true);
  });
});

describe('photos contract', () => {
  it('builds a safe pathname under the listing folder', () => {
    expect(listingPhotoPathname(ID, 'My photo (1).JPG')).toBe(
      `listings/${ID}/My-photo-1-.JPG`,
    );
    expect(listingPhotoPathname(ID, '../../x')).toBe(`listings/${ID}/..-..-x`);
  });

  it('reorder ids are distinct', () => {
    expect(
      ReorderPhotosRequestSchema.safeParse({ photoIds: [ID, ID] }).success,
    ).toBe(false);
  });
});
