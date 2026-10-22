import { BadRequestException, ConflictException } from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { PhotosService } from './photos.service';

const TX = { tx: true };
const ID = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';
const HOST = 'store.private.blob.vercel-storage.com';
const member: CurrentUser = {
  id: 'm1',
  roleId: 'r',
  permissions: [],
  isAdmin: false,
};
const body = (file = 'a.jpg') => ({
  url: `https://${HOST}/listings/${ID}/${file}`,
  pathname: `listings/${ID}/${file}`,
});

function makeService(photos: Record<string, jest.Mock> = {}, hosts = [HOST]) {
  const repo = {
    countLive: jest.fn().mockResolvedValue(0),
    nextOrder: jest.fn().mockResolvedValue(0),
    findLiveByUrl: jest.fn().mockResolvedValue(null),
    createPhoto: jest.fn((_tx: unknown, d: { url: string; order: number }) =>
      Promise.resolve({ id: 'p1', url: d.url, order: d.order }),
    ),
    liveOf: jest.fn().mockResolvedValue([]),
    reorder: jest.fn(),
    findWithListing: jest.fn().mockResolvedValue(null),
    ...photos,
  };
  const listings = { lockManageable: jest.fn().mockResolvedValue({}) };
  const svc = new PhotosService(
    { transaction: jest.fn((w: (tx: unknown) => unknown) => w(TX)) } as never,
    repo as never,
    listings as never,
    { softDelete: jest.fn() } as never,
    { hosts: () => hosts, token: () => undefined } as never,
  );
  return { svc, repo };
}

describe('PhotosService', () => {
  it('Photo registration with a URL not on our Blob store → 400 (checklist: input trust)', async () => {
    const { svc, repo } = makeService();
    await expect(
      svc.register(
        ID,
        { ...body(), url: `https://evil.example/listings/${ID}/a.jpg` },
        member,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repo.createPhoto).not.toHaveBeenCalled();
    expect(await svc.register(ID, body(), member)).toEqual({
      id: 'p1',
      url: body().url,
      order: 0,
    });
  });

  it('31st photo → 409 TOO_MANY_PHOTOS (contract)', async () => {
    const { svc } = makeService({ countLive: jest.fn().mockResolvedValue(30) });
    await expect(svc.register(ID, body(), member)).rejects.toThrow(
      ConflictException,
    );
  });

  it('Reorder with a missing or foreign photo id → 400 (contract)', async () => {
    const { svc, repo } = makeService({
      liveOf: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
    });
    await expect(svc.reorder(ID, { photoIds: ['a'] }, member)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      svc.reorder(ID, { photoIds: ['a', 'x'] }, member),
    ).rejects.toThrow(BadRequestException);
    await svc.reorder(ID, { photoIds: ['b', 'a'] }, member);
    expect(repo.reorder).toHaveBeenCalledWith(TX, ['b', 'a']);
  });

  it('restore: PARENT_DELETED while the listing is in the trash; TOO_MANY_PHOTOS when full', async () => {
    const trashedParent = makeService({
      findWithListing: jest
        .fn()
        .mockResolvedValue({
          listingId: ID,
          listing: { deletedAt: new Date() },
        }),
    });
    await expect(
      trashedParent.svc.validateRestore(TX as never, 'p1'),
    ).rejects.toMatchObject({
      response: { error: 'PARENT_DELETED' },
    });
    const full = makeService({
      findWithListing: jest
        .fn()
        .mockResolvedValue({ listingId: ID, listing: { deletedAt: null } }),
      countLive: jest.fn().mockResolvedValue(30),
    });
    await expect(
      full.svc.validateRestore(TX as never, 'p1'),
    ).rejects.toMatchObject({
      response: { error: 'TOO_MANY_PHOTOS' },
    });
  });

  it('503 UPLOADS_NOT_CONFIGURED without a store', async () => {
    const { svc } = makeService({}, []);
    await expect(svc.register(ID, body(), member)).rejects.toMatchObject({
      response: { error: 'UPLOADS_NOT_CONFIGURED' },
    });
  });
});
