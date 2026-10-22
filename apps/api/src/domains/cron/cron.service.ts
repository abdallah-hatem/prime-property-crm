import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/providers/clock';
import { SettingsRepository } from '../../common/repositories/settings.repository';
import { trashCutoff } from '../../common/utils/trash.util';
import { BlobConfig } from '../uploads/blob.config';
import { BlobFilesGateway } from './blob-files.gateway';
import { CronRepository } from './repositories/cron.repository';

/** Rows per batch, and batches per run per kind (the rest waits for the next night). */
export const CRON_BATCH = 200;
export const CRON_MAX_BATCHES = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Expired refresh tokens are kept this long (T4 follow-up). */
export const REFRESH_TOKEN_RETENTION_DAYS = 30;
/** Failed sign-ins only matter for 15 minutes; a day is plenty. */
export const LOGIN_ATTEMPT_RETENTION_DAYS = 1;

export interface PurgeResult {
  photos: number;
  listings: number;
  owners: number;
  refreshTokens: number;
  loginAttempts: number;
}

export interface AdCheckInsResult {
  added: number;
  duplicatesRemoved: number;
}

/** Runs `batch` until it returns less than a full batch, at most CRON_MAX_BATCHES times. */
async function drain(batch: () => Promise<number>): Promise<number> {
  let total = 0;
  for (let i = 0; i < CRON_MAX_BATCHES; i++) {
    const n = await batch();
    total += n;
    if (n < CRON_BATCH) break;
  }
  return total;
}

/**
 * The scheduled jobs (Vercel cron, daily). Both are idempotent: a second run finds nothing to
 * do, and a run cut short leaves the rest for the next one.
 */
@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly cron: CronRepository,
    private readonly settings: SettingsRepository,
    private readonly blob: BlobConfig,
    private readonly files: BlobFilesGateway,
    private readonly clock: Clock,
  ) {}

  /**
   * Removes for good what has been in the trash more than 30 days (`trashCutoff`, the same
   * boundary the trash list uses): photos (their Blob files first), listings, owners. Calls
   * are never deleted: a purged owner's calls keep its name. Also drops refresh tokens expired
   * over 30 days ago and failed sign-ins older than a day.
   */
  async purge(): Promise<PurgeResult> {
    const now = this.clock.now();
    const cutoff = trashCutoff(now);
    const token = this.blob.token();

    const photos = await drain(async () => {
      const batch = await this.cron.photosToPurge(cutoff, CRON_BATCH);
      if (token && batch.length) {
        try {
          await this.files.delete(
            batch.map((p) => p.url),
            token,
          );
        } catch (error) {
          // The rows stay (and so do their listings), so the next run tries again; the rest
          // of the purge still runs.
          this.logger.warn(`purge: Blob delete failed: ${String(error)}`);
          return 0;
        }
      }
      return this.cron.deletePhotos(batch.map((p) => p.id));
    });
    const listings = await drain(() =>
      this.cron.purgeListings(cutoff, CRON_BATCH),
    );
    const owners = await drain(() => this.cron.purgeOwners(cutoff, CRON_BATCH));
    const refreshTokens = await drain(() =>
      this.cron.purgeRefreshTokens(
        new Date(now.getTime() - REFRESH_TOKEN_RETENTION_DAYS * DAY_MS),
        CRON_BATCH,
      ),
    );
    const loginAttempts = await drain(() =>
      this.cron.purgeLoginAttempts(
        new Date(now.getTime() - LOGIN_ATTEMPT_RETENTION_DAYS * DAY_MS),
        CRON_BATCH,
      ),
    );
    const result = { photos, listings, owners, refreshTokens, loginAttempts };
    this.logger.log(`purge ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Safety net for ad follow-up: every Live ad on an Available listing that isn't in the trash
   * has exactly one open check-in. Missing ones are added at the current interval; extra ones
   * are removed. Listings that aren't Available, or are deleted, are left alone.
   */
  async adCheckIns(): Promise<AdCheckInsResult> {
    const now = this.clock.now();
    const days = await this.settings.adCheckInDays();
    const duplicatesRemoved = await this.cron.removeDuplicateCheckIns();
    const added = await drain(() =>
      this.cron.addMissingCheckIns(now, days, CRON_BATCH),
    );
    const result = { added, duplicatesRemoved };
    this.logger.log(`ad-check-ins ${JSON.stringify(result)}`);
    return result;
  }
}
