import type { CallOutcome, LeadStatus } from '@prime-crm/shared';
import type { CallOutcomeRow } from './repositories/call-outcome.repository';

/** The fields an admin edits on an outcome. */
export interface OutcomeFields {
  labelEn: string;
  labelAr: string;
  setsStatus: LeadStatus;
  hidden: boolean;
  order: number;
}

export type OutcomeChanges = Partial<{
  [K in keyof OutcomeFields]: { from: OutcomeFields[K]; to: OutcomeFields[K] };
}>;

const EDITABLE: (keyof OutcomeFields)[] = [
  'labelEn',
  'labelAr',
  'setsStatus',
  'hidden',
  'order',
];

/** The fields `patch` actually changes, each with its old and new value. */
export function changedFields(
  current: OutcomeFields,
  patch: Partial<OutcomeFields>,
): OutcomeChanges {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of EDITABLE) {
    const to = patch[field];
    if (to !== undefined && to !== current[field]) {
      changes[field] = { from: current[field], to };
    }
  }
  return changes;
}

export function toCallOutcome(row: CallOutcomeRow): CallOutcome {
  return {
    id: row.id,
    labelEn: row.labelEn,
    labelAr: row.labelAr,
    // The database refuses LISTED (CHECK), so every stored status is an outcome status.
    setsStatus: row.setsStatus as CallOutcome['setsStatus'],
    hidden: row.hidden,
    order: row.order,
    inUse: row._count.calls > 0,
  };
}
