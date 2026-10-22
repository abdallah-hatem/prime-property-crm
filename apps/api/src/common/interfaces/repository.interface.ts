import type { Paginated } from './api-response.interface';

export interface IRepository<T, CreateInput, UpdateInput> {
  create(data: CreateInput): Promise<T>;
  findById(id: string): Promise<T | null>;
  findAllWithPagination(
    page?: number,
    limit?: number,
    search?: string,
  ): Promise<Paginated<T>>;
  update(id: string, data: UpdateInput): Promise<T>;
  delete(id: string): Promise<void>;
}

/**
 * The slice of a Prisma model delegate (`db.owner`, `db.listing`, ...) the base repository
 * uses. Method syntax keeps parameters bivariant, so a generated delegate is assignable.
 */
export interface ModelDelegate<T, CreateInput, UpdateInput, Where> {
  create(args: { data: CreateInput }): PromiseLike<T>;
  findUnique(args: { where: { id: string } }): PromiseLike<T | null>;
  findMany(args: {
    where?: Where;
    skip?: number;
    take?: number;
  }): PromiseLike<T[]>;
  count(args: { where?: Where }): PromiseLike<number>;
  update(args: { where: { id: string }; data: UpdateInput }): PromiseLike<T>;
  delete(args: { where: { id: string } }): PromiseLike<unknown>;
}
