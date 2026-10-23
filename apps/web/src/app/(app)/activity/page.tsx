import { z } from 'zod';
import { ActivityTypeSchema } from '@prime-crm/shared';
import { GET_ACTIVITY, GET_USER_OPTIONS } from '@/apis';
import {
  ActivityView,
  type ActorOption,
} from '@/components/admin/activity/activity-view';
import { LoadError } from '@/components/load-error';
import { getTranslator } from '@/i18n/server';
import { toCairo } from '@/lib/cairo-time';
import { getSession } from '@/lib/session';

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;
const day = (value: string | undefined): string | null =>
  z.iso.date().safeParse(value).success ? (value as string) : null;

/** The people the "Who" filter offers: active first, then deactivated (if the viewer may list them). */
async function actorOptions(
  permissions: readonly string[],
): Promise<ActorOption[] | null> {
  if (
    !permissions.includes('users.manage') &&
    !permissions.includes('owners.assign')
  )
    return null;
  const [active, inactive] = await Promise.all([
    GET_USER_OPTIONS(true),
    GET_USER_OPTIONS(false),
  ]);
  if (!active.success || !inactive.success) return null;
  return [
    ...active.data.map((u) => ({ ...u, active: true })),
    ...inactive.data.map((u) => ({ ...u, active: false })),
  ];
}

/** Activity (activity.view): type, person and dates in the URL. */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const typeParam = ActivityTypeSchema.safeParse(one(params.type));
  const type = typeParam.success ? typeParam.data : null;
  const actorParam = z.uuid().safeParse(one(params.actor));
  const actorId = actorParam.success ? actorParam.data : null;
  let from = day(one(params.from));
  let to = day(one(params.to));
  if (from && to && from > to) [from, to] = [to, from];
  if (!from && to) from = to;
  const pageNumber = Number(one(params.page) ?? 1);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const session = await getSession();
  const permissions =
    session.status === 'signedIn' ? session.me.permissions : [];
  const [res, actors] = await Promise.all([
    GET_ACTIVITY({
      type: type ?? undefined,
      actorId: actorId ?? undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      page,
    }),
    actorOptions(permissions),
  ]);
  if (!res.success || !res.meta) {
    const t = await getTranslator();
    return <LoadError title={t('nav.activity')} message={t('error.generic')} />;
  }
  return (
    <ActivityView
      rows={res.data}
      meta={res.meta}
      type={type}
      actorId={actorId}
      from={from}
      to={to}
      today={toCairo(new Date()).day}
      actors={actors}
    />
  );
}
