'use client';

import { Bath, BedDouble, Ruler } from 'lucide-react';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Facts {
  bedrooms: number | null;
  bathrooms: number | null;
  sizeSqm: number;
  floor?: number | null;
}

/** Beds · baths · m² in one line (search rows and cards). Missing counts are left out. */
export function ListingFactsLine({
  facts,
  className,
}: {
  facts: Facts;
  className?: string;
}) {
  const { t } = useTranslation();
  const items = [
    facts.bedrooms !== null && {
      icon: BedDouble,
      text: t('listings.facts.bedsShort', { count: facts.bedrooms }),
    },
    facts.bathrooms !== null && {
      icon: Bath,
      text: t('listings.facts.bathsShort', { count: facts.bathrooms }),
    },
    {
      icon: Ruler,
      text: t('listings.facts.sqmShort', {
        count: formatNumber(facts.sizeSqm),
      }),
    },
  ].filter(Boolean) as { icon: typeof Ruler; text: string }[];

  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-muted-foreground',
        className,
      )}
    >
      {items.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-1.5 whitespace-nowrap">
          <Icon aria-hidden className="size-4 shrink-0" />
          <bdi className="font-numeric tabular-nums">{text}</bdi>
        </li>
      ))}
    </ul>
  );
}

/** The four fact tiles under the price (detail page): beds, baths, m², floor. */
export function ListingFactTiles({ facts }: { facts: Facts }) {
  const { t } = useTranslation();
  const dash = '–';
  const floorText =
    facts.floor === null || facts.floor === undefined
      ? dash
      : facts.floor === 0
        ? t('listings.facts.ground')
        : String(facts.floor);
  const tiles = [
    { value: facts.bedrooms ?? dash, label: t('listings.facts.beds') },
    { value: facts.bathrooms ?? dash, label: t('listings.facts.baths') },
    { value: formatNumber(facts.sizeSqm), label: t('listings.facts.sqm') },
    { value: floorText, label: t('listings.facts.floor') },
  ];
  return (
    <dl className="grid grid-cols-4 gap-2" data-testid="listing-facts">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="grid min-w-0 gap-0.5 rounded-md bg-card px-2.5 py-3 shadow-soft"
        >
          <dt className="order-2 truncate text-[11px] font-semibold text-muted-foreground">
            {tile.label}
          </dt>
          <dd className="order-1 truncate font-numeric text-xl font-extrabold tabular-nums">
            {tile.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
