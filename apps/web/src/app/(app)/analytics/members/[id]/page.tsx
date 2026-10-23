import { notFound } from 'next/navigation';
import { GET_CALL_OUTCOMES, GET_MEMBER_ANALYTICS } from '@/apis';
import { MemberView } from '@/components/analytics/member-view';
import { resolveRange } from '@/components/analytics/range';
import { relabelOutcomes } from '@/components/analytics/relabel';
import { LoadError } from '@/components/load-error';
import { getLocale, getTranslator } from '@/i18n/server';
import { toCairo } from '@/lib/cairo-time';
import { errorMessage } from '@/lib/error-message';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** One member's analytics (analytics.view) for the range the team page had. */
export default async function MemberAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const today = toCairo(new Date()).day;
  const range = resolveRange(
    { range: one(query.range), from: one(query.from), to: one(query.to) },
    today,
  );
  const [res, outcomes, locale] = await Promise.all([
    GET_MEMBER_ANALYTICS(id, { from: range.from, to: range.to }),
    GET_CALL_OUTCOMES(),
    getLocale(),
  ]);
  if (!res.success) {
    if (res.status === 404 || res.error === 'VALIDATION_FAILED') notFound();
    const t = await getTranslator();
    return (
      <LoadError title={t('analytics.title')} message={errorMessage(t, res)} />
    );
  }
  const data = relabelOutcomes(
    res.data,
    outcomes.success ? outcomes.data : null,
    locale,
  );
  return <MemberView data={data} range={range} today={today} />;
}
