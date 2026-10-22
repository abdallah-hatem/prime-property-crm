import {
  fillDays,
  membersWithActivity,
  resolveWindow,
  statsFor,
  sumStats,
} from './analytics.pure';
import type {
  OutcomeLabelRow,
  StatsSources,
} from './interfaces/analytics.interface';

const empty = (): StatsSources => ({
  calls: [],
  outcomes: [],
  remindersDone: [],
  remindersOverdue: [],
  assignedOwners: [],
  interestedOwners: [],
  listingsCreated: [],
  adsLive: [],
  adsTakenDown: [],
});

const labels = new Map<string, OutcomeLabelRow>([
  ['o1', { id: 'o1', labelEn: 'Interested', labelAr: 'مهتم', order: 2 }],
  ['o2', { id: 'o2', labelEn: 'No answer', labelAr: 'لا رد', order: 1 }],
]);

describe('resolveWindow', () => {
  // 2026-10-22T21:30Z = 23 Oct 00:30 in Cairo (UTC+3 until 29 Oct 2026).
  const now = new Date('2026-10-22T21:30:00Z');

  it('Default range is today in Cairo (business: default today)', () => {
    const w = resolveWindow({}, now);
    expect(w).toEqual({
      from: '2026-10-23',
      to: '2026-10-23',
      start: new Date('2026-10-22T21:00:00Z'),
      end: new Date('2026-10-23T21:00:00Z'),
      asOf: now,
    });
  });

  it('one end only is that single day; a past range is counted at its end', () => {
    const w = resolveWindow({ to: '2025-03-12' }, now);
    if (typeof w === 'string') throw new Error(w);
    expect(w).toMatchObject({ from: '2025-03-12', to: '2025-03-12' });
    expect(w.asOf).toEqual(w.end);
    expect(w.end).toEqual(new Date('2025-03-12T22:00:00Z'));
  });

  it('`from` after `to`, range > 366 days → 400 (contract)', () => {
    expect(resolveWindow({ from: '2025-03-12', to: '2025-03-10' }, now)).toBe(
      'FROM_AFTER_TO',
    );
    expect(resolveWindow({ from: '2024-01-01', to: '2025-01-01' }, now)).toBe(
      'TOO_LONG',
    );
    expect(
      typeof resolveWindow({ from: '2024-01-01', to: '2024-12-31' }, now),
    ).toBe('object');
    expect(resolveWindow({ from: '2025-02-30' }, now)).toBe('NOT_A_DATE');
  });
});

describe('statsFor / sumStats', () => {
  const sources: StatsSources = {
    ...empty(),
    calls: [
      { memberId: 'a', count: 4 },
      { memberId: 'b', count: 1 },
    ],
    outcomes: [
      { memberId: 'a', outcomeId: 'o1', count: 1 },
      { memberId: 'a', outcomeId: 'o2', count: 2 },
      { memberId: 'b', outcomeId: 'o2', count: 1 },
    ],
    adsLive: [{ memberId: 'b', count: 3 }],
  };

  it('Calls counted by start time in range; outcomes breakdown sums to calls with an outcome (business: analytics)', () => {
    const a = statsFor('a', sources, labels, 'en');
    expect(a.calls).toBe(4);
    // Ordered like the outcome list, labels in the reader's language.
    expect(a.outcomes).toEqual([
      { outcomeId: 'o2', label: 'No answer', count: 2 },
      { outcomeId: 'o1', label: 'Interested', count: 1 },
    ]);
    expect(statsFor('a', sources, labels, 'ar').outcomes[0].label).toBe(
      'لا رد',
    );
    expect(statsFor('nobody', sources, labels, 'en')).toMatchObject({
      calls: 0,
      outcomes: [],
    });
  });

  it('Team totals equal the sum of members (contract)', () => {
    const members = ['a', 'b'].map((id) => statsFor(id, sources, labels, 'en'));
    const total = sumStats(members, labels);
    expect(total.calls).toBe(5);
    expect(total.adsLive).toBe(3);
    expect(total.outcomes).toEqual([
      { outcomeId: 'o2', label: 'No answer', count: 3 },
      { outcomeId: 'o1', label: 'Interested', count: 1 },
    ]);
    // Summing doesn't change the member rows.
    expect(members[0].outcomes[0].count).toBe(2);
  });

  it('Deactivated member still appears for a range in which they worked (business: history stays)', () => {
    expect(
      membersWithActivity({
        ...empty(),
        calls: [{ memberId: 'off', count: 1 }],
        adsLive: [{ memberId: 'b', count: 1 }],
        remindersDone: [{ memberId: 'off', count: 2 }],
      }).sort(),
    ).toEqual(['b', 'off']);
  });
});

describe('fillDays', () => {
  it('every day of the range, zero where no calls', () => {
    expect(
      fillDays({ from: '2024-02-28', to: '2024-03-01' }, [
        { date: '2024-02-29', count: 4 },
      ]),
    ).toEqual([
      { date: '2024-02-28', calls: 0 },
      { date: '2024-02-29', calls: 4 },
      { date: '2024-03-01', calls: 0 },
    ]);
  });
});
