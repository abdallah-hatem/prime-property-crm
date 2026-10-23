import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { GET_LISTING } from '@/apis';
import { EmptyState } from '@/components/empty-state';
import { ListingForm } from '@/components/listings/listing-form';
import { ListingLoadError } from '@/components/listings/listing-load-error';
import { Button } from '@/components/ui/button';
import { getTranslator } from '@/i18n/server';
import { getSession } from '@/lib/session';

/** Edit a listing: its member or someone who manages all listings (the API refuses the rest). */
export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [res, t, session] = await Promise.all([
    GET_LISTING(id),
    getTranslator(),
    getSession(),
  ]);
  if (!res.success) {
    if (res.status === 404 || res.status === 400) notFound();
    return <ListingLoadError />;
  }
  const me = session.status === 'signedIn' ? session.me : null;
  const canManage =
    !!me &&
    (me.permissions.includes('listings.manageAll') ||
      res.data.assignedTo?.id === me.id);
  if (!canManage)
    return (
      <EmptyState
        icon={Lock}
        title={t('listings.form.notYours')}
        action={
          <Button asChild variant="soft">
            <Link href={`/listings/${id}`}>
              {t('listings.form.backToListing')}
            </Link>
          </Button>
        }
      />
    );
  return <ListingForm mode={{ kind: 'edit', listing: res.data }} />;
}
