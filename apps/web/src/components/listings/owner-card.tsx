'use client';

import { EyeOff, Phone } from 'lucide-react';
import type { Listing } from '@prime-crm/shared';
import { initialsOf } from '@/components/shell/user-avatar';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatPhone } from './use-mutation';
import { UserText } from '@/components/user-text';

/**
 * Who owns the home. The phone and the Call button show only when the API sent the number (the
 * listing is the reader's, or they manage all listings); otherwise the card says it is hidden and
 * who can see it. The API enforces the rule; this only draws it.
 */
export function OwnerCard({ listing }: { listing: Listing }) {
  const { t } = useTranslation();
  const phone = listing.ownerPhoneHidden ? null : listing.ownerPhone;

  return (
    <section
      aria-label={t('listings.detail.owner')}
      data-testid="owner-card"
      className="grid gap-3 rounded-lg bg-card p-4 shadow-raised"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-pill bg-primary-soft text-sm font-extrabold text-primary-soft-foreground"
        >
          {initialsOf(listing.ownerName)}
        </span>
        <div className="grid min-w-0">
          <span className="text-xs font-semibold text-muted-foreground">
            {t('listings.detail.owner')}
          </span>
          <span className="truncate text-[15px] font-bold">
            <UserText>{listing.ownerName}</UserText>
          </span>
          {phone && (
            <a
              href={`tel:${phone}`}
              dir="ltr"
              className="-my-2.5 flex min-h-11 w-fit items-center font-numeric text-[13px] text-muted-foreground tabular-nums hover:text-foreground md:my-0 md:min-h-0"
              data-testid="owner-phone"
            >
              {formatPhone(phone)}
            </a>
          )}
        </div>
      </div>

      {phone ? (
        <Button asChild size="lg" className="w-full">
          <a href={`tel:${phone}`} data-testid="call-owner">
            <Phone aria-hidden />
            {t('listings.detail.callOwner')}
          </a>
        </Button>
      ) : (
        <p
          className="flex items-start gap-2.5 rounded-md bg-secondary px-3.5 py-3 text-sm"
          data-testid="phone-hidden"
        >
          <EyeOff
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <span className="grid gap-0.5">
            <span className="font-semibold">
              {t('listings.detail.phoneHidden')}
            </span>
            <span className="text-muted-foreground">
              {listing.assignedTo
                ? t('listings.detail.phoneHiddenBody', {
                    name: listing.assignedTo.name,
                  })
                : t('listings.detail.phoneHiddenUnassigned')}
            </span>
          </span>
        </p>
      )}
    </section>
  );
}
