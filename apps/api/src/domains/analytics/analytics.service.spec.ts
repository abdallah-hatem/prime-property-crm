import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

const NOW = new Date('2025-03-20T10:00:00Z');
const QUERIES = [
  'calls',
  'outcomes',
  'remindersDone',
  'remindersOverdue',
  'assignedOwners',
  'interestedOwners',
  'listingsCreated',
  'adsLive',
  'adsTakenDown',
] as const;

function makeService(overrides: Record<string, jest.Mock> = {}) {
  const repo: Record<string, jest.Mock> = {
    ...Object.fromEntries(
      QUERIES.map((q) => [q, jest.fn().mockResolvedValue([])]),
    ),
    callsByDay: jest.fn().mockResolvedValue([]),
    members: jest.fn().mockResolvedValue([]),
    member: jest
      .fn()
      .mockResolvedValue({ id: 'm1', name: 'Sara', active: true }),
    outcomeLabels: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  const users = { languageOf: jest.fn().mockResolvedValue('en') };
  const svc = new AnalyticsService(repo as never, users as never, {
    now: () => NOW,
  });
  return { svc, repo };
}

describe('AnalyticsService', () => {
  it('one GROUP BY query per stat for the whole team (no per-member queries)', async () => {
    const { svc, repo } = makeService({
      members: jest.fn().mockResolvedValue(
        Array.from({ length: 30 }, (_, i) => ({
          id: `m${i}`,
          name: `M${i}`,
          active: true,
        })),
      ),
    });
    const t = await svc.team({ from: '2025-03-10', to: '2025-03-12' }, 'me');
    expect(t.members).toHaveLength(30);
    for (const q of QUERIES) {
      expect(repo[q]).toHaveBeenCalledTimes(1);
      expect(repo[q].mock.calls[0][1]).toBeUndefined();
    }
  });

  it('Deactivated member still appears for a range in which they worked (business: history stays)', async () => {
    const { svc, repo } = makeService({
      calls: jest.fn().mockResolvedValue([{ memberId: 'off', count: 2 }]),
      members: jest
        .fn()
        .mockResolvedValue([{ id: 'off', name: 'Old', active: false }]),
    });
    const t = await svc.team({}, 'me');
    expect(repo.members).toHaveBeenCalledWith(['off']);
    expect(t.members[0]).toMatchObject({ id: 'off', active: false, calls: 2 });
    expect(t.totals.calls).toBe(2);
  });

  it('`from` after `to`, range > 366 days → 400 (contract)', async () => {
    const { svc, repo } = makeService();
    for (const q of [
      { from: '2025-03-12', to: '2025-03-10' },
      { from: '2024-01-01', to: '2025-01-01' },
      { from: '2025-02-30' },
    ]) {
      await expect(svc.team(q, 'me')).rejects.toThrow(BadRequestException);
      await expect(svc.member('m1', q, 'me')).rejects.toThrow(
        BadRequestException,
      );
    }
    expect(repo.calls).not.toHaveBeenCalled();
  });

  it('member: unknown id → 404; stats are filtered to the member, byDay fills the range', async () => {
    const missing = makeService({ member: jest.fn().mockResolvedValue(null) });
    await expect(missing.svc.member('x', {}, 'me')).rejects.toThrow(
      NotFoundException,
    );

    const { svc, repo } = makeService({
      callsByDay: jest
        .fn()
        .mockResolvedValue([{ date: '2025-03-11', count: 3 }]),
    });
    const out = await svc.member(
      'm1',
      { from: '2025-03-10', to: '2025-03-12' },
      'me',
    );
    expect(repo.calls.mock.calls[0][1]).toBe('m1');
    expect(out.byDay).toEqual([
      { date: '2025-03-10', calls: 0 },
      { date: '2025-03-11', calls: 3 },
      { date: '2025-03-12', calls: 0 },
    ]);
    expect(out.range).toEqual({ from: '2025-03-10', to: '2025-03-12' });
  });
});
