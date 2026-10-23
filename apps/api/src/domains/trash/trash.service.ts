import { GoneException, Injectable } from '@nestjs/common';
import { TrashErrorCode, type TrashKind } from '@prime-crm/shared';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { Clock } from '../../common/providers/clock';
import { UserDirectoryRepository } from '../../common/repositories/user-directory.repository';
import { notFound } from '../../common/utils/ownership.util';
import {
  isRestorable,
  purgeAtFor,
  trashCutoff,
} from '../../common/utils/trash.util';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import type {
  SoftDeleteResult,
  TrashItemView,
  TrashedRecord,
} from './interfaces/trash.interface';
import { TrashRepository } from './repositories/trash.repository';
import { TrashRestoreRegistry } from './trash-restore.registry';
import { trashSummary } from './trash.pure';
import type { TrashQueryDto } from './dto/trash-query.dto';

const KIND_NAME: Record<TrashKind, string> = {
  OWNER: 'Owner',
  LISTING: 'Listing',
  PHOTO: 'Photo',
};

function purged(): GoneException {
  return new GoneException({
    message: 'This item was removed for good after 30 days in the trash',
    error: TrashErrorCode.PURGED,
  });
}

function toView(record: TrashedRecord): TrashItemView {
  return { ...record, purgeAt: purgeAtFor(record.deletedAt) };
}

/**
 * The trash core: soft delete (called by domains inside their own transaction), the trash list
 * and the restore dispatcher. Domain restore rules plug in through TrashRestoreRegistry.
 */
@Injectable()
export class TrashService {
  constructor(
    private readonly db: DatabaseService,
    private readonly trash: TrashRepository,
    private readonly registry: TrashRestoreRegistry,
    private readonly activity: ActivityService,
    private readonly users: UserDirectoryRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Moves a live record to the trash and logs DELETE, inside the caller's transaction.
   * A missing or already-deleted record is a 404. Domains check access before calling this.
   */
  async softDelete(
    tx: Tx,
    kind: TrashKind,
    id: string,
    actorId: string,
  ): Promise<SoftDeleteResult> {
    const record = await this.trash.findLive(tx, kind, id);
    if (!record) throw notFound(KIND_NAME[kind]);

    const deletedAt = this.clock.now();
    if (!(await this.trash.markDeleted(tx, kind, id, actorId, deletedAt))) {
      throw notFound(KIND_NAME[kind]);
    }
    const purgeAt = purgeAtFor(deletedAt);

    await this.activity.record(tx, {
      type: 'DELETE',
      actorId,
      summary: trashSummary('Deleted', kind, record.label),
      target: { kind, id, label: record.label },
      details: { purgeAt: purgeAt.toISOString() },
    });
    return { label: record.label, deletedAt, purgeAt };
  }

  /**
   * What is in the trash now: deleted less than 30 days ago, newest first, labels in the
   * reader's language.
   */
  async list(
    query: TrashQueryDto,
    userId: string,
  ): Promise<Paginated<TrashItemView>> {
    const page = await this.trash.list(
      query.kind,
      trashCutoff(this.clock.now()),
      query.page,
      query.limit,
      await this.users.languageOf(userId),
    );
    return { ...page, data: page.data.map(toView) };
  }

  /**
   * Restores a trashed record: 404 when it is not in the trash, 410 PURGED once its 30 days are
   * over (or it was already purged), then the kind's handler rules, then RESTORE is logged.
   * All of it in one transaction.
   */
  async restore(
    kind: TrashKind,
    id: string,
    actor: CurrentUser,
  ): Promise<void> {
    const now = this.clock.now();

    await this.db.transaction(async (tx) => {
      const item = await this.trash.findDeleted(tx, kind, id);
      if (!item) {
        const live = await this.trash.findLive(tx, kind, id);
        if (
          !live &&
          (await this.activity.hasEntryFor(tx, 'DELETE', kind, id))
        ) {
          throw purged();
        }
        throw notFound(KIND_NAME[kind]);
      }
      if (!isRestorable(item.deletedAt, now)) throw purged();

      const handler = this.registry.get(kind);
      await handler?.validate?.(tx, item, actor);
      if (!(await this.trash.clearDeleted(tx, kind, id))) {
        throw notFound(KIND_NAME[kind]);
      }
      await handler?.afterRestore?.(tx, item, actor);

      await this.activity.record(tx, {
        type: 'RESTORE',
        actorId: actor.id,
        summary: trashSummary('Restored', kind, item.label),
        target: { kind, id, label: item.label },
      });
    });
  }
}
