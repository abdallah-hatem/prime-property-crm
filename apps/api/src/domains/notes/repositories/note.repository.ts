import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import { DatabaseService } from '../../../database/database.service';
import { NOTE_SELECT, type NoteRow } from '../note.shape';

/** What a note hangs on: exactly one owner or one listing (a CHECK enforces it). */
export type NoteTarget = { ownerId: string } | { listingId: string };

/** Notes are added, never edited or deleted (business doc): create and read only. */
@Injectable()
export class NoteRepository {
  constructor(private readonly db: DatabaseService) {}

  create(
    target: NoteTarget,
    authorId: string,
    body: string,
    tx?: Tx,
  ): Promise<NoteRow> {
    return (tx ?? this.db).note.create({
      data: { ...target, authorId, body },
      select: NOTE_SELECT,
    });
  }

  /** Newest first. */
  findPage(
    target: NoteTarget,
    skip: number,
    take: number,
    tx?: Tx,
  ): Promise<NoteRow[]> {
    return (tx ?? this.db).note.findMany({
      where: target,
      select: NOTE_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
  }

  count(target: NoteTarget, tx?: Tx): Promise<number> {
    return (tx ?? this.db).note.count({ where: target });
  }

  /** Notes by id (for timelines), in no particular order. */
  findByIds(ids: string[], tx?: Tx): Promise<NoteRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return (tx ?? this.db).note.findMany({
      where: { id: { in: ids } },
      select: NOTE_SELECT,
    });
  }
}
