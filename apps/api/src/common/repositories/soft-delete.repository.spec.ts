import type { Tx } from '../interfaces/transaction.interface';
import {
  liveWhere,
  SoftDeleteRepository,
  type SoftDeleteDelegate,
} from './soft-delete.repository';

interface Row {
  id: string;
  assignedToId: string;
  deletedAt: Date | null;
}
type Where = Partial<Row>;

/** An in-memory delegate that honours equality filters, so the tests check rows, not call shapes. */
function fakeDelegate(
  rows: Row[],
): SoftDeleteDelegate<Row, Row, Partial<Row>, Where> {
  const matches = (where: Where = {}) =>
    rows.filter((row) =>
      Object.entries(where).every(
        ([key, value]) => row[key as keyof Row] === value,
      ),
    );
  return {
    create: ({ data }) => Promise.resolve(data),
    findUnique: ({ where }) =>
      Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
    findFirst: ({ where }) => Promise.resolve(matches(where)[0] ?? null),
    findMany: ({ where, skip = 0, take = 100 }) =>
      Promise.resolve(matches(where).slice(skip, skip + take)),
    count: ({ where }) => Promise.resolve(matches(where).length),
    update: ({ where, data }) => {
      const row = matches(where)[0];
      if (!row) return Promise.reject(new Error('P2025'));
      return Promise.resolve(Object.assign(row, data));
    },
    delete: () => Promise.resolve(undefined),
  };
}

class TestRepository extends SoftDeleteRepository<
  Row,
  Row,
  Partial<Row>,
  Where
> {
  constructor(delegate: SoftDeleteDelegate<Row, Row, Partial<Row>, Where>) {
    super({} as Tx, () => delegate);
  }
}

function makeRepo() {
  const rows: Row[] = [
    { id: 'live-1', assignedToId: 'm1', deletedAt: null },
    { id: 'live-2', assignedToId: 'm1', deletedAt: null },
    { id: 'gone-1', assignedToId: 'm1', deletedAt: new Date() },
  ];
  return { repo: new TestRepository(fakeDelegate(rows)), rows };
}

describe('SoftDeleteRepository', () => {
  it('Soft-deleted rows excluded from every default query', async () => {
    const { repo } = makeRepo();

    expect(await repo.findById('gone-1')).toBeNull();
    expect(await repo.findFirst({ id: 'gone-1' })).toBeNull();
    expect(await repo.findFirst({ assignedToId: 'm1' })).not.toBeNull();
    expect(await repo.count()).toBe(2);
    expect(await repo.count({ assignedToId: 'm1' })).toBe(2);

    const page = await repo.findAllWithPagination(1, 20);
    expect(page.data.map((r) => r.id)).toEqual(['live-1', 'live-2']);
    expect(page.total).toBe(2);

    // A caller can't opt back into deleted rows by passing deletedAt itself.
    const sneaky = await repo.findAllWithPagination(1, 20, undefined, [], {
      deletedAt: new Date(),
    });
    expect(sneaky.total).toBe(2);

    await expect(repo.update('gone-1', { assignedToId: 'm2' })).rejects.toThrow(
      'P2025',
    );
  });

  it('still finds and updates live rows', async () => {
    const { repo } = makeRepo();
    expect((await repo.findById('live-1'))?.id).toBe('live-1');
    const updated = await repo.update('live-2', { assignedToId: 'm2' });
    expect(updated.assignedToId).toBe('m2');
  });

  it('never hard-deletes through a service path', async () => {
    const { repo, rows } = makeRepo();
    await expect(repo.delete('live-1')).rejects.toThrow('TrashService');
    expect(rows).toHaveLength(3);
  });

  it('liveWhere overrides any deletedAt the caller passed', () => {
    expect(liveWhere({ id: 'x', deletedAt: new Date() })).toEqual({
      id: 'x',
      deletedAt: null,
    });
    expect(liveWhere()).toEqual({ deletedAt: null });
  });
});
