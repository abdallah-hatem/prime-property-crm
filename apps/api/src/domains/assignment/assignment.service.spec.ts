import { BadRequestException } from '@nestjs/common';
import { AssignmentService } from './assignment.service';

const TX = { tx: true } as never;

function makeService(
  overrides: {
    assignments?: Record<string, jest.Mock>;
    users?: Record<string, jest.Mock>;
  } = {},
) {
  const assignments = {
    liveOwners: jest.fn((_tx: unknown, ids: string[]) =>
      Promise.resolve(
        ids
          .filter((id) => id.startsWith('o'))
          .map((id) => ({ id, assignedToId: 'a' })),
      ),
    ),
    liveListings: jest.fn((_tx: unknown, ids: string[]) =>
      Promise.resolve(
        ids.map((id) => ({ id, ownerId: 'o-linked', assignedToId: 'a' })),
      ),
    ),
    liveListingsOfOwners: jest.fn((_tx: unknown, ids: string[]) =>
      Promise.resolve(
        ids.map((id) => ({ id: `l-of-${id}`, ownerId: id, assignedToId: 'a' })),
      ),
    ),
    setOwnersAssignee: jest.fn().mockResolvedValue(undefined),
    setListingsAssignee: jest.fn().mockResolvedValue(undefined),
    recordOwnerAssignments: jest.fn().mockResolvedValue(undefined),
    ...overrides.assignments,
  };
  const users = {
    findActive: jest.fn().mockResolvedValue({ id: 'b', name: 'B' }),
    ...overrides.users,
  };
  const reminders = { moveOpenReminders: jest.fn().mockResolvedValue(3) };
  const svc = new AssignmentService(
    assignments,
    users as never,
    reminders as never,
  );
  return { svc, assignments, users, reminders };
}

describe('AssignmentService', () => {
  it('Assign to an inactive member → 400 INVALID_ASSIGNEE (flow: assign to an active member)', async () => {
    const { svc } = makeService({
      users: { findActive: jest.fn().mockResolvedValue(null) },
    });
    await expect(svc.assertAssignee(TX, 'off')).rejects.toThrow(
      BadRequestException,
    );
    await expect(svc.assertAssignee(TX, null)).resolves.toBeNull();
  });

  it("Reassign moves open reminders and the owner's listing to the new member; done reminders and calls keep their member (flow: reassign)", async () => {
    const { svc, assignments, reminders } = makeService();
    const result = await svc.reassignOwnerAndListing(
      TX,
      { ownerIds: ['o1', 'o1', 'gone'] },
      'b',
      'admin',
    );
    expect(result).toEqual({
      ownerIds: ['o1'],
      listingIds: ['l-of-o1'],
      remindersMoved: 3,
    });
    expect(assignments.setListingsAssignee).toHaveBeenCalledWith(
      TX,
      ['l-of-o1'],
      'b',
    );
    expect(assignments.recordOwnerAssignments).toHaveBeenCalledWith(TX, [
      { ownerId: 'o1', fromMemberId: 'a', toMemberId: 'b', byId: 'admin' },
    ]);
    // Open reminders only: the repository filters doneAt null; calls are never touched.
    expect(reminders.moveOpenReminders).toHaveBeenCalledWith(
      TX,
      { ownerIds: ['o1'], listingIds: ['l-of-o1'] },
      'b',
    );
  });

  it('Reassigning an owner moves its listing; reassigning a listing moves its owner (business: owner and listing stay together)', async () => {
    const { svc, assignments } = makeService();
    const result = await svc.reassignOwnerAndListing(
      TX,
      { listingIds: ['l9'] },
      null,
      'admin',
    );
    expect(result.ownerIds).toEqual(['o-linked']);
    expect(assignments.setOwnersAssignee).toHaveBeenCalledWith(
      TX,
      ['o-linked'],
      null,
    );
  });
});
