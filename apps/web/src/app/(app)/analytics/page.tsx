import { GET_CALL_OUTCOMES, GET_TEAM_ANALYTICS } from '@/apis';
import { AnalyticsView } from '@/components/analytics/analytics-view';
import { resolveRange } from '@/components/analytics/range';
import { relabelOutcomes } from '@/components/analytics/relabel';
import { LoadError } from '@/components/load-error';
import { getLocale, getTranslator } from '@/i18n/server';
import { errorMessage } from '@/lib/error-message';
import { toCairo } from '@/lib/cairo-time';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Analytics (analytics.view): team totals and every member for a range of Cairo days. */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const today = toCairo(new Date()).day;
  const range = resolveRange(
    { range: one(params.range), from: one(params.from), to: one(params.to) },
    today,
  );
  const [res, outcomes, locale] = await Promise.all([
    GET_TEAM_ANALYTICS({ from: range.from, to: range.to }),
    GET_CALL_OUTCOMES(),
    getLocale(),
  ]);
  if (!res.success) {
    const t = await getTranslator();
    return (
      <LoadError title={t('analytics.title')} message={errorMessage(t, res)} />
    );
  }
  const labels = outcomes.success ? outcomes.data : null;
  const data = {
    ...res.data,
    totals: relabelOutcomes(res.data.totals, labels, locale),
  };
  return <AnalyticsView data={data} range={range} today={today} />;
}
