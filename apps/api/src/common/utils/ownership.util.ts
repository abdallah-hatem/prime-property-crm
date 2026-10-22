import { NotFoundException } from '@nestjs/common';
import { ErrorCode, type Permission } from '@prime-crm/shared';
import type { CurrentUser } from '../interfaces/current-user.interface';
import { hasPermission } from './permissions.util';

/**
 * "Own or permission" (spec, Conventions): a record is the caller's when it is assigned to
 * them; a permission (owners.viewAll, listings.manageAll, analytics.view, ...) widens that to
 * every record. Anything else answers 404, never 403, so ids can't be probed.
 */
export interface OwnershipRule {
  /** The permission that grants access to every record; omit when there is none. */
  bypass?: Permission;
}

/** Thrown for a missing, deleted, or not-yours record: one indistinguishable 404. */
export function notFound(what = 'Resource'): NotFoundException {
  return new NotFoundException({
    message: `${what} not found`,
    error: ErrorCode.NOT_FOUND,
  });
}

/** True when the caller may see a record owned by `ownerId` (null = unassigned). */
export function canAccess(
  user: CurrentUser,
  ownerId: string | null | undefined,
  rule: OwnershipRule = {},
): boolean {
  if (rule.bypass && hasPermission(user, rule.bypass)) return true;
  return ownerId != null && ownerId === user.id;
}

/** Returns the record when it exists and the caller may see it; otherwise throws 404. */
export function assertAccessible<T>(
  record: T | null | undefined,
  user: CurrentUser,
  ownerOf: (record: T) => string | null | undefined,
  rule: OwnershipRule & { what?: string } = {},
): T {
  if (record == null || !canAccess(user, ownerOf(record), rule)) {
    throw notFound(rule.what);
  }
  return record;
}

/** Returns the record or throws 404 (for lookups already scoped to the caller). */
export function assertFound<T>(
  record: T | null | undefined,
  what = 'Resource',
): T {
  if (record == null) throw notFound(what);
  return record;
}

/**
 * The repository-level form of the same rule: a `where` fragment that limits a query to the
 * caller's records, or nothing when the caller holds the bypass permission. Merged into a
 * query, a not-yours id simply isn't found, so the service's 404 covers it.
 *
 * @example ownerScope(user, 'assignedToId', { bypass: 'owners.viewAll' })
 */
export function ownerScope<F extends string>(
  user: CurrentUser,
  field: F,
  rule: OwnershipRule = {},
): Partial<Record<F, string>> {
  if (rule.bypass && hasPermission(user, rule.bypass)) return {};
  return { [field]: user.id } as Record<F, string>;
}
