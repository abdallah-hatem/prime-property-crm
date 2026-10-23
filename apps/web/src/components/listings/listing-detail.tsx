'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellRing, MapPin, Pencil, Trash2, UserRound } from 'lucide-react';
import type { Listing, Photo } from '@prime-crm/shared';
import { DELETE_LISTING, UPDATE_LISTING_AD } from '@/apis';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useCan, useSession } from '@/components/session-provider';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { formatNumber } from '@/lib/format';
import { AdCard, takeDownPending } from './ad-card';
import { ListingFactTiles } from './listing-facts';
import { ListingNotes } from './listing-notes';
import { OwnerCard } from './owner-card';
import { PhotoGallery } from './photo-gallery';
import { PhotoManager } from './photo-manager';
import { StatusMenu } from './status-menu';
import { useMutation } from './use-mutation';
import { UserText } from '@/components/user-text';

/** Who may change a listing: its member, or anyone who manages all listings (the API agrees). */
export function useCanManageListing(listing: Pick<Listing, 'assignedTo'>) {
  const me = useSession();
  const manageAll = useCan('listings.manageAll');
  return manageAll || (!!me && listing.assignedTo?.id === me.id);
}

/**
 * One listing, laid out like the approved mockup: the photo strip with the price sheet rising
 * over it, the fact tiles, the Property Finder ad card, the owner (phone only when it's yours),
 * then description, notes, photos and details. Every change comes back as the updated listing.
 */
export function ListingDetail({ listing: initial }: { listing: Listing }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [listing, setListing] = useState(initial);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canManage = useCanManageListing(listing);
  const canDelete = useCan('listings.manageAll');
  const takeDown = useMutation();

  const setPhotos = (photos: Photo[]) =>
    setListing((current) => ({
      ...current,
      photos,
      coverPhotoUrl: photos[0]?.url ?? null,
    }));

  async function remove() {
    const res = await takeDown.run(() => DELETE_LISTING(listing.id), {
      showSuccessToast: true,
      successMessage: t('listings.detail.deleted'),
    });
    if (!res || isUnauthorized(res) || !res.success) return false;
    router.push('/listings');
    router.refresh();
  }

  async function markTakenDown() {
    const res = await takeDown.run(
      () => UPDATE_LISTING_AD(listing.id, { status: 'TAKEN_DOWN' }),
      {
        showSuccessToast: true,
        successMessage: t('listings.ad.takenDownSaved'),
      },
    );
    if (res && !isUnauthorized(res) && res.success) setListing(res.data);
  }

  const place = [listing.compound, listing.area, listing.address]
    .filter(Boolean)
    .join(locale === 'ar' ? '، ' : ', ');

  return (
    <div
      className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-6"
      data-testid="listing-detail"
    >
      <div className="grid min-w-0 gap-4">
        <PhotoGallery photos={listing.photos} title={listing.title} />

        {/* The sheet: rounded top rising over the photo on phones, as in the mockup. */}
        <div className="relative -mx-4 -mt-10 grid gap-4 rounded-t-xl bg-background px-4 pt-2 md:mx-0 md:mt-0 md:rounded-none md:bg-transparent md:px-0 md:pt-0">
          <span
            aria-hidden
            className="mx-auto mt-1 h-1.25 w-10 rounded-pill bg-border md:hidden"
          />
          {canManage && takeDownPending(listing) && (
            <div
              role="status"
              data-testid="take-down-banner"
              className="flex flex-wrap items-center gap-3 rounded-lg bg-urgency-soft p-4"
            >
              <BellRing aria-hidden className="size-5 shrink-0 text-warning" />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className="text-sm font-bold">
                  {t('listings.ad.takeDownBanner')}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {t('listings.ad.takeDownBannerBody')}
                </p>
              </div>
              <Button
                variant="inverse"
                size="sm"
                className="h-11"
                disabled={takeDown.pending}
                onClick={() => void markTakenDown()}
              >
                {t('listings.ad.markTakenDown')}
              </Button>
            </div>
          )}

          <div className="grid gap-1">
            <div className="flex items-start justify-between gap-3">
              <BigPrice price={listing.price} purpose={listing.purpose} />
              <StatusMenu
                listing={listing}
                canManage={canManage}
                onUpdated={setListing}
              />
            </div>
            <h1 className="text-[17px] font-bold break-words">
              <UserText>{listing.title}</UserText>
            </h1>
            {place && (
              <p className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
                <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <UserText className="min-w-0 break-words">{place}</UserText>
              </p>
            )}
          </div>

          <ListingFactTiles facts={listing} />

          <div className="grid gap-4 lg:hidden">
            <AdCard
              listing={listing}
              canManage={canManage}
              onUpdated={setListing}
            />
            <OwnerCard listing={listing} />
          </div>

          {listing.description && (
            <section
              aria-labelledby="listing-description"
              className="grid gap-1.5 px-1"
            >
              <h2 id="listing-description" className="text-sm font-bold">
                {t('listings.detail.description')}
              </h2>
              <UserText
                as="p"
                className="text-sm break-words whitespace-pre-line text-muted-foreground"
              >
                {listing.description}
              </UserText>
            </section>
          )}

          <Details listing={listing} />

          {!canManage && (
            <p className="rounded-md bg-secondary px-4 py-3 text-[13px] text-muted-foreground">
              {listing.assignedTo
                ? t('listings.detail.readOnly', {
                    name: listing.assignedTo.name,
                  })
                : t('listings.detail.readOnlyUnassigned')}
            </p>
          )}

          <ListingNotes
            listingId={listing.id}
            notes={listing.notes}
            canManage={canManage}
          />

          {canManage && (
            <PhotoManager
              listingId={listing.id}
              photos={listing.photos}
              onPhotosChange={setPhotos}
            />
          )}

          {(canManage || canDelete) && (
            <div className="flex flex-wrap gap-2">
              {canManage && (
                <Button asChild variant="secondary" className="flex-1">
                  <Link
                    href={`/listings/${listing.id}/edit`}
                    data-testid="edit-listing"
                  >
                    <Pencil aria-hidden />
                    {t('listings.detail.edit')}
                  </Link>
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="destructive-outline"
                  className="flex-1"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 aria-hidden />
                  {t('listings.detail.delete')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <aside className="sticky top-8 hidden gap-4 lg:grid">
        <AdCard
          listing={listing}
          canManage={canManage}
          onUpdated={setListing}
        />
        <OwnerCard listing={listing} />
      </aside>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('listings.detail.deleteTitle')}
        description={t('listings.detail.deleteBody')}
        confirmLabel={t('action.delete')}
        destructive
        onConfirm={remove}
      />
    </div>
  );
}

function Details({ listing }: { listing: Listing }) {
  const { t } = useTranslation();
  const rows = [
    {
      label: t('listings.detail.assignedTo'),
      value: listing.assignedTo?.name ?? t('listings.detail.unassigned'),
      icon: true,
      user: Boolean(listing.assignedTo),
    },
    {
      label: t('listings.purpose.label'),
      value: t(`listings.purpose.${listing.purpose}`),
    },
    listing.furnishing && {
      label: t('listings.detail.furnishing'),
      value: t(`listings.furnishing.${listing.furnishing}`),
    },
    listing.address && {
      label: t('listings.detail.address'),
      value: listing.address,
      user: true,
    },
  ].filter(Boolean) as {
    label: string;
    value: string;
    icon?: boolean;
    user?: boolean;
  }[];

  return (
    <section
      aria-labelledby="listing-details"
      className="rounded-lg bg-card px-4 py-2 shadow-raised"
    >
      <h2 id="listing-details" className="sr-only">
        {t('listings.detail.details')}
      </h2>
      <dl className="grid divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-4 py-2.5 text-[13px]"
          >
            <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
            <dd className="flex min-w-0 items-center gap-1.5 text-end font-bold break-words">
              {row.icon && (
                <UserRound
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              )}
              {row.user ? <UserText>{row.value}</UserText> : row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The mockup's price: big grouped numerals, the currency (and "a month" for rent) small after. */
function BigPrice({ price, purpose }: Pick<Listing, 'price' | 'purpose'>) {
  const { t } = useTranslation();
  const [before, after] = t('money.amount').split('{amount}');
  const unit = [before.trim(), after.trim()].filter(Boolean).join(' ');
  return (
    <p
      className="flex flex-wrap items-baseline gap-x-1.5"
      data-testid="listing-price"
    >
      <bdi className="font-numeric text-[34px] leading-tight font-extrabold tracking-tight tabular-nums">
        {formatNumber(price)}
      </bdi>
      <span className="text-[15px] font-semibold text-muted-foreground">
        {unit}
        {purpose === 'RENT' && ` ${t('listings.detail.perMonth')}`}
      </span>
    </p>
  );
}
