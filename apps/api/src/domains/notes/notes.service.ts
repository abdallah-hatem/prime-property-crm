import { Injectable } from '@nestjs/common';
import type { Note } from '@prime-crm/shared';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { pageWindow, toPage } from '../../common/utils/pagination.util';
import { toNote } from './note.shape';
import {
  NoteRepository,
  type NoteTarget,
} from './repositories/note.repository';

/**
 * Notes on owners and listings. Callers check access to the owner or listing first; this
 * service only reads and appends. There is no edit or delete (business doc: notes are added).
 */
@Injectable()
export class NotesService {
  constructor(private readonly notes: NoteRepository) {}

  async add(
    target: NoteTarget,
    authorId: string,
    body: string,
    tx?: Tx,
  ): Promise<Note> {
    return toNote(await this.notes.create(target, authorId, body.trim(), tx));
  }

  async list(
    target: NoteTarget,
    page?: number,
    limit?: number,
    tx?: Tx,
  ): Promise<Paginated<Note>> {
    const window = pageWindow(page, limit);
    const [rows, total] = await Promise.all([
      this.notes.findPage(target, window.skip, window.take, tx),
      this.notes.count(target, tx),
    ]);
    return toPage(rows.map(toNote), total, window);
  }

  /** The latest `count` notes, newest first (Owner/Listing `notes`). */
  async latest(target: NoteTarget, count: number, tx?: Tx): Promise<Note[]> {
    return (await this.notes.findPage(target, 0, count, tx)).map(toNote);
  }

  async byIds(ids: string[], tx?: Tx): Promise<Note[]> {
    return (await this.notes.findByIds(ids, tx)).map(toNote);
  }
}
