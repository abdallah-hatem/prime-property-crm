import type { Paginated } from '../interfaces/api-response.interface';
import type { ModelDelegate } from '../interfaces/repository.interface';
import type { Tx } from '../interfaces/transaction.interface';
import { BaseRepository } from './base.repository';

/** The soft-delete columns every trashable model (owner, listing, photo) carries. */
export interface SoftDeletable {
  deletedAt: Date | null;
}

/** Live rows only: the filter every default query of a trashable model starts from. */
export const LIVE = { deletedAt: null } as const;

/** Adds the live-rows filter to a `where` (the caller's own `deletedAt`, if any, is overridden). */
export function liveWhere<W extends object>(where?: W): W & typeof LIVE {
  return { ...(where ?? ({} as W)), ...LIVE };
}

/** The delegate slice a soft-delete repository needs on top of the base one. */
export interface SoftDeleteDelegate<
  T,
  CreateInput,
  UpdateInput,
  Where,
> extends ModelDelegate<T, CreateInput, UpdateInput, Where> {
  findFirst(args: { where?: Where }): PromiseLike<T | null>;
  update(args: {
    where: { id: string; deletedAt?: null };
    data: UpdateInput;
  }): PromiseLike<T>;
}

/** The client a repository reads through: the app's DatabaseService or a transaction. */
export type DbClient = Tx;

/**
 * Base for owners, listings and photos. Every default query (findById, findFirst, count,
 * findAllWithPagination, update) sees live rows only, so a deleted record answers 404
 * everywhere; only the trash module reads deleted rows (through its own repository).
 * Soft delete and restore go through TrashService, never through this class.
 *
 * @example
 * @Injectable()
 * export class OwnerRepository extends SoftDeleteRepository<Owner, Prisma.OwnerUncheckedCreateInput,
 *   Prisma.OwnerUncheckedUpdateInput, Prisma.OwnerWhereInput> {
 *   constructor(db: DatabaseService) { super(db, (client) => client.owner); }
 * }
 */
export abstract class SoftDeleteRepository<
  T extends SoftDeletable,
  CreateInput,
  UpdateInput,
  Where extends object = object,
> extends BaseRepository<T, CreateInput, UpdateInput, Where> {
  protected constructor(
    private readonly client: DbClient,
    private readonly select: (
      client: DbClient,
    ) => SoftDeleteDelegate<T, CreateInput, UpdateInput, Where>,
  ) {
    super(select(client));
  }

  /** The model delegate on `tx` when given (to join the caller's transaction), else the app client. */
  protected delegate(
    tx?: Tx,
  ): SoftDeleteDelegate<T, CreateInput, UpdateInput, Where> {
    return this.select(tx ?? this.client);
  }

  async findById(id: string, tx?: Tx): Promise<T | null> {
    return this.findFirst({ id } as unknown as Where, tx);
  }

  /** First live row matching `where` (merge an `ownerScope` into it for "own or permission"). */
  async findFirst(where: Where, tx?: Tx): Promise<T | null> {
    return this.delegate(tx).findFirst({ where: liveWhere(where) });
  }

  async count(where?: Where, tx?: Tx): Promise<number> {
    return this.delegate(tx).count({ where: liveWhere(where) });
  }

  async findAllWithPagination(
    page?: number,
    limit?: number,
    search?: string,
    searchFields?: string[],
    where?: Where,
  ): Promise<Paginated<T>> {
    return super.findAllWithPagination(
      page,
      limit,
      search,
      searchFields,
      liveWhere(where),
    );
  }

  /** Updates a live row; a deleted or missing id rejects with Prisma P2025 (the filter's 404). */
  async update(id: string, data: UpdateInput, tx?: Tx): Promise<T> {
    return this.delegate(tx).update({ where: { id, ...LIVE }, data });
  }

  /** Hard delete is the purge cron's job only; services soft-delete through TrashService. */
  delete(_id: string): Promise<void> {
    return Promise.reject(
      new Error(
        'Trashable records are never hard-deleted by a service: use TrashService.softDelete',
      ),
    );
  }
}
