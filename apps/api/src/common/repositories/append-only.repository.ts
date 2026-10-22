/**
 * The slice of a Prisma delegate an append-only repository may touch: create and read.
 * Typing the model this narrowly means a subclass can't reach update or delete either.
 */
export interface AppendOnlyDelegate<T, CreateInput> {
  create(args: { data: CreateInput }): PromiseLike<T>;
  findUnique(args: { where: { id: string } }): PromiseLike<T | null>;
}

/**
 * Base for records that are written once and never edited or deleted (calls, activity
 * entries). Deliberately not a BaseRepository: it has no update and no delete method, so no
 * service can remove history through the repository layer.
 */
export abstract class AppendOnlyRepository<T, CreateInput> {
  protected constructor(
    protected readonly model: AppendOnlyDelegate<T, CreateInput>,
  ) {}

  async create(data: CreateInput): Promise<T> {
    return this.model.create({ data });
  }

  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({ where: { id } });
  }
}
