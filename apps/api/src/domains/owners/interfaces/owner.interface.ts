import type { LeadStatus, OwnerSort } from '@prime-crm/shared';

/** Parsed `q`: the raw text for names, and the digits to look for in phones (if any). */
export interface OwnerSearch {
  text: string;
  /** Digits without leading zeros or the country code: matches inside any stored E.164. */
  phoneDigits: string | null;
}

/**
 * The `GET /owners` filters after scoping. `memberId` is the caller's own id when they lack
 * owners.viewAll: it wins over `assignedTo`, so a member only ever sees their own owners.
 */
export interface OwnerFilter {
  memberId?: string;
  /** `null` = unassigned only. */
  assignedTo?: string | null;
  statuses?: LeadStatus[];
  area?: string;
  importId?: string;
  /** Has (true) or lacks (false) an open reminder. */
  hasReminder?: boolean;
  search?: OwnerSearch;
}

export interface OwnerListOptions {
  sort?: OwnerSort;
}

/** The kinds of item on an owner's timeline. */
export type TimelineKind = 'CALL' | 'NOTE' | 'REMINDER' | 'ASSIGN';

export interface TimelineRef {
  kind: TimelineKind;
  id: string;
  at: Date;
}
