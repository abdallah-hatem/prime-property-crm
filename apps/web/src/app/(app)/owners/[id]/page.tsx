import { notFound } from 'next/navigation';
import type { OwnerTimelineItem } from '@prime-crm/shared';
import { GET_OWNER, GET_OWNER_TIMELINE } from '@/apis';
import { LoadError } from '@/components/load-error';
import { OwnerDetail } from '@/components/owners/owner-detail';
import { getTranslator } from '@/i18n/server';

/** One owner's history is short; the page reads up to this many timeline pages (20 each). */
const TIMELINE_PAGES = 5;

async function fullTimeline(id: string): Promise<OwnerTimelineItem[] | null> {
  const items: OwnerTimelineItem[] = [];
  for (let page = 1; page <= TIMELINE_PAGES; page++) {
    const res = await GET_OWNER_TIMELINE(id, page);
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
  const timeline = await fullTimeline(id);
  if (!timeline) {
    const t = await getTranslator();
    return <LoadError title={owner.data.name} message={t('error.generic')} />;
  }
  return (
    <OwnerDetail
      owner={owner.data}
      timeline={timeline}
      now={new Date().toISOString()}
    />
  );
}
