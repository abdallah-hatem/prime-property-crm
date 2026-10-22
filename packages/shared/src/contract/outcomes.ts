import type { LeadStatus } from './enums';

/** Lead statuses a call outcome may set: every status except LISTED (only a listing sets it). */
export type OutcomeStatus = Exclude<LeadStatus, 'LISTED'>;

export interface DefaultCallOutcome {
  labelEn: string;
  labelAr: string;
  setsStatus: OutcomeStatus;
  order: number;
}

/**
 * The ten default call outcomes and the status each sets (spec, "Default call outcomes";
 * business doc, "Call outcome"). Seeded once; the admin edits them afterwards.
 */
export const DEFAULT_CALL_OUTCOMES: readonly DefaultCallOutcome[] = [
  {
    labelEn: 'No answer',
    labelAr: 'لا يرد',
    setsStatus: 'CONTACTED',
    order: 1,
  },
  { labelEn: 'Busy', labelAr: 'مشغول', setsStatus: 'CONTACTED', order: 2 },
  {
    labelEn: 'Switched off',
    labelAr: 'الهاتف مغلق',
    setsStatus: 'CONTACTED',
    order: 3,
  },
  {
    labelEn: 'Wrong number',
    labelAr: 'رقم خاطئ',
    setsStatus: 'DO_NOT_CALL',
    order: 4,
  },
  {
    labelEn: 'Interested to sell',
    labelAr: 'مهتم بالبيع',
    setsStatus: 'INTERESTED',
    order: 5,
  },
  {
    labelEn: 'Interested to rent',
    labelAr: 'مهتم بالإيجار',
    setsStatus: 'INTERESTED',
    order: 6,
  },
  {
    labelEn: 'Not interested',
    labelAr: 'غير مهتم',
    setsStatus: 'NOT_INTERESTED',
    order: 7,
  },
  {
    labelEn: 'Call back later',
    labelAr: 'معاودة الاتصال لاحقًا',
    setsStatus: 'CALL_BACK',
    order: 8,
  },
  {
    labelEn: 'Already sold or rented',
    labelAr: 'تم البيع أو الإيجار بالفعل',
    setsStatus: 'NOT_INTERESTED',
    order: 9,
  },
  {
    labelEn: 'Do not call again',
    labelAr: 'عدم الاتصال مرة أخرى',
    setsStatus: 'DO_NOT_CALL',
    order: 10,
  },
];

/** Default interval between Property Finder ad check-ins, in days (admin-adjustable 1–90). */
export const AD_CHECK_IN_DAYS_DEFAULT = 7;
export const AD_CHECK_IN_DAYS_MIN = 1;
export const AD_CHECK_IN_DAYS_MAX = 90;

/** Listing price bounds in whole EGP (business doc, "Listing"). */
export const PRICE_MIN = 1;
export const PRICE_MAX = 1_000_000_000;
