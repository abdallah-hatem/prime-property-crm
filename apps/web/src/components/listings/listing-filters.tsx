'use client';

import {
  AdStatusSchema,
  LISTING_FLOOR_MAX,
  LISTING_FLOOR_MIN,
  LISTING_PRICE_MAX,
  LISTING_SIZE_MAX,
  ListingPurposeSchema,
  ListingSortSchema,
  ListingStatusSchema,
  PropertyTypeSchema,
  type ListingSort,
} from '@prime-crm/shared';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/i18n-provider';
import { AreaCombobox } from './area-combobox';
import { ChoiceChips } from './choice-chips';
import type { ListingFilters, RangeKey } from './filters-url';
import { NumberInput } from './number-input';

const ROOM_STEPS = ['1', '2', '3', '4', '5'] as const;
type RoomChoice = 'any' | (typeof ROOM_STEPS)[number];

/** Clamp a typed value into the API's range, so the URL never holds a value it would refuse. */
const clamp = (value: number | null, min: number, max: number) =>
  value === null ? null : Math.min(max, Math.max(min, value));

/**
 * Every listing filter, editing a draft. The search screen shows it in a bottom sheet on phones
 * and tablets and in a side panel on wide screens; both apply the draft with one button, which
 * stays blocked while a minimum is above its maximum.
 */
export function ListingFiltersForm({
  value,
  onChange,
  invalid,
}: {
  value: ListingFilters;
  onChange: (next: ListingFilters) => void;
  invalid: readonly RangeKey[];
}) {
  const { t } = useTranslation();
  const set = <K extends keyof ListingFilters>(
    key: K,
    next: ListingFilters[K],
  ) => onChange({ ...value, [key]: next });

  const roomOptions = [
    { value: 'any' as RoomChoice, label: t('listings.filter.any') },
    ...ROOM_STEPS.map((n) => ({
      value: n as RoomChoice,
      label: t('listings.filter.orMore', { count: n }),
    })),
  ];
  const roomValue = (n: number | null): RoomChoice =>
    n === null ? 'any' : ((String(Math.min(n, 5)) as RoomChoice) ?? 'any');
  const roomNumber = (choice: RoomChoice) =>
    choice === 'any' ? null : Number(choice);

  return (
    <div className="grid gap-6" data-testid="listing-filters">
      <Section title={t('listings.purpose.label')}>
        <ChoiceChips
          label={t('listings.purpose.label')}
          value={value.purpose ?? 'ANY'}
          options={[
            { value: 'ANY', label: t('listings.purpose.any') },
            ...ListingPurposeSchema.options.map((p) => ({
              value: p,
              label: t(`listings.purpose.${p}`),
            })),
          ]}
          onChange={(next) => set('purpose', next === 'ANY' ? null : next)}
        />
      </Section>

      <Section title={t('listings.type.label')}>
        <ChoiceChips
          multiple
          label={t('listings.type.label')}
          value={value.type}
          options={PropertyTypeSchema.options.map((type) => ({
            value: type,
            label: t(`listings.type.${type}`),
          }))}
          onChange={(next) => set('type', next)}
        />
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="type-label">{t('listings.filter.area')}</span>
          <AreaCombobox
            value={value.area}
            onChange={(area) => set('area', area)}
            placeholder={t('listings.filter.areaPlaceholder')}
          />
        </label>
        <label className="grid gap-2">
          <span className="type-label">{t('listings.filter.compound')}</span>
          <Input
            value={value.compound}
            onChange={(event) => set('compound', event.target.value)}
            placeholder={t('listings.filter.compoundPlaceholder')}
          />
        </label>
      </div>

      <RangeField
        title={t('listings.filter.price')}
        testId="range-price"
        min={value.priceMin}
        max={value.priceMax}
        minPlaceholder={t('listings.filter.minPricePlaceholder')}
        maxPlaceholder={t('listings.filter.maxPricePlaceholder')}
        invalid={invalid.includes('price')}
        onMin={(n) => set('priceMin', clamp(n, 0, LISTING_PRICE_MAX))}
        onMax={(n) => set('priceMax', clamp(n, 0, LISTING_PRICE_MAX))}
      />
      <RangeField
        title={t('listings.filter.size')}
        testId="range-size"
        min={value.sizeMin}
        max={value.sizeMax}
        minPlaceholder={t('listings.filter.minSizePlaceholder')}
        maxPlaceholder={t('listings.filter.maxSizePlaceholder')}
        invalid={invalid.includes('size')}
        onMin={(n) => set('sizeMin', clamp(n, 0, LISTING_SIZE_MAX))}
        onMax={(n) => set('sizeMax', clamp(n, 0, LISTING_SIZE_MAX))}
      />

      <Section title={t('listings.filter.bedroomsMin')}>
        <ChoiceChips
          label={t('listings.filter.bedroomsMin')}
          value={roomValue(value.bedroomsMin)}
          options={roomOptions}
          onChange={(next) => set('bedroomsMin', roomNumber(next))}
        />
      </Section>
      <Section title={t('listings.filter.bathroomsMin')}>
        <ChoiceChips
          label={t('listings.filter.bathroomsMin')}
          value={roomValue(value.bathroomsMin)}
          options={roomOptions}
          onChange={(next) => set('bathroomsMin', roomNumber(next))}
        />
      </Section>

      <RangeField
        title={t('listings.filter.floor')}
        testId="range-floor"
        allowNegative
        min={value.floorMin}
        max={value.floorMax}
        minPlaceholder={t('listings.filter.minFloorPlaceholder')}
        maxPlaceholder={t('listings.filter.maxFloorPlaceholder')}
        invalid={invalid.includes('floor')}
        onMin={(n) =>
          set('floorMin', clamp(n, LISTING_FLOOR_MIN, LISTING_FLOOR_MAX))
        }
        onMax={(n) =>
          set('floorMax', clamp(n, LISTING_FLOOR_MIN, LISTING_FLOOR_MAX))
        }
      />

      <Section title={t('listings.filter.status')}>
        <ChoiceChips
          multiple
          label={t('listings.filter.status')}
          value={value.status.length ? value.status : ['AVAILABLE']}
          options={ListingStatusSchema.options.map((status) => ({
            value: status,
            label: t(`listingStatus.${status}`),
          }))}
          onChange={(next) => set('status', next)}
        />
      </Section>

      <Section title={t('listings.filter.adStatus')}>
        <ChoiceChips
          label={t('listings.filter.adStatus')}
          value={value.adStatus ?? 'ANY'}
          options={[
            { value: 'ANY', label: t('listings.filter.any') },
            ...AdStatusSchema.options.map((status) => ({
              value: status,
              label: t(`adStatus.${status}`),
            })),
          ]}
          onChange={(next) => set('adStatus', next === 'ANY' ? null : next)}
        />
        <ChoiceChips
          multiple
          label={t('listings.filter.checkInDue')}
          value={value.checkInDue ? ['due'] : []}
          options={[{ value: 'due', label: t('listings.filter.checkInDue') }]}
          onChange={(next) => set('checkInDue', next.length > 0)}
        />
        <p className="text-xs text-muted-foreground">
          {t('listings.filter.checkInDueHint')}
        </p>
      </Section>

      <Section title={t('listings.filter.sort')}>
        <ChoiceChips
          label={t('listings.filter.sort')}
          value={value.sort ?? 'newest'}
          options={ListingSortSchema.options.map((sort) => ({
            value: sort,
            label: t(`listings.sort.${sort}`),
          }))}
          onChange={(next: ListingSort) =>
            set('sort', next === 'newest' ? null : next)
          }
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="grid min-w-0 gap-2.5">
      <legend className="mb-2.5 type-label">{title}</legend>
      {children}
    </fieldset>
  );
}

function RangeField({
  title,
  testId,
  min,
  max,
  minPlaceholder,
  maxPlaceholder,
  invalid,
  allowNegative,
  onMin,
  onMax,
}: {
  title: string;
  testId: string;
  min: number | null;
  max: number | null;
  minPlaceholder: string;
  maxPlaceholder: string;
  invalid: boolean;
  allowNegative?: boolean;
  onMin: (value: number | null) => void;
  onMax: (value: number | null) => void;
}) {
  const { t } = useTranslation();
  const errorId = `${testId}-error`;
  const shared = {
    allowNegative,
    'aria-invalid': invalid ? (true as const) : undefined,
    'aria-describedby': invalid ? errorId : undefined,
  };
  return (
    <fieldset className="grid min-w-0 gap-2" data-testid={testId}>
      <legend className="mb-2 type-label">{title}</legend>
      <div className="grid grid-cols-2 gap-3">
        <NumberInput
          {...shared}
          aria-label={`${title} — ${t('listings.filter.min')}`}
          placeholder={minPlaceholder}
          value={min}
          onChange={onMin}
        />
        <NumberInput
          {...shared}
          aria-label={`${title} — ${t('listings.filter.max')}`}
          placeholder={maxPlaceholder}
          value={max}
          onChange={onMax}
        />
      </div>
      {invalid && (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-semibold text-destructive"
        >
          {t('listings.filter.minAboveMax')}
        </p>
      )}
    </fieldset>
  );
}
