import { ForbiddenException } from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { RemindersService } from './reminders.service';

const NOW = new Date('2026-10-22T09:00:00.000Z');
const user = (permissions: CurrentUser['permissions']): CurrentUser => ({
  id: 'me',
  roleId: 'r',
  permissions,
  isAdmin: false,
});

function makeService() {
  const reminders = {
    findPage: jest.fn().mockResolvedValue({
      rows: [
        {
          id: 'r1',
          kind: 'MANUAL',
          dueAt: new Date(NOW.getTime() - 1),
          note: null,
          doneAt: null,
          owner: { id: 'o1', name: 'Owner' },
          listing: null,
          member: null,
        },
      ],
      total: 1,
    }),
    moveOpen: jest.fn().mockResolvedValue(2),
    closeOpen: jest.fn().mockResolvedValue(1),
  };
  const svc = new RemindersService(reminders as never, { now: () => NOW });
  return { svc, reminders };
}

describe('RemindersService', () => {
  it('Admin lists unassigned open reminders (`GET /reminders?unassigned=true`) (business: visible to the admin)', async () => {
    const { svc, reminders } = makeService();
    const page = await svc.list(
      { page: 1, limit: 20, unassigned: true },
      user(['owners.assign']),
    );
    expect(reminders.findPage.mock.calls[0][0]).toMatchObject({
      memberId: null,
      doneAt: null,
    });
    expect(page.data[0]).toMatchObject({
      id: 'r1',
      overdue: true,
      member: null,
    });
  });

  it('unassigned=true without owners.assign → 403', async () => {
    const { svc } = makeService();
    await expect(
      svc.list({ page: 1, limit: 20, unassigned: true }, user([])),
    ).rejects.toThrow(ForbiddenException);
  });

  it('without the flag: the caller’s own reminders', async () => {
    const { svc, reminders } = makeService();
    await svc.list({ page: 1, limit: 20 }, user([]));
    expect(reminders.findPage.mock.calls[0][0]).toMatchObject({
      memberId: 'me',
    });
  });

  it('closing uses the clock; moving passes the target member through', async () => {
    const { svc, reminders } = makeService();
    await svc.closeOpenReminders({} as never, { ownerIds: ['o1'] });
    expect(reminders.closeOpen).toHaveBeenCalledWith(
      {},
      { ownerIds: ['o1'] },
      NOW,
    );
    await svc.moveOpenReminders({} as never, { listingIds: ['l1'] }, null);
    expect(reminders.moveOpen).toHaveBeenCalledWith(
      {},
      { listingIds: ['l1'] },
      null,
    );
  });
});
