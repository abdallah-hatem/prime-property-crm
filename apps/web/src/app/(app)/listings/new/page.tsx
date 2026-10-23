import Link from 'next/link';
import { UsersRound } from 'lucide-react';
import { GET_LISTING_SOURCE_OWNER } from '@/apis';
import { EmptyState } from '@/components/empty-state';
import { ListingForm } from '@/components/listings/listing-form';
import { ListingLoadError } from '@/components/listings/listing-load-error';
import { Button } from '@/components/ui/button';
import { getTranslator } from '@/i18n/server';
import { getSession } from '@/lib/session';

/**
 * New listing: from an owner (`?ownerId=`, the owner's details fill the contact) or, with
 * listings.create, directly with the owner's name and phone.
 */
export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ ownerId?: string | string[] }>;
}) {
  const [{ ownerId }, t, session] = await Promise.all([
    searchParams,
    getTranslator(),
    getSession(),
  ]);
  const id = typeof ownerId === 'string' ? ownerId : undefined;

  if (id) {
    const owner = await GET_LISTING_SOURCE_OWNER(id);
    if (!owner.success)
      return <ListingLoadError message={t('listings.form.ownerLoadError')} />;
    return <ListingForm mode={{ kind: 'create', owner: owner.data }} />;
  }

  const canCreate =
    session.status === 'signedIn' &&
    session.me.permissions.includes('listings.create');
  if (!canCreate)
    return (
      <EmptyState
        icon={UsersRound}
        title={t('listings.form.noCreateTitle')}
        body={t('listings.form.noCreateBody')}
        action={
          <Button asChild variant="soft">
            <Link href="/owners">{t('listings.form.openOwners')}</Link>
          </Button>
        }
      />
    );
  return <ListingForm mode={{ kind: 'create', owner: null }} />;
}
