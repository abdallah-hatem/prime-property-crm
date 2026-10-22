import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AnalyticsErrorCode,
  ANALYTICS_MAX_DAYS,
  ErrorCode,
  type MemberAnalytics,
  type TeamAnalytics,
} from '@prime-crm/shared';
import { Clock } from '../../common/providers/clock';
import { UserDirectoryRepository } from '../../common/repositories/user-directory.repository';
import { assertFound } from '../../common/utils/ownership.util';
import {
  fillDays,
  membersWithActivity,
  resolveWindow,
  statsFor,
  sumStats,
} from './analytics.pure';
import type { AnalyticsQueryDto } from './dto/analytics-query.dto';
import type {
  AnalyticsWindow,
  OutcomeLabelRow,
  StatsSources,
} from './interfaces/analytics.interface';
import { AnalyticsRepository } from './repositories/analytics.repository';

/**
 * Analytics (analytics.view): Stats per member and for the team over a Cairo date range.
 * Every figure comes from one GROUP BY per stat, whatever the team size.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly analytics: AnalyticsRepository,
    private readonly users: UserDirectoryRepository,
    private readonly clock: Clock,
  ) {}

  private window(query: AnalyticsQueryDto): AnalyticsWindow {
    const result = resolveWindow(query, this.clock.now());
    if (result === 'NOT_A_DATE') {
      throw new BadRequestException({
        message: '`from` and `to` must be real dates (YYYY-MM-DD)',
        error: ErrorCode.VALIDATION_FAILED,
      });
    }
    if (result === 'FROM_AFTER_TO' || result === 'TOO_LONG') {
      throw new BadRequestException({
        message:
          result === 'TOO_LONG'
            ? `A range is at most ${ANALYTICS_MAX_DAYS} days`
            : '`from` must not be after `to`',
        error: AnalyticsErrorCode.INVALID_RANGE,
      });
    }
    return result;
  }

  private async sources(
    w: AnalyticsWindow,
    memberId?: string,
  ): Promise<StatsSources> {
    const a = this.analytics;
    const [
      calls,
      outcomes,
      remindersDone,
      remindersOverdue,
      assignedOwners,
      interestedOwners,
      listingsCreated,
      adsLive,
      adsTakenDown,
    ] = await Promise.all([
      a.calls(w, memberId),
      a.outcomes(w, memberId),
      a.remindersDone(w, memberId),
      a.remindersOverdue(w, memberId),
      a.assignedOwners(w, memberId),
      a.interestedOwners(w, memberId),
      a.listingsCreated(w, memberId),
      a.adsLive(w, memberId),
      a.adsTakenDown(w, memberId),
    ]);
    return {
      calls,
      outcomes,
      remindersDone,
      remindersOverdue,
      assignedOwners,
      interestedOwners,
      listingsCreated,
      adsLive,
      adsTakenDown,
    };
  }

  private async labels(
    sources: StatsSources,
  ): Promise<Map<string, OutcomeLabelRow>> {
    const ids = [...new Set(sources.outcomes.map((o) => o.outcomeId))];
    const rows = await this.analytics.outcomeLabels(ids);
    return new Map(rows.map((r) => [r.id, r]));
  }

  /**
   * Every active user, plus deactivated ones who worked in the range (their history stays),
   * and the team totals: the sum of the members.
   */
  async team(
    query: AnalyticsQueryDto,
    callerId: string,
  ): Promise<TeamAnalytics> {
    const w = this.window(query);
    const sources = await this.sources(w);
    const [labels, members, language] = await Promise.all([
      this.labels(sources),
      this.analytics.members(membersWithActivity(sources)),
      this.users.languageOf(callerId),
    ]);
    const rows = members.map((m) => ({
      id: m.id,
      name: m.name,
      active: m.active,
      ...statsFor(m.id, sources, labels, language),
    }));
    return {
      range: { from: w.from, to: w.to },
      totals: sumStats(rows, labels),
      members: rows,
    };
  }

  /** One user's Stats plus their calls per Cairo day; 404 for an unknown id. */
  async member(
    id: string,
    query: AnalyticsQueryDto,
    callerId: string,
  ): Promise<MemberAnalytics> {
    const w = this.window(query);
    const user = assertFound(await this.analytics.member(id), 'User');
    const [sources, byDay, language] = await Promise.all([
      this.sources(w, id),
      this.analytics.callsByDay(w, id),
      this.users.languageOf(callerId),
    ]);
    const labels = await this.labels(sources);
    return {
      id: user.id,
      name: user.name,
      active: user.active,
      ...statsFor(id, sources, labels, language),
      range: { from: w.from, to: w.to },
      byDay: fillDays(w, byDay),
    };
  }
}
