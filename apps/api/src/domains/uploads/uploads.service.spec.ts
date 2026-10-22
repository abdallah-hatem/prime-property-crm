import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { UploadsService } from './uploads.service';

const ID = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';
const member: CurrentUser = {
  id: 'm1',
  roleId: 'r',
  permissions: [],
  isAdmin: false,
};
const REQUEST = {} as never;

const event = (
  pathname = `listings/${ID}/a.jpg`,
  clientPayload: string | null = JSON.stringify({ listingId: ID }),
) => ({
  type: 'blob.generate-client-token' as const,
  payload: { pathname, clientPayload, multipart: false },
});

function makeService(token: string | null = 'vercel_blob_rw_store_secret') {
  const listings = { assertManageable: jest.fn().mockResolvedValue(undefined) };
  const blob = {
    token: jest.fn(() => token ?? undefined),
    hosts: jest.fn(() => []),
  };
  const gateway = {
    issueToken: jest.fn((input: { options: (p: string) => Promise<unknown> }) =>
      input
        .options('x')
        .then((options) => ({
          type: 'blob.generate-client-token',
          clientToken: 't',
          options,
        })),
    ),
  };
  const svc = new UploadsService(
    listings as never,
    blob as never,
    gateway as never,
  );
  return { svc, listings, gateway };
}

describe('UploadsService', () => {
  it("Upload token for a listing the member isn't assigned → 403 (role)", async () => {
    const { svc, listings, gateway } = makeService();
    listings.assertManageable.mockRejectedValue(new ForbiddenException());
    await expect(
      svc.listingPhotoToken(event(), REQUEST, member),
    ).rejects.toThrow(ForbiddenException);
    expect(gateway.issueToken).not.toHaveBeenCalled();
  });

  it('signs JPEG, PNG and WebP up to 10 MB for the listing folder', async () => {
    const { svc, listings, gateway } = makeService();
    const result = await svc.listingPhotoToken(event(), REQUEST, member);
    expect(listings.assertManageable).toHaveBeenCalledWith(ID, member);
    expect(gateway.issueToken).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'vercel_blob_rw_store_secret' }),
    );
    expect(result).toMatchObject({
      options: {
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maximumSizeInBytes: 10 * 1024 * 1024,
        tokenPayload: JSON.stringify({ listingId: ID }),
      },
    });
  });

  it('refuses a pathname outside the folder or a bad clientPayload; 503 without a token', async () => {
    const { svc } = makeService();
    for (const e of [
      event(`listings/other/a.jpg`),
      event(undefined, 'x'),
      event(undefined, null),
      event(undefined, '{"listingId":"no"}'),
    ]) {
      await expect(svc.listingPhotoToken(e, REQUEST, member)).rejects.toThrow(
        BadRequestException,
      );
    }
    await expect(
      makeService(null).svc.listingPhotoToken(event(), REQUEST, member),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
