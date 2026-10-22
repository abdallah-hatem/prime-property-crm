import type { Prisma } from '@prisma/client';
import type { Call, Language } from '@prime-crm/shared';

/**
 * The columns behind the contract's `Call`; pass as `select`, map with `toCall`. The calls
 * task reuses both. `outcome.label` is in the reader's language.
 */
export const CALL_SELECT = {
  id: true,
  ownerId: true,
  ownerName: true,
  phone: true,
  startedAt: true,
  note: true,
  outcomeAt: true,
  member: { select: { id: true, name: true } },
  outcome: {
    select: { id: true, labelEn: true, labelAr: true, setsStatus: true },
  },
} as const satisfies Prisma.CallSelect;

export type CallRow = Prisma.CallGetPayload<{ select: typeof CALL_SELECT }>;

/** An outcome's label in `language`. */
export function outcomeLabel(
  outcome: { labelEn: string; labelAr: string },
  language: Language,
): string {
  return language === 'ar' ? outcome.labelAr : outcome.labelEn;
}

export function toCall(row: CallRow, language: Language): Call {
  return {
    id: row.id,
    owner: { id: row.ownerId, name: row.ownerName },
    member: row.member,
    phone: row.phone,
    startedAt: row.startedAt.toISOString(),
    outcome: row.outcome
      ? {
          id: row.outcome.id,
          label: outcomeLabel(row.outcome, language),
          setsStatus: row.outcome.setsStatus,
        }
      : null,
    note: row.note,
    outcomeAt: row.outcomeAt?.toISOString() ?? null,
  };
}
