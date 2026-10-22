import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { CallOutcomesService } from './call-outcomes.service';

const admin: CurrentUser = {
  id: 'admin',
  roleId: 'r',
  permissions: ['settings.manage'],
  isAdmin: false,
};
const member: CurrentUser = { ...admin, id: 'm', permissions: [] };

const row = (fields: Record<string, unknown> = {}) => ({
  id: 'o1',
  labelEn: 'Busy',
  labelAr: 'مشغول',
  setsStatus: 'CONTACTED',
  hidden: false,
  order: 2,
  _count: { calls: 0 },
  ...fields,
});

function makeService(overrides: Record<string, jest.Mock> = {}) {
  const outcomes = {
    findPage: jest.fn().mockResolvedValue({ rows: [row()], total: 1 }),
    findById: jest.fn().mockResolvedValue(row()),
    nextOrder: jest.fn().mockResolvedValue(11),
    create: jest.fn().mockResolvedValue(row({ order: 11 })),
    update: jest.fn().mockResolvedValue(row({ labelEn: 'Line busy' })),
    deleteUnused: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const db = {
    transaction: jest.fn((work: (tx: object) => unknown) => work({})),
  };
  const svc = new CallOutcomesService(
    db as never,
    outcomes as never,
    activity as never,
  );
  return { svc, outcomes, activity };
}

describe('CallOutcomesService', () => {
  it('Member POST/PATCH/DELETE on `/call-outcomes` or `includeHidden=true` → 403 (role)', async () => {
    const { svc, outcomes } = makeService();
    await expect(
      svc.list({ page: 1, limit: 100, includeHidden: true }, member),
    ).rejects.toThrow(ForbiddenException);
    await svc.list({ page: 1, limit: 100 }, member);
    expect(outcomes.findPage).toHaveBeenCalledWith(false, 0, 100);
  });

  it('Creating, renaming, hiding or reordering a call outcome writes an activity entry (business: activity log)', async () => {
    const { svc, activity } = makeService();
    await svc.create(
      { labelEn: 'Busy', labelAr: 'مشغول', setsStatus: 'CONTACTED' },
      admin,
    );
    for (const patch of [
      { labelEn: 'Line busy' },
      { hidden: true },
      { order: 0 },
    ]) {
      await svc.update('o1', patch, admin);
    }
    expect(activity.record).toHaveBeenCalledTimes(4);
    for (const [, entry] of activity.record.mock.calls) {
      expect(entry).toMatchObject({
        type: 'OUTCOME_UPDATE',
        actorId: 'admin',
        target: { kind: 'CALL_OUTCOME', id: 'o1' },
      });
    }
  });

  it('an edit that changes nothing writes nothing', async () => {
    const { svc, outcomes, activity } = makeService();
    await svc.update('o1', { labelEn: 'Busy', order: 2 }, admin);
    expect(outcomes.update).not.toHaveBeenCalled();
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('Delete an outcome in use → 409 OUTCOME_IN_USE; rename/hide in use → OK (business)', async () => {
    const { svc, activity } = makeService({
      findById: jest.fn().mockResolvedValue(row({ _count: { calls: 3 } })),
      deleteUnused: jest.fn().mockResolvedValue(false),
    });
    await expect(svc.remove('o1', admin)).rejects.toMatchObject({
      response: { error: 'OUTCOME_IN_USE' },
    });
    expect(activity.record).not.toHaveBeenCalled();
    await expect(
      svc.update('o1', { labelEn: 'Line busy', hidden: true }, admin),
    ).resolves.toBeDefined();
  });

  it('a call taking the outcome during the delete (FK violation) → 409', async () => {
    const fk = Object.assign(new Error('fk'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2003',
    });
    const { svc } = makeService({
      deleteUnused: jest.fn().mockRejectedValue(fk),
    });
    await expect(svc.remove('o1', admin)).rejects.toThrow(ConflictException);
  });

  it('unknown id → 404', async () => {
    const { svc } = makeService({
      findById: jest.fn().mockResolvedValue(null),
    });
    await expect(svc.update('x', { hidden: true }, admin)).rejects.toThrow(
      NotFoundException,
    );
    await expect(svc.remove('x', admin)).rejects.toThrow(NotFoundException);
  });
});
