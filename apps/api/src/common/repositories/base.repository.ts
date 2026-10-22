import { PAGE_LIMIT_MAX } from '@prime-crm/shared';
import type { Paginated } from '../interfaces/api-response.interface';
import type {
  IRepository,
  ModelDelegate,
} from '../interfaces/repository.interface';

/**
 * Every Prisma call lives in a repository; this is the shared base.
 *
 * @example
 * @Injectable()
 * export class OwnerRepository extends BaseRepository<Owner, Prisma.OwnerCreateInput,
 *   Prisma.OwnerUpdateInput, Prisma.OwnerWhereInput> {
 *   constructor(db: DatabaseService) { super(db.owner); }
 * }
 *
 * Scope (owner, soft delete) belongs in the subclass's overrides, never at call sites.
 * Repositories return null for "not there"; the service decides whether that is a 404.
 */
export abstract class BaseRepository<
  T,
  CreateInput,
  UpdateInput,
  Where extends object = object,
> implements IRepository<T, CreateInput, UpdateInput> {
  protected constructor(
    protected readonly model: ModelDelegate<T, CreateInput, UpdateInput, Where>,
  ) {}

  async create(data: CreateInput): Promise<T> {
    return this.model.create({ data });
  }

  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({ where: { id } });
  }

  /**
   * Paginated list with an optional case-insensitive search across `searchFields`.
   * `limit` is capped here, so no query string can ask for more than PAGE_LIMIT_MAX rows.
   */
  async findAllWithPagination(
    page = 1,
    limit = PAGE_LIMIT_MAX,
    search?: string,
    searchFields: string[] = [],
    where?: Where,
  ): Promise<Paginated<T>> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), PAGE_LIMIT_MAX);

    const condition = { ...where } as Where & { OR?: object[] };
    if (search && searchFields.length) {
      condition.OR = searchFields.map((field) => ({
        [field]: { contains: search, mode: 'insensitive' },
      }));
    }

    const [data, total] = await Promise.all([
      this.model.findMany({
        where: condition,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.model.count({ where: condition }),
    ]);

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      hasNextPage: safePage * safeLimit < total,
      hasPreviousPage: safePage > 1,
    };
  }

  async update(id: string, data: UpdateInput): Promise<T> {
    return this.model.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.model.delete({ where: { id } });
  }
}
