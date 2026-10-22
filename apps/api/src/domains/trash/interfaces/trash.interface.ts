import type { TrashKind } from '@prime-crm/shared';
import type { CurrentUser } from '../../../common/interfaces/current-user.interface';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import type { UserSummary } from '../../../common/interfaces/user-summary.interface';

/** A trashed record as the repository reads it. */
export interface TrashedRecord {
  kind: TrashKind;
  id: string;
  label: string;
  deletedAt: Date;
  deletedBy: UserSummary | null;
}

/** The TrashItem shape of the API contract (spec, Shapes). */
export interface TrashItemView extends TrashedRecord {
  purgeAt: Date;
}

/** What `TrashService.softDelete` reports back to the domain that deleted something. */
export interface SoftDeleteResult {
  label: string;
  deletedAt: Date;
  purgeAt: Date;
}

/**
 * A domain's rules for restoring its records, registered with TrashRestoreRegistry from the
 * domain module's `onModuleInit`. The trash core has already checked: the record is in the
 * trash (404), still inside 30 days (410 PURGED), and the caller holds trash.restore (403).
 * Both hooks run inside the restore transaction.
 */
export interface RestoreHandler {
  /** Throw a domain 409 (OWNER_ALREADY_LISTED, PARENT_DELETED, TOO_MANY_PHOTOS) to refuse. */
  validate?(tx: Tx, item: TrashedRecord, actor: CurrentUser): Promise<void>;
  /** Side effects after deletedAt is cleared (e.g. re-flag the owner LISTED). */
  afterRestore?(tx: Tx, item: TrashedRecord, actor: CurrentUser): Promise<void>;
}
