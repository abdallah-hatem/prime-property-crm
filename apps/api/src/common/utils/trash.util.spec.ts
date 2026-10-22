import { isRestorable, purgeAtFor, trashCutoff } from './trash.util';

const deletedAt = new Date('2026-10-01T10:15:00.000Z');
const MINUTE = 60_000;

describe('trash timing', () => {
  it('Trash core computes purgeAt = deletedAt + 30 days', () => {
    expect(purgeAtFor(deletedAt).toISOString()).toBe(
      '2026-10-31T10:15:00.000Z',
    );
    // Calendar-independent: 30 × 24 h, across a month end and Cairo's DST change.
    expect(purgeAtFor(deletedAt).getTime() - deletedAt.getTime()).toBe(
      30 * 24 * 60 * MINUTE,
    );
  });

  it('Item deleted exactly 30 days ago is still restorable; 30 days + 1 minute is not', () => {
    const purgeAt = purgeAtFor(deletedAt);
    expect(isRestorable(deletedAt, purgeAt)).toBe(true);
    expect(isRestorable(deletedAt, new Date(purgeAt.getTime() + MINUTE))).toBe(
      false,
    );
    expect(isRestorable(deletedAt, deletedAt)).toBe(true);
  });

  it('the trash cutoff is 30 days before now, agreeing with isRestorable', () => {
    const now = new Date('2026-10-31T10:15:00.000Z');
    expect(trashCutoff(now).toISOString()).toBe(deletedAt.toISOString());
    expect(isRestorable(trashCutoff(now), now)).toBe(true);
    expect(isRestorable(new Date(trashCutoff(now).getTime() - 1), now)).toBe(
      false,
    );
  });
});
