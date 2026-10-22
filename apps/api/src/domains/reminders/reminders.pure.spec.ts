import {
  editRefusal,
  isInPast,
  isSystemKind,
  whenWhere,
} from './reminders.pure';

const NOW = new Date('2026-10-22T09:00:00.000Z');
const END = new Date('2026-10-22T21:00:00.000Z');

describe('reminders.pure', () => {
  it('when: overdue / today / upcoming split time at now and the end of today', () => {
    expect(whenWhere('overdue', NOW, END)).toEqual({
      doneAt: null,
      dueAt: { lt: NOW },
    });
    expect(whenWhere('today', NOW, END)).toEqual({
      dueAt: { gte: NOW, lt: END },
    });
    expect(whenWhere('upcoming', NOW, END)).toEqual({ dueAt: { gte: END } });
  });

  it("editRefusal: done first, then a take-down task's due time", () => {
    expect(editRefusal({ kind: 'MANUAL', doneAt: NOW }, {})).toBe('DONE');
    expect(
      editRefusal({ kind: 'AD_TAKE_DOWN', doneAt: NOW }, { dueAt: 'x' }),
    ).toBe('DONE');
    expect(
      editRefusal({ kind: 'AD_TAKE_DOWN', doneAt: null }, { dueAt: 'x' }),
    ).toBe('SYSTEM');
    expect(editRefusal({ kind: 'AD_TAKE_DOWN', doneAt: null }, {})).toBe(null);
    expect(
      editRefusal({ kind: 'AD_CHECK_IN', doneAt: null }, { dueAt: 'x' }),
    ).toBe(null);
  });

  it('isInPast: now itself is in the past; a millisecond later is not', () => {
    expect(isInPast(NOW, NOW)).toBe(true);
    expect(isInPast(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });

  it('only MANUAL reminders are closed by hand', () => {
    expect(isSystemKind('MANUAL')).toBe(false);
    expect(isSystemKind('AD_CHECK_IN')).toBe(true);
    expect(isSystemKind('AD_TAKE_DOWN')).toBe(true);
  });
});
