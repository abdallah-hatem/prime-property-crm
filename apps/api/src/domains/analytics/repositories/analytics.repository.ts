import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service';
import type {
  AnalyticsWindow,
  MemberCount,
  MemberDirectoryRow,
  OutcomeCount,
  OutcomeLabelRow,
} from '../interfaces/analytics.interface';

/** A timestamp parameter for raw SQL against `timestamp(3)` (UTC) columns. */
const ts = (at: Date) => Prisma.sql`${at.toISOString()}::timestamp`;

/** `AND <column> = member` when one member is asked for, nothing for the whole team. */
const forMember = (column: Prisma.Sql, memberId?: string) =>
  memberId ? Prisma.sql`AND ${column} = ${memberId}::uuid` : Prisma.empty;

const CAIRO_DAY = (column: Prisma.Sql) =>
  Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD')`;

/**
 * The Stats queries. Each one is a single GROUP BY over the whole team (or one member): the
 * number of queries never grows with the number of members.
 *
 * Event counts use the half-open window [start, end); point-in-time counts use `asOf` (the
 * range end, or now when the range ends in the future).
 */
@Injectable()
export class AnalyticsRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Calls started in the window, per member. */
  calls(w: AnalyticsWindow, memberId?: string): Promise<MemberCount[]> {
    return this.db.$queryRaw<MemberCount[]>`
      SELECT c.member_id AS "memberId", COUNT(*)::int AS "count"
      FROM calls c
      WHERE c.started_at >= ${ts(w.start)} AND c.started_at < ${ts(w.end)}
        ${forMember(Prisma.sql`c.member_id`, memberId)}
      GROUP BY c.member_id`;
  }

  /** Those calls that have an outcome, per member and outcome. */
  outcomes(w: AnalyticsWindow, memberId?: string): Promise<OutcomeCount[]> {
    return this.db.$queryRaw<OutcomeCount[]>`
      SELECT c.member_id AS "memberId", c.outcome_id AS "outcomeId", COUNT(*)::int AS "count"
      FROM calls c
      WHERE c.outcome_id IS NOT NULL
        AND c.started_at >= ${ts(w.start)} AND c.started_at < ${ts(w.end)}
        ${forMember(Prisma.sql`c.member_id`, memberId)}
      GROUP BY c.member_id, c.outcome_id`;
  }

  /**
   * Distinct owners whose call in the window got an outcome that sets Interested, per member.
   * A purged owner (owner_id null) still counts once per call.
   */
  interestedOwners(
    w: AnalyticsWindow,
    memberId?: string,
  ): Promise<MemberCount[]> {
    return this.db.$queryRaw<MemberCount[]>`
      SELECT c.member_id AS "memberId",
             COUNT(DISTINCT COALESCE(c.owner_id, c.id))::int AS "count"
      FROM calls c
      JOIN call_outcomes o ON o.id = c.outcome_id
      WHERE o.sets_status = 'INTERESTED'
        AND c.started_at >= ${ts(w.start)} AND c.started_at < ${ts(w.end)}
        ${forMember(Prisma.sql`c.member_id`, memberId)}
      GROUP BY c.member_id`;
  }

  /** Reminders marked done in the window, per member; closed by a delete don't count. */
  remindersDone(w: AnalyticsWindow, memberId?: string): Promise<MemberCount[]> {
    return this.db.$queryRaw<MemberCount[]>`
      SELECT r.member_id AS "memberId", COUNT(*)::int AS "count"
      FROM reminders r
      WHERE r.member_id IS NOT NULL
        AND r.closed_by_delete = false
        AND r.done_at >= ${ts(w.start)} AND r.done_at < ${ts(w.end)}
        ${forMember(Prisma.sql`r.member_id`, memberId)}
      GROUP BY r.member_id`;
  }

  /** Reminders open at `asOf` and due before it, per member. */
  remindersOverdue(
    w: AnalyticsWindow,
    memberId?: string,
  ): Promise<MemberCount[]> {
    return this.db.$queryRaw<MemberCount[]>`
      SELECT r.member_id AS "memberId", COUNT(*)::int AS "count"
      FROM reminders r
      WHERE r.member_id IS NOT NULL
        AND r.created_at < ${ts(w.asOf)}
        AND r.due_at < ${ts(w.asOf)}
        AND (r.done_at IS NULL OR r.done_at >= ${ts(w.asOf)})
        ${forMember(Prisma.sql`r.member_id`, memberId)}
      GROUP BY r.member_id`;
  }

  /**
   * Owners assigned to each member at `asOf` (live at that moment). The member at `asOf` comes
   * from the assignment history: the latest change before it, else the member before the
   * first change after it, else the owner's member now.
   */
  assignedOwners(
    w: AnalyticsWindow,
    memberId?: string,
  ): Promise<MemberCount[]> {
    const asOf = ts(w.asOf);
    return this.db.$queryRaw<MemberCount[]>`
      SELECT x.member_id AS "memberId", COUNT(*)::int AS "count"
      FROM (
        SELECT CASE
                 WHEN b.id IS NOT NULL THEN b.to_member_id
                 WHEN a.id IS NOT NULL THEN a.from_member_id
                 ELSE o.assigned_to_id
               END AS member_id
        FROM owners o
        LEFT JOIN LATERAL (
          SELECT h.id, h.to_member_id FROM owner_assignments h
          WHERE h.owner_id = o.id AND h.created_at < ${asOf}
          ORDER BY h.created_at DESC, h.id DESC LIMIT 1
        ) b ON true
        LEFT JOIN LATERAL (
          SELECT h.id, h.from_member_id FROM owner_assignments h
          WHERE h.owner_id = o.id AND h.created_at >= ${asOf}
          ORDER BY h.created_at ASC, h.id ASC LIMIT 1
        ) a ON true
        WHERE o.created_at < ${asOf}
          AND (o.deleted_at IS NULL OR o.deleted_at >= ${asOf})
      ) x
      WHERE x.member_id IS NOT NULL
        ${forMember(Prisma.sql`x.member_id`, memberId)}
      GROUP BY x.member_id`;
  }

  /** Listings each member created in the window (deleted ones too: the event happened). */
  listingsCreated(
    w: AnalyticsWindow,
    memberId?: string,
  ): Promise<MemberCount[]> {
    return this.db.$queryRaw<MemberCount[]>`
      SELECT l.created_by_id AS "memberId", COUNT(*)::int AS "count"
      FROM listings l
      WHERE l.created_at >= ${ts(w.start)} AND l.created_at < ${ts(w.end)}
        ${forMember(Prisma.sql`l.created_by_id`, memberId)}
      GROUP BY l.created_by_id`;
  }

  /**
   * Each member's listings whose ad was Live at `asOf`: posted before it, and still Live now or
   * taken down after it; the listing was live (not in the trash) at that moment.
   */
  adsLive(w: AnalyticsWindow, memberId?: string): Promise<MemberCount[]> {
    const asOf = ts(w.asOf);
    return this.db.$queryRaw<MemberCount[]>`
      SELECT l.assigned_to_id AS "memberId", COUNT(*)::int AS "count"
      FROM listings l
      WHERE l.assigned_to_id IS NOT NULL
        AND l.created_at < ${asOf}
        AND (l.deleted_at IS NULL OR l.deleted_at >= ${asOf})
        AND l.ad_posted_at < ${asOf}
        AND (
          l.ad_status = 'LIVE'
          OR (l.ad_status = 'TAKEN_DOWN' AND l.ad_taken_down_at >= ${asOf})
        )
        ${forMember(Prisma.sql`l.assigned_to_id`, memberId)}
      GROUP BY l.assigned_to_id`;
  }

  /** Each member's listings whose ad was taken down in the window. */
  adsTakenDown(w: AnalyticsWindow, memberId?: string): Promise<MemberCount[]> {
    return this.db.$queryRaw<MemberCount[]>`
      SELECT l.assigned_to_id AS "memberId", COUNT(*)::int AS "count"
      FROM listings l
      WHERE l.assigned_to_id IS NOT NULL
        AND l.ad_taken_down_at >= ${ts(w.start)} AND l.ad_taken_down_at < ${ts(w.end)}
        ${forMember(Prisma.sql`l.assigned_to_id`, memberId)}
      GROUP BY l.assigned_to_id`;
  }

  /** One member's calls per Cairo day of the window (days without calls are absent). */
  callsByDay(
    w: AnalyticsWindow,
    memberId: string,
  ): Promise<{ date: string; count: number }[]> {
    const day = CAIRO_DAY(Prisma.sql`c.started_at`);
    return this.db.$queryRaw<{ date: string; count: number }[]>`
      SELECT ${day} AS "date", COUNT(*)::int AS "count"
      FROM calls c
      WHERE c.member_id = ${memberId}::uuid
        AND c.started_at >= ${ts(w.start)} AND c.started_at < ${ts(w.end)}
      GROUP BY 1`;
  }

  /** Active users, plus these ids (deactivated members who worked in the range). */
  members(extraIds: string[]): Promise<MemberDirectoryRow[]> {
    return this.db.user.findMany({
      where: { OR: [{ active: true }, { id: { in: extraIds } }] },
      select: { id: true, name: true, active: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  member(id: string): Promise<MemberDirectoryRow | null> {
    return this.db.user.findUnique({
      where: { id },
      select: { id: true, name: true, active: true },
    });
  }

  outcomeLabels(ids: string[]): Promise<OutcomeLabelRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.callOutcome.findMany({
      where: { id: { in: ids } },
      select: { id: true, labelEn: true, labelAr: true, order: true },
    });
  }
}
