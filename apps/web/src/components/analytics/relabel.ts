import type { CallOutcome, Locale, Stats } from '@prime-crm/shared';

/**
 * The API labels outcomes in the account's saved language, not the page's; relabel them from the
 * outcome list in the language on screen. Outcomes not in the list (hidden ones) keep the API's.
 */
export function relabelOutcomes<T extends Stats>(
  stats: T,
  outcomes: readonly CallOutcome[] | null,
  locale: Locale,
): T {
  if (!outcomes) return stats;
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  return {
    ...stats,
    outcomes: stats.outcomes.map((o) => {
      const known = byId.get(o.outcomeId);
      return known
        ? { ...o, label: locale === 'ar' ? known.labelAr : known.labelEn }
        : o;
    }),
  };
}
