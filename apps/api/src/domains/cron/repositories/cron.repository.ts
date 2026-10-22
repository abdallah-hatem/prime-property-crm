import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service';

/** A timestamp parameter for raw SQL against `timestamp(3)` (UTC) columns. */
const ts = (at: Date) => Prisma.sql`${at.toISOString()}::timestamp`;

/** Advisory lock key: one ad check-in sweep at a time. */
const CHECK_IN_SWEEP_LOCK = 4_811_001;

/**
 * The scheduled jobs' bulk reads and writes. Every method works on one batch (`take` rows) so a
 * run never holds a long transaction, and running it again finds nothing left to do.
 */
@Injectable()
export class CronRepository {
  constructor(private readonly db: DatabaseService) {}

  // ------------------------------------------------------------------ purge

  /**
   * Photos to purge: deleted before `cutoff` themselves, or belonging to a listing deleted
   * before it (those go with their listing). With their Blob URL, to delete the file first.
   */
  photosToPurge(
    cutoff: Date,
    take: number,
  ): Promise<{ id: string; url: string }[]> {
    return this.db.photo.findMany({
      where: {
        OR: [
          { deletedAt: { lt: cutoff } },
          { listing: { deletedAt: { lt: cutoff } } },
        ],
      },
      select: { id: true, url: true },
      orderBy: { id: 'asc' },
      take,
    });
  }

  async deletePhotos(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { count } = await this.db.photo.deleteMany({
      where: { id: { in: ids } },
    });
    return count;
  }

  /**
   * Listings deleted before `cutoff`, one batch. Their reminders and notes go with them
   * (cascade). Only listings with no photo left: their photos (and Blob files) are purged
   * first, so a cascade never drops a photo row whose file is still in the store.
   */
  async purgeListings(cutoff: Date, take: number): Promise<number> {
    const rows = await this.db.listing.findMany({
      where: { deletedAt: { lt: cutoff }, photos: { none: {} } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take,
    });
    if (rows.length === 0) return 0;
    const { count } = await this.db.listing.deleteMany({
      where: {
        id: { in: rows.map((r) => r.id) },
        deletedAt: { lt: cutoff },
        photos: { none: {} },
      },
    });
    return count;
  }

  /**
   * Owners deleted before `cutoff`, one batch. Phones, notes, reminders and assignment history
   * go with them (cascade). Calls stay: the database sets their owner to null and they keep the
   * owner's name (calls are never deleted).
   */
  async purgeOwners(cutoff: Date, take: number): Promise<number> {
    const rows = await this.db.owner.findMany({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take,
    });
    if (rows.length === 0) return 0;
    const { count } = await this.db.owner.deleteMany({
      where: { id: { in: rows.map((r) => r.id) }, deletedAt: { lt: cutoff } },
    });
    return count;
  }

  /** Refresh tokens that expired before `before`, one batch. */
  async purgeRefreshTokens(before: Date, take: number): Promise<number> {
    const rows = await this.db.refreshToken.findMany({
      where: { expiresAt: { lt: before } },
      select: { id: true },
      take,
    });
    if (rows.length === 0) return 0;
    const { count } = await this.db.refreshToken.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    return count;
  }

  /** Failed sign-ins recorded before `before`, one batch. */
  async purgeLoginAttempts(before: Date, take: number): Promise<number> {
    const rows = await this.db.loginAttempt.findMany({
      where: { createdAt: { lt: before } },
      select: { id: true },
      take,
    });
    if (rows.length === 0) return 0;
    const { count } = await this.db.loginAttempt.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    return count;
  }

  // ------------------------------------------------------------------ ad check-ins

  /**
   * One batch of the safety net: every Live ad on an Available, live listing with no open
   * check-in gets one, for the listing's member, due `days` after the last check-in (or after
   * going Live), or now if that has passed. Listings another transaction holds are skipped
   * (the next run sees them); an advisory lock keeps two sweeps from both adding one.
   */
  addMissingCheckIns(now: Date, days: number, take: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHECK_IN_SWEEP_LOCK})`;
      return tx.$executeRaw`
        WITH missing AS (
          SELECT l.id, l.assigned_to_id,
                 COALESCE(l.last_check_in_at, l.ad_posted_at, ${ts(now)})
                   + make_interval(days => ${days}::int) AS due
          FROM listings l
          WHERE l.deleted_at IS NULL
            AND l.status = 'AVAILABLE'
            AND l.ad_status = 'LIVE'
            AND NOT EXISTS (
              SELECT 1 FROM reminders r
              WHERE r.listing_id = l.id AND r.kind = 'AD_CHECK_IN' AND r.done_at IS NULL
            )
          ORDER BY l.id
          LIMIT ${take}
          FOR UPDATE OF l SKIP LOCKED
        )
        INSERT INTO reminders (id, kind, listing_id, member_id, due_at, created_at, updated_at)
        SELECT gen_random_uuid(), 'AD_CHECK_IN'::reminder_kind, m.id, m.assigned_to_id,
               GREATEST(m.due, ${ts(now)}), ${ts(now)}, ${ts(now)}
        FROM missing m`;
    });
  }

  /**
   * "Exactly one": where a listing has more than one open check-in, the extras (all but the
   * earliest due) are removed. They are system duplicates nobody worked on.
   */
  removeDuplicateCheckIns(): Promise<number> {
    return this.db.$executeRaw`
      DELETE FROM reminders r
      WHERE r.kind = 'AD_CHECK_IN' AND r.done_at IS NULL
        AND EXISTS (
          SELECT 1 FROM reminders k
          WHERE k.listing_id = r.listing_id AND k.kind = 'AD_CHECK_IN' AND k.done_at IS NULL
            AND (k.due_at, k.id) < (r.due_at, r.id)
        )`;
  }
}
