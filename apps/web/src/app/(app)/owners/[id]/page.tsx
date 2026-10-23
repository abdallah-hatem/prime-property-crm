import { notFound } from 'next/navigation';
import type { OwnerTimelineItem, Reminder } from '@prime-crm/shared';
import { GET_OWNER, GET_OWNER_TIMELINE, GET_REMINDERS } from '@/apis';
import { LoadError } from '@/components/load-error';
import type { ApiResult } from '@/lib/api-result';
import { OwnerDetail } from '@/components/owners/owner-detail';
import { getTranslator } from '@/i18n/server';

/** One owner's history is short; the page reads up to this many pages (20 each) of a list. */
const MAX_PAGES = 5;

/** Every page of a short list (up to MAX_PAGES), or null when one fails. */
async function allPages<T>(
  read: (page: number) => Promise<ApiResult<T[]>>,
): Promise<T[] | null> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await read(page);
    if (!res.success) return null;
    items.push(...res.data);
    if (!res.meta?.hasNextPage) break;
  }
  return items;
}

/** Owner detail. Not yours (without owners.viewAll), trashed or unknown → 404. */
export default async function OwnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const owner = await GET_OWNER(id);
  if (!owner.success) {
    if (owner.status === 404 || owner.status === 400) notFound();
    const t = await getTranslator();
    return <LoadError title={t('owners.title')} message={t('error.generic')} />;
  }
  const [timeline, reminders] = await Promise.all([
    allPages<OwnerTimelineItem>((page) => GET_OWNER_TIMELINE(id, page)),
    allPages<Reminder>((page) => GET_REMINDERS({ ownerId: id, page })),
  ]);
  if (!timeline || !reminders) {
    const t = await getTranslator();
    return <LoadError title={owner.data.name} message={t('error.generic')} />;
  }
  return (
    <OwnerDetail
      owner={owner.data}
      timeline={timeline}
      reminders={reminders}
      now={new Date().toISOString()}
    />
  );
}
