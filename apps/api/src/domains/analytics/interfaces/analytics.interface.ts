/** A resolved analytics range: Cairo dates and the instants the queries use. */
export interface AnalyticsWindow {
  /** Cairo dates, both included. */
  from: string;
  to: string;
  /** [start, end): the first instant of `from`, the first instant after `to`. */
  start: Date;
  end: Date;
  /** When the point-in-time counts are taken: `end`, or now if the range ends later. */
  asOf: Date;
}

export interface MemberCount {
  memberId: string;
  count: number;
}

export interface OutcomeCount extends MemberCount {
  outcomeId: string;
}

export interface MemberDirectoryRow {
  id: string;
  name: string;
  active: boolean;
}

export interface OutcomeLabelRow {
  id: string;
  labelEn: string;
  labelAr: string;
  order: number;
}

/** Every per-member query result of one range, as the pure assembly takes them. */
export interface StatsSources {
  calls: MemberCount[];
  outcomes: OutcomeCount[];
  remindersDone: MemberCount[];
  remindersOverdue: MemberCount[];
  assignedOwners: MemberCount[];
  interestedOwners: MemberCount[];
  listingsCreated: MemberCount[];
  adsLive: MemberCount[];
  adsTakenDown: MemberCount[];
}
