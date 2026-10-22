import { TRASH_RETENTION_DAYS } from '@prime-crm/shared';

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = TRASH_RETENTION_DAYS * DAY_MS;

/** When a record deleted at `deletedAt` is removed for good: deletedAt + 30 days. */
export function purgeAtFor(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + RETENTION_MS);
}

/**
 * Restorable up to and including purgeAt: deleted exactly 30 days ago is still in time,
 * 30 days and a minute is not.
 */
export function isRestorable(deletedAt: Date, now: Date): boolean {
  return now.getTime() <= purgeAtFor(deletedAt).getTime();
}

/**
 * The oldest deletedAt still in the trash at `now`. The trash list shows deletedAt >= cutoff;
 * the purge cron removes deletedAt < cutoff, so the two never disagree.
 */
export function trashCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_MS);
}
