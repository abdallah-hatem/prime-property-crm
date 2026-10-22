'use client';

import type { VariantProps } from 'class-variance-authority';
import type { AdStatus, LeadStatus, ListingStatus } from '@prime-crm/shared';
import { Badge, type badgeVariants } from '@/components/ui/badge';
import { useTranslation } from '@/i18n/i18n-provider';

type Variant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
interface ChipStyle {
  variant: Variant;
  live?: boolean;
}

/**
 * Colour by meaning (docs/DESIGN.md): success = interested / available / ad live, warning = call
 * back, primary = new or listed, neutral for everything settled. Red is never a status colour.
 */
const LEAD: Record<LeadStatus, ChipStyle> = {
  NEW: { variant: 'primary' },
  CONTACTED: { variant: 'neutral' },
  INTERESTED: { variant: 'success' },
  NOT_INTERESTED: { variant: 'neutral' },
  CALL_BACK: { variant: 'warning' },
  LISTED: { variant: 'primary' },
  DO_NOT_CALL: { variant: 'neutral' },
};
const LISTING: Record<ListingStatus, ChipStyle> = {
  AVAILABLE: { variant: 'success' },
  SOLD: { variant: 'neutral' },
  RENTED: { variant: 'neutral' },
  OFF_MARKET: { variant: 'neutral' },
};
const AD: Record<AdStatus, ChipStyle> = {
  NOT_POSTED: { variant: 'neutral' },
  LIVE: { variant: 'success', live: true },
  TAKEN_DOWN: { variant: 'neutral' },
};

export type StatusChipProps =
  | { kind: 'lead'; status: LeadStatus; className?: string }
  | { kind: 'listing'; status: ListingStatus; className?: string }
  | { kind: 'ad'; status: AdStatus; className?: string };

/** The translated, colour-coded chip for a lead, listing or Property Finder ad status. */
export function StatusChip(props: StatusChipProps) {
  const { t } = useTranslation();
  const { style, label } =
    props.kind === 'lead'
      ? { style: LEAD[props.status], label: t(`leadStatus.${props.status}`) }
      : props.kind === 'listing'
        ? {
            style: LISTING[props.status],
            label: t(`listingStatus.${props.status}`),
          }
        : { style: AD[props.status], label: t(`adStatus.${props.status}`) };
  return (
    <Badge
      variant={style.variant}
      dot={style.live ? 'live' : 'static'}
      data-status={props.status}
      className={props.className}
    >
      {label}
    </Badge>
  );
}
