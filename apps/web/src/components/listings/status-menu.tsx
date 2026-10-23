'use client';

import { useState } from 'react';
import { Check, ChevronDown, LoaderCircle } from 'lucide-react';
import {
  ListingStatusSchema,
  type Listing,
  type ListingStatus,
} from '@prime-crm/shared';
import { SET_LISTING_STATUS } from '@/apis';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusChip } from '@/components/status-chip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { cn } from '@/lib/utils';
import { useMutation } from './use-mutation';

/**
 * The listing's status chip; for its member (or a manager) it opens a menu to change it. Leaving
 * Available while the ad is live asks first, since that opens a take-down task.
 */
export function StatusMenu({
  listing,
  canManage,
  onUpdated,
}: {
  listing: Listing;
  canManage: boolean;
  onUpdated: (listing: Listing) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmFor, setConfirmFor] = useState<ListingStatus | null>(null);
  const { run, pending } = useMutation();

  if (!canManage) return <StatusChip kind="listing" status={listing.status} />;

  async function change(status: ListingStatus) {
    const res = await run(() => SET_LISTING_STATUS(listing.id, { status }), {
      showSuccessToast: true,
      successMessage: t('listings.detail.statusSaved'),
    });
    if (res && !isUnauthorized(res) && res.success) onUpdated(res.data);
  }

  function choose(status: ListingStatus) {
    setOpen(false);
    if (status === listing.status) return;
    const opensTakeDown =
      listing.ad.status === 'LIVE' && listing.status === 'AVAILABLE';
    if (opensTakeDown) setConfirmFor(status);
    else void change(status);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={pending}
          aria-label={t('listings.detail.changeStatus')}
          data-testid="status-menu"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-pill outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
        >
          <StatusChip kind="listing" status={listing.status} />
          {pending ? (
            <LoaderCircle
              aria-hidden
              className="size-4 animate-spin text-muted-foreground"
            />
          ) : (
            <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
          )}
        </PopoverTrigger>
        <PopoverContent className="w-60 p-1.5" align="end">
          <div
            role="menu"
            aria-label={t('listings.detail.changeStatus')}
            className="grid"
          >
            {ListingStatusSchema.options.map((status) => (
              <button
                key={status}
                type="button"
                role="menuitemradio"
                aria-checked={status === listing.status}
                onClick={() => choose(status)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm px-3 text-start text-sm font-semibold',
                  'transition-colors duration-150 hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {t(`listingStatus.${status}`)}
                {status === listing.status && (
                  <Check aria-hidden className="size-4 text-link" />
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={confirmFor !== null}
        onOpenChange={(next) => !next && setConfirmFor(null)}
        title={t('listings.detail.statusTakeDownTitle')}
        description={t('listings.detail.statusTakeDownBody')}
        confirmLabel={
          confirmFor ? t(`listingStatus.${confirmFor}`) : t('dialog.confirm')
        }
        onConfirm={() => (confirmFor ? change(confirmFor) : undefined)}
      />
    </>
  );
}
