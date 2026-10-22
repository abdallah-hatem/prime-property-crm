import { planAssignment } from './assignment.pure';

const A = 'member-a';
const B = 'member-b';

describe('planAssignment', () => {
  it('Reassigning an owner moves its listing; reassigning a listing moves its owner (business: owner and listing stay together)', () => {
    const plan = planAssignment(
      [{ id: 'o1', assignedToId: A }],
      [{ id: 'l1', ownerId: 'o1', assignedToId: A }],
      B,
    );
    expect(plan).toEqual({
      ownerIds: ['o1'],
      listingIds: ['l1'],
      changedOwners: [{ id: 'o1', assignedToId: A }],
    });
  });

  it('duplicates collapse and only owners whose member changes get a timeline row', () => {
    const plan = planAssignment(
      [
        { id: 'o1', assignedToId: A },
        { id: 'o1', assignedToId: A },
        { id: 'o2', assignedToId: B },
      ],
      [
        { id: 'l1', ownerId: 'o1', assignedToId: A },
        { id: 'l1', ownerId: 'o1', assignedToId: A },
      ],
      B,
    );
    expect(plan.ownerIds).toEqual(['o1', 'o2']);
    expect(plan.listingIds).toEqual(['l1']);
    expect(plan.changedOwners.map((o) => o.id)).toEqual(['o1']);
  });

  it('Assign to `null` → unassigned; member loses access immediately (flow)', () => {
    const plan = planAssignment(
      [
        { id: 'o1', assignedToId: A },
        { id: 'o2', assignedToId: null },
      ],
      [],
      null,
    );
    expect(plan.changedOwners.map((o) => o.id)).toEqual(['o1']);
  });
});
