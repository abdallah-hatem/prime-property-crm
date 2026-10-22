import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { trashCutoff } from '../../common/utils/trash.util';
import { CronSecretGuard, cronAuthorized } from './cron-secret.guard';
import { CRON_BATCH, CronService } from './cron.service';

const NOW = new Date('2026-10-23T01:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function makeService(over: Record<string, jest.Mock> = {}, token?: string) {
  const repo: Record<string, jest.Mock> = {
    photosToPurge: jest.fn().mockResolvedValue([]),
    deletePhotos: jest.fn((ids: string[]) => Promise.resolve(ids.length)),
    purgeListings: jest.fn().mockResolvedValue(0),
    purgeOwners: jest.fn().mockResolvedValue(0),
    purgeRefreshTokens: jest.fn().mockResolvedValue(0),
    purgeLoginAttempts: jest.fn().mockResolvedValue(0),
    addMissingCheckIns: jest.fn().mockResolvedValue(0),
    removeDuplicateCheckIns: jest.fn().mockResolvedValue(0),
    ...over,
  };
  const files = { delete: jest.fn().mockResolvedValue(undefined) };
  const settings = { adCheckInDays: jest.fn().mockResolvedValue(7) };
  const svc = new CronService(
    repo as never,
    settings as never,
    { token: () => token } as never,
    files,
    { now: () => NOW },
  );
  return { svc, repo, files };
}

describe('CronService.purge', () => {
  it('Purge removes only records deleted > 30 days ago, deletes their Blob files, keeps calls (invariant: calls never deleted; owners with calls → calls kept with owner name snapshot)', async () => {
    const photos = [
      { id: 'p1', url: 'https://s.blob/1.jpg' },
      { id: 'p2', url: 'https://s.blob/2.jpg' },
    ];
    const { svc, repo, files } = makeService(
      {
        photosToPurge: jest
          .fn()
          .mockResolvedValueOnce(photos)
          .mockResolvedValue([]),
        purgeOwners: jest.fn().mockResolvedValueOnce(3).mockResolvedValue(0),
      },
      'vercel_blob_rw_store_x',
    );
    const result = await svc.purge();
    const cutoff = trashCutoff(NOW);
    expect(repo.photosToPurge).toHaveBeenCalledWith(cutoff, CRON_BATCH);
    expect(repo.purgeListings).toHaveBeenCalledWith(cutoff, CRON_BATCH);
    expect(repo.purgeOwners).toHaveBeenCalledWith(cutoff, CRON_BATCH);
    // The files go before the rows.
    expect(files.delete).toHaveBeenCalledWith(
      photos.map((p) => p.url),
      'vercel_blob_rw_store_x',
    );
    expect(files.delete.mock.invocationCallOrder[0]).toBeLessThan(
      repo.deletePhotos.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({ photos: 2, owners: 3, listings: 0 });
  });

  it('a failed Blob delete keeps the photo rows; the rest of the purge runs', async () => {
    const { svc, repo, files } = makeService(
      {
        photosToPurge: jest
          .fn()
          .mockResolvedValue([{ id: 'p1', url: 'https://s.blob/1.jpg' }]),
      },
      'tok',
    );
    files.delete.mockRejectedValue(new Error('down'));
    const result = await svc.purge();
    expect(repo.deletePhotos).not.toHaveBeenCalled();
    expect(result.photos).toBe(0);
    // The rest of the purge still runs.
    expect(repo.purgeOwners).toHaveBeenCalled();
    expect(repo.purgeRefreshTokens).toHaveBeenCalled();
  });

  it('batches: keeps going while batches are full, stops at a short one', async () => {
    const { svc, repo } = makeService({
      purgeListings: jest
        .fn()
        .mockResolvedValueOnce(CRON_BATCH)
        .mockResolvedValueOnce(CRON_BATCH)
        .mockResolvedValueOnce(5),
    });
    const result = await svc.purge();
    expect(repo.purgeListings).toHaveBeenCalledTimes(3);
    expect(result.listings).toBe(2 * CRON_BATCH + 5);
  });

  it('Purge cron also deletes refresh tokens expired > 30 days and login attempts older than 1 day (T4 follow-up)', async () => {
    const { svc, repo } = makeService();
    await svc.purge();
    expect(repo.purgeRefreshTokens).toHaveBeenCalledWith(
      new Date(NOW.getTime() - 30 * DAY),
      CRON_BATCH,
    );
    expect(repo.purgeLoginAttempts).toHaveBeenCalledWith(
      new Date(NOW.getTime() - DAY),
      CRON_BATCH,
    );
  });

  it('without a Blob token there are no files to delete: rows still go', async () => {
    const { svc, repo, files } = makeService({
      photosToPurge: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'p1', url: 'u' }])
        .mockResolvedValue([]),
    });
    await svc.purge();
    expect(files.delete).not.toHaveBeenCalled();
    expect(repo.deletePhotos).toHaveBeenCalledWith(['p1']);
  });
});

describe('CronService.adCheckIns', () => {
  it('Ad safety-net cron: LIVE ad with no open check-in gets one; LIVE ad with one gets none extra (contract)', async () => {
    const { svc, repo } = makeService({
      addMissingCheckIns: jest.fn().mockResolvedValueOnce(2),
      removeDuplicateCheckIns: jest.fn().mockResolvedValue(1),
    });
    expect(await svc.adCheckIns()).toEqual({
      added: 2,
      duplicatesRemoved: 1,
    });
    expect(repo.addMissingCheckIns).toHaveBeenCalledWith(NOW, 7, CRON_BATCH);
  });
});

describe('CronSecretGuard', () => {
  const ctx = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
    }) as unknown as ExecutionContext;
  const guard = (secret?: string) =>
    new CronSecretGuard({ secret: () => secret } as never);

  it('Purge cron without the secret → 401 (contract)', () => {
    const s = 'a-very-long-cron-secret';
    expect(guard(s).canActivate(ctx(`Bearer ${s}`))).toBe(true);
    for (const auth of [undefined, '', s, `Bearer ${s}x`, 'Bearer ']) {
      expect(() => guard(s).canActivate(ctx(auth))).toThrow(
        UnauthorizedException,
      );
    }
  });

  it('refuses everything when CRON_SECRET is unset', () => {
    for (const auth of [undefined, 'Bearer ', 'Bearer undefined']) {
      expect(() => guard(undefined).canActivate(ctx(auth))).toThrow(
        UnauthorizedException,
      );
    }
    expect(cronAuthorized('Bearer abc', 'abc')).toBe(true);
    expect(cronAuthorized('Bearer abd', 'abc')).toBe(false);
  });
});
