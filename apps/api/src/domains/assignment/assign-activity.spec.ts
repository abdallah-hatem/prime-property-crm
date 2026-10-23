import { assignActivity } from './assign-activity';

const sara = { id: 'sara', name: 'Sara' };

describe('assignActivity', () => {
  it('owners to a member: summary, target and counts', () => {
    expect(
      assignActivity('admin', { kind: 'OWNERS', count: 2, assignee: sara }),
    ).toEqual({
      type: 'ASSIGN',
      actorId: 'admin',
      summary: 'Assigned 2 owners to Sara',
      target: { kind: 'USER', id: 'sara', label: 'Sara' },
      details: { kind: 'OWNERS', count: 2, assigneeId: 'sara' },
    });
  });

  it('one listing to nobody: singular noun, no target', () => {
    expect(
      assignActivity('admin', { kind: 'LISTINGS', count: 1, assignee: null }),
    ).toMatchObject({
      summary: 'Unassigned 1 listing',
      target: null,
      details: { kind: 'LISTINGS', count: 1, assigneeId: null },
    });
  });

  it('listings with owner leads that moved along: both counts', () => {
    const entry = assignActivity('admin', {
      kind: 'LISTINGS',
      count: 3,
      assignee: sara,
      linkedOwners: 1,
    });
    expect(entry.summary).toBe(
      'Assigned 3 listings (with 1 owner lead) to Sara',
    );
    expect(entry.details).toEqual({
      kind: 'LISTINGS',
      count: 3,
      assigneeId: 'sara',
      linkedOwners: 1,
    });
  });

  it('linkedOwners 0 is left out', () => {
    const entry = assignActivity('admin', {
      kind: 'LISTINGS',
      count: 2,
      assignee: sara,
      linkedOwners: 0,
    });
    expect(entry.summary).toBe('Assigned 2 listings to Sara');
    expect(entry.details).toEqual({
      kind: 'LISTINGS',
      count: 2,
      assigneeId: 'sara',
    });
  });
});
