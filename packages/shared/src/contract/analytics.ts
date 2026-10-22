import { z } from 'zod';

/**
 * Analytics (spec, Shapes → Stats; `GET /analytics/team`, `GET /analytics/members/:id`).
 *
 * A range is two Cairo calendar dates, both included. Unset, it is today (Cairo); with only
 * one end given, the other is the same day. At most 366 days.
 *
 * `assignedOwners`, `adsLive` and `remindersOverdue` are counted at the end of the range (or
 * now, when the range ends in the future); the rest count events inside it. Team totals are the
 * sum of the members.
 */
export const ANALYTICS_MAX_DAYS = 366;

/** `YYYY-MM-DD`, a real calendar date. */
export const CalendarDateSchema = z.iso.date();

export const AnalyticsRangeQuerySchema = z
  .strictObject({
    from: CalendarDateSchema.optional(),
    to: CalendarDateSchema.optional(),
  })
  .refine(
    (q) => !q.from || !q.to || q.from <= q.to,
    '`from` must not be after `to`',
  );
export type AnalyticsRangeQuery = z.input<typeof AnalyticsRangeQuerySchema>;

/** Domain error codes of the analytics endpoints. */
export const AnalyticsErrorCode = {
  /** `from` after `to`, or a range longer than ANALYTICS_MAX_DAYS. */
  INVALID_RANGE: 'INVALID_RANGE',
} as const;
export type AnalyticsErrorCode =
  (typeof AnalyticsErrorCode)[keyof typeof AnalyticsErrorCode];

export const StatsSchema = z.object({
  /** Calls started in the range. */
  calls: z.number().int(),
  /** Those calls by outcome (label in the caller's language); sums to the calls with one. */
  outcomes: z.array(
    z.object({
      outcomeId: z.uuid(),
      label: z.string(),
      count: z.number().int(),
    }),
  ),
  /** Reminders marked done in the range (closed by a delete don't count). */
  remindersDone: z.number().int(),
  /** Reminders still open at the range end whose due time is before it. */
  remindersOverdue: z.number().int(),
  /** Live owners assigned to the member at the range end. */
  assignedOwners: z.number().int(),
  /** Distinct owners whose call in the range got an outcome that sets Interested. */
  interestedOwners: z.number().int(),
  /** Listings the member created in the range. */
  listingsCreated: z.number().int(),
  /** The member's listings with a Live ad at the range end. */
  adsLive: z.number().int(),
  /** The member's listings whose ad was taken down in the range. */
  adsTakenDown: z.number().int(),
});
export type Stats = z.infer<typeof StatsSchema>;

/** A member row: `UserSummary & Stats`, plus `active` (deactivated members who worked show). */
export const MemberStatsSchema = StatsSchema.extend({
  id: z.uuid(),
  name: z.string(),
  active: z.boolean(),
});
export type MemberStats = z.infer<typeof MemberStatsSchema>;

export const AnalyticsRangeSchema = z.object({
  from: CalendarDateSchema,
  to: CalendarDateSchema,
});

export const TeamAnalyticsSchema = z.object({
  range: AnalyticsRangeSchema,
  totals: StatsSchema,
  members: z.array(MemberStatsSchema),
});
export type TeamAnalytics = z.infer<typeof TeamAnalyticsSchema>;

export const MemberAnalyticsSchema = MemberStatsSchema.extend({
  range: AnalyticsRangeSchema,
  /** Every Cairo day of the range, oldest first, with the calls started that day. */
  byDay: z.array(
    z.object({ date: CalendarDateSchema, calls: z.number().int() }),
  ),
});
export type MemberAnalytics = z.infer<typeof MemberAnalyticsSchema>;
