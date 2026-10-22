import { BadRequestException } from '@nestjs/common';
import { ActivityService } from './activity.service';
import type { ActivityQueryDto } from './dto/activity-query.dto';

function makeService(findPage = jest.fn()) {
  const entries = {
    create: jest.fn().mockResolvedValue({}),
    findPage: findPage.mockResolvedValue({
      data: [
        {
          id: 'a1',
          type: 'DELETE',
          summary: 'Deleted owner Ahmed',
          targetKind: 'OWNER',
          targetId: 'o1',
          targetLabel: 'Ahmed',
          details: null,
          createdAt: new Date('2026-10-22T08:00:00Z'),
          actor: { id: 'u1', name: 'Admin' },
        },
        {
          id: 'a2',
          type: 'EXPORT',
          summary: 'Exported owners',
          targetKind: null,
          targetId: null,
          targetLabel: null,
          details: { rows: 3 },
          createdAt: new Date('2026-10-22T07:00:00Z'),
          actor: { id: 'u1', name: 'Admin' },
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
      hasNextPage: false,
      hasPreviousPage: false,
    }),
  };
  return { svc: new ActivityService(entries as never), entries };
}

const query = (q: Partial<ActivityQueryDto>) => ({ page: 1, limit: 20, ...q });

describe('ActivityService', () => {
  it('records inside the given transaction', async () => {
    const { svc, entries } = makeService();
    const tx = { tx: true };
    await svc.record(tx as never, {
      type: 'DELETE',
      actorId: 'u1',
      summary: 'Deleted owner Ahmed',
      target: { kind: 'OWNER', id: 'o1', label: 'Ahmed' },
    });
    expect(entries.create).toHaveBeenCalledWith(
      expect.objectContaining({ targetKind: 'OWNER', targetId: 'o1' }),
      tx,
    );
  });

  it('maps rows to the ActivityEntry shape (target null when none was recorded)', async () => {
    const { svc } = makeService();
    const page = await svc.list(query({}));
    expect(page.data[0].target).toEqual({
      kind: 'OWNER',
      id: 'o1',
      label: 'Ahmed',
    });
    expect(page.data[1].target).toBeNull();
    expect(page.data[1].details).toEqual({ rows: 3 });
  });

  it('reads date-only bounds as whole Cairo days', async () => {
    const findPage = jest.fn();
    const { svc } = makeService(findPage);
    await svc.list(query({ from: '2026-10-22', to: '2026-10-22' }));
    const filter = findPage.mock.calls[0][0] as { from: Date; to: Date };
    expect(filter.from.toISOString()).toBe('2026-10-21T21:00:00.000Z');
    expect(filter.to.toISOString()).toBe('2026-10-22T21:00:00.000Z');
  });

  it('refuses from after to → 400', async () => {
    const { svc } = makeService();
    await expect(
      svc.list(query({ from: '2026-10-23', to: '2026-10-22' })),
    ).rejects.toThrow(BadRequestException);
  });
});
