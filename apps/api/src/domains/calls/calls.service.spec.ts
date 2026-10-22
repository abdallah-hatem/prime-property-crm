import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { CallsService } from './calls.service';

const NOW = new Date('2026-10-22T09:00:00.000Z');
const me: CurrentUser = {
  id: 'me',
  roleId: 'r',
  permissions: [],
  isAdmin: false,
};
const REQ = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';

const shapedRow = {
  id: 'c1',
  ownerId: 'o1',
  ownerName: 'أحمد علي',
  phone: '+201001234567',
  startedAt: NOW,
  note: null,
  outcomeAt: null,
  member: { id: 'me', name: 'Me' },
  outcome: null,
};

const uniqueViolation = () =>
  Object.assign(new Error('unique'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2002',
  });

function makeService(
  overrides: {
    calls?: Record<string, jest.Mock>;
    outcomes?: Record<string, jest.Mock>;
    reminders?: Record<string, jest.Mock>;
    db?: Record<string, jest.Mock>;
  } = {},
) {
  const calls = {
    findTarget: jest.fn().mockResolvedValue({
      id: 'o1',
      name: 'أحمد علي',
      status: 'NEW',
      phones: [{ phone: '+201001234567' }],
    }),
    findByRequest: jest.fn().mockResolvedValue(null),
    createShaped: jest.fn().mockResolvedValue(shapedRow),
    touchLastCall: jest.fn().mockResolvedValue(undefined),
    findShaped: jest.fn().mockResolvedValue(shapedRow),
    findOwn: jest.fn().mockResolvedValue({
      id: 'c1',
      ownerId: 'o1',
      outcomeId: null,
      startedAt: NOW,
    }),
    setOutcome: jest.fn().mockResolvedValue(1),
    findOwnerState: jest
      .fn()
      .mockResolvedValue({ status: 'NEW', assignedToId: 'me' }),
    newerOutcomeExists: jest.fn().mockResolvedValue(false),
    setOwnerStatus: jest.fn().mockResolvedValue(undefined),
    findPage: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    count: jest.fn().mockResolvedValue(0),
    ...overrides.calls,
  };
  const outcomes = {
    find: jest.fn().mockResolvedValue({
      id: 'out1',
      hidden: false,
      setsStatus: 'INTERESTED',
    }),
    ...overrides.outcomes,
  };
  const reminders = {
    addToOwner: jest.fn().mockResolvedValue({}),
    ...overrides.reminders,
  };
  const db = {
    transaction: jest.fn((work: (tx: object) => unknown) => work({})),
    ...overrides.db,
  };
  const users = { languageOf: jest.fn().mockResolvedValue('ar') };
  const svc = new CallsService(
    db as never,
    calls as never,
    outcomes as never,
    reminders as never,
    users as never,
    { now: () => NOW },
  );
  return { svc, calls, outcomes, reminders };
}

describe('CallsService', () => {
  describe('start', () => {
    it("Call stores the owner's name at creation (business: calls survive owner purge)", async () => {
      const { svc, calls } = makeService();
      await svc.start('o1', { phone: '01001234567', clientRequestId: REQ }, me);
      expect(calls.createShaped.mock.calls[0][1]).toMatchObject({
        ownerName: 'أحمد علي',
        phone: '+201001234567',
        memberId: 'me',
        startedAt: NOW,
      });
      expect(calls.touchLastCall).toHaveBeenCalledWith({}, 'o1', NOW);
    });

    it("Member starts a call on another member's owner → 404 (invariant)", async () => {
      const { svc, calls } = makeService({
        calls: { findTarget: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        svc.start('o1', { phone: '01001234567', clientRequestId: REQ }, me),
      ).rejects.toThrow(NotFoundException);
      expect(calls.createShaped).not.toHaveBeenCalled();
    });

    it('Start a call with a phone not belonging to the owner → 400 (checklist: wrong value)', async () => {
      const { svc } = makeService();
      await expect(
        svc.start('o1', { phone: '01101234567', clientRequestId: REQ }, me),
      ).rejects.toThrow(BadRequestException);
    });

    it('Start a call on a DO_NOT_CALL owner → 409; on a LISTED owner → 409 (invariant)', async () => {
      for (const status of ['DO_NOT_CALL', 'LISTED']) {
        const { svc } = makeService({
          calls: {
            findTarget: jest.fn().mockResolvedValue({
              id: 'o1',
              name: 'x',
              status,
              phones: [{ phone: '+201001234567' }],
            }),
          },
        });
        await expect(
          svc.start('o1', { phone: '01001234567', clientRequestId: REQ }, me),
        ).rejects.toThrow(ConflictException);
      }
    });

    it('Double tap: two `POST /owners/:id/calls` with the same `clientRequestId` → one call (contract: idempotent call start)', async () => {
      const { svc, calls } = makeService({
        calls: {
          findByRequest: jest
            .fn()
            .mockResolvedValue({ id: 'c1', ownerId: 'o1' }),
        },
      });
      await expect(
        svc.start('o1', { phone: '01001234567', clientRequestId: REQ }, me),
      ).resolves.toMatchObject({ id: 'c1' });
      expect(calls.createShaped).not.toHaveBeenCalled();
    });

    it("a lost race on the unique request id returns the winner's call", async () => {
      const findByRequest = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'c1', ownerId: 'o1' });
      const { svc } = makeService({
        calls: {
          findByRequest,
          createShaped: jest.fn().mockRejectedValue(uniqueViolation()),
        },
      });
      await expect(
        svc.start('o1', { phone: '01001234567', clientRequestId: REQ }, me),
      ).resolves.toMatchObject({ id: 'c1' });
    });

    it('the same request id on another owner → 409 REQUEST_ID_REUSED', async () => {
      const { svc } = makeService({
        calls: {
          findByRequest: jest
            .fn()
            .mockResolvedValue({ id: 'c1', ownerId: 'o9' }),
        },
      });
      await expect(
        svc.start('o1', { phone: '01001234567', clientRequestId: REQ }, me),
      ).rejects.toMatchObject({ response: { error: 'REQUEST_ID_REUSED' } });
    });
  });

  describe('setOutcome', () => {
    it("Set outcome → owner status becomes the outcome's mapped status (business: outcome sets status)", async () => {
      const { svc, calls } = makeService();
      await svc.setOutcome('c1', { outcomeId: 'out1' }, me);
      expect(calls.setOwnerStatus).toHaveBeenCalledWith({}, 'o1', 'INTERESTED');
    });

    it('Set outcome twice → 409 OUTCOME_ALREADY_SET; call unchanged (business: exactly one outcome)', async () => {
      const { svc, calls } = makeService({
        calls: {
          findOwn: jest.fn().mockResolvedValue({
            id: 'c1',
            ownerId: 'o1',
            outcomeId: 'out0',
            startedAt: NOW,
          }),
        },
      });
      await expect(
        svc.setOutcome('c1', { outcomeId: 'out1' }, me),
      ).rejects.toMatchObject({ response: { error: 'OUTCOME_ALREADY_SET' } });
      expect(calls.setOutcome).not.toHaveBeenCalled();
    });

    it('a concurrent outcome that won the conditional update → 409 OUTCOME_ALREADY_SET', async () => {
      const { svc } = makeService({
        calls: { setOutcome: jest.fn().mockResolvedValue(0) },
      });
      await expect(
        svc.setOutcome('c1', { outcomeId: 'out1' }, me),
      ).rejects.toThrow(ConflictException);
    });

    it('Another member sets the outcome on my call → 404 (role)', async () => {
      const { svc } = makeService({
        calls: { findOwn: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        svc.setOutcome('c1', { outcomeId: 'out1' }, me),
      ).rejects.toThrow(NotFoundException);
    });

    it('Hidden outcome → 400 OUTCOME_HIDDEN (business: hidden outcomes)', async () => {
      const { svc, calls } = makeService({
        outcomes: {
          find: jest
            .fn()
            .mockResolvedValue({ id: 'out1', hidden: true, setsStatus: 'NEW' }),
        },
      });
      await expect(
        svc.setOutcome('c1', { outcomeId: 'out1' }, me),
      ).rejects.toMatchObject({ response: { error: 'OUTCOME_HIDDEN' } });
      expect(calls.setOutcome).not.toHaveBeenCalled();
    });

    it("Outcome set on an older call after a newer call already has one → owner status keeps the newer call's status (business: latest call sets status)", async () => {
      const { svc, calls } = makeService({
        calls: { newerOutcomeExists: jest.fn().mockResolvedValue(true) },
      });
      await svc.setOutcome('c1', { outcomeId: 'out1' }, me);
      expect(calls.setOutcome).toHaveBeenCalled();
      expect(calls.setOwnerStatus).not.toHaveBeenCalled();
    });

    it('Outcome on a call whose owner became LISTED meanwhile → outcome saved, status stays LISTED (invariant: Listed only through a listing)', async () => {
      const { svc, calls } = makeService({
        calls: {
          findOwnerState: jest
            .fn()
            .mockResolvedValue({ status: 'LISTED', assignedToId: 'me' }),
        },
      });
      await svc.setOutcome('c1', { outcomeId: 'out1' }, me);
      expect(calls.setOutcome).toHaveBeenCalled();
      expect(calls.setOwnerStatus).not.toHaveBeenCalled();
    });

    it("the reminder goes to the owner's member, in the same transaction", async () => {
      const { svc, reminders } = makeService({
        calls: {
          findOwnerState: jest
            .fn()
            .mockResolvedValue({ status: 'NEW', assignedToId: 'm2' }),
        },
      });
      await svc.setOutcome(
        'c1',
        {
          outcomeId: 'out1',
          reminder: { dueAt: '2026-10-23T09:00:00Z', note: 'اتصل' },
        },
        me,
      );
      expect(reminders.addToOwner).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          ownerId: 'o1',
          memberId: 'm2',
          note: 'اتصل',
        }),
      );
    });
  });

  describe('list', () => {
    it("`GET /calls` as member with another member's `memberId` or `ownerId` → only own calls returned (invariant)", async () => {
      const { svc, calls } = makeService();
      await svc.list(
        { page: 1, limit: 20, memberId: 'other', ownerId: 'o2' },
        me,
      );
      expect(calls.findPage.mock.calls[0][0]).toMatchObject({
        memberId: 'me',
        ownerId: 'o2',
      });
      await svc.list(
        { page: 1, limit: 20, memberId: 'other' },
        { ...me, permissions: ['analytics.view'] },
      );
      expect(calls.findPage.mock.calls[1][0]).toMatchObject({
        memberId: 'other',
      });
    });

    it('from after to → 400', async () => {
      const { svc } = makeService();
      await expect(
        svc.list(
          { page: 1, limit: 20, from: '2026-10-22', to: '2026-10-21' },
          me,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
