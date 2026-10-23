'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, LoaderCircle, MapPin } from 'lucide-react';
import { z } from 'zod';
import {
  ADDRESS_MAX_LENGTH,
  AREA_MAX_LENGTH,
  COMPOUND_MAX_LENGTH,
  FurnishingSchema,
  LISTING_DESCRIPTION_MAX_LENGTH,
  LISTING_FLOOR_MAX,
  LISTING_FLOOR_MIN,
  LISTING_PRICE_MAX,
  LISTING_PRICE_MIN,
  LISTING_ROOMS_MAX,
  LISTING_SIZE_MAX,
  LISTING_SIZE_MIN,
  ListingPurposeSchema,
  OWNER_NAME_MAX_LENGTH,
  PropertyTypeSchema,
  type CreateListingRequest,
  type Listing,
  type Owner,
  type UpdateListingRequest,
} from '@prime-crm/shared';
import { CREATE_LISTING, UPDATE_LISTING } from '@/apis';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { PhoneInput } from '@/components/phone-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/i18n-provider';
import type { Translate } from '@/i18n/translate';
import { isUnauthorized } from '@/lib/api-result';
import { EG_MOBILE, normalizeEgyptianMobileInput } from '@/lib/phone-input';
import { AreaCombobox } from './area-combobox';
import { ChoiceChips } from '@/components/choice-chips';
import { listingErrorMessage } from './listing-error';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { useMutation } from './use-mutation';

/** False on the server and until hydration: a submit before then would be a native GET. */
const noop = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

const PHONE_CODES = new Set([
  'PHONE_IN_LISTING',
  'PHONE_IN_TRASH',
  'PHONE_EXISTS',
]);

function formSchema(t: Translate, withOwner: boolean) {
  const required = t('listings.form.required');
  const text = (max: number, isRequired: boolean) =>
    z
      .string()
      .trim()
      .max(max, t('listings.form.tooLong', { max }))
      .refine((value) => !isRequired || value.length > 0, required);
  const int = (
    min: number,
    max: number,
    message: string,
    isRequired: boolean,
  ) =>
    z
      .number()
      .int(message)
      .min(min, message)
      .max(max, message)
      .nullable()
      .refine((value) => !isRequired || value !== null, required);

  return z.object({
    ownerName: text(OWNER_NAME_MAX_LENGTH, withOwner),
    ownerPhone: z
      .string()
      .refine((value) => !withOwner || value.length > 0, required)
      .refine(
        (value) => !withOwner || value.length === 0 || EG_MOBILE.test(value),
        t('form.phoneInvalid'),
      ),
    purpose: ListingPurposeSchema.nullable().refine(
      (v) => v !== null,
      required,
    ),
    type: PropertyTypeSchema.nullable().refine((v) => v !== null, required),
    area: text(AREA_MAX_LENGTH, true),
    compound: text(COMPOUND_MAX_LENGTH, false),
    address: text(ADDRESS_MAX_LENGTH, false),
    sizeSqm: int(
      LISTING_SIZE_MIN,
      LISTING_SIZE_MAX,
      t('listings.form.sizeRange'),
      true,
    ),
    floor: int(
      LISTING_FLOOR_MIN,
      LISTING_FLOOR_MAX,
      t('listings.form.floorRange'),
      false,
    ),
    bedrooms: int(0, LISTING_ROOMS_MAX, t('listings.form.roomsRange'), false),
    bathrooms: int(0, LISTING_ROOMS_MAX, t('listings.form.roomsRange'), false),
    price: int(
      LISTING_PRICE_MIN,
      LISTING_PRICE_MAX,
      t('listings.form.priceRange'),
      true,
    ),
    furnishing: FurnishingSchema.nullable(),
    description: text(LISTING_DESCRIPTION_MAX_LENGTH, false),
  });
}
type Values = z.input<ReturnType<typeof formSchema>>;

export type ListingFormMode =
  { kind: 'create'; owner: Owner | null } | { kind: 'edit'; listing: Listing };

function initialValues(mode: ListingFormMode): Values {
  if (mode.kind === 'edit') {
    const l = mode.listing;
    return {
      ownerName: l.ownerName,
      ownerPhone: l.ownerPhone
        ? normalizeEgyptianMobileInput(l.ownerPhone)
        : '',
      purpose: l.purpose,
      type: l.type,
      area: l.area,
      compound: l.compound ?? '',
      address: l.address ?? '',
      sizeSqm: l.sizeSqm,
      floor: l.floor,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      price: l.price,
      furnishing: l.furnishing,
      description: l.description ?? '',
    };
  }
  return {
    ownerName: '',
    ownerPhone: '',
    purpose: null,
    type: null,
    area: mode.owner?.area ?? '',
    compound: '',
    address: '',
    sizeSqm: null,
    floor: null,
    bedrooms: null,
    bathrooms: null,
    price: null,
    furnishing: null,
    description: '',
  };
}

const orUndefined = <T,>(value: T | null | '') =>
  value === null || value === '' ? undefined : value;
const orNull = <T,>(value: T | null | '') =>
  value === null || value === '' ? null : value;

/**
 * Create (from an owner, or directly with the owner's name and phone) or edit a listing. Rules
 * mirror the contract (whole price 1 – 1,000,000,000 shown grouped, size above 0, rooms 0 – 50,
 * floors −10 – 200); the API's conflicts come back on the field they belong to (phone) or at the
 * top (owner already listed). One request per submit.
 */
export function ListingForm({ mode }: { mode: ListingFormMode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const withOwnerFields =
    mode.kind === 'edit' ? !mode.listing.ownerPhoneHidden : mode.owner === null;
  const schema = useMemo(
    () => formSchema(t, withOwnerFields),
    [t, withOwnerFields],
  );
  const [initial] = useState(() => initialValues(mode));
  const [serverError, setServerError] = useState<string | null>(null);
  const [compounds, setCompounds] = useState<string[]>([]);
  const { run, pending } = useMutation();
  const [leaving, setLeaving] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  });

  const purpose = useWatch({ control, name: 'purpose' });
  const hydrated = useHydrated();
  const busy = pending || leaving;

  async function onSubmit(values: Values) {
    setServerError(null);
    const fields = {
      purpose: values.purpose!,
      type: values.type!,
      area: values.area.trim(),
      sizeSqm: values.sizeSqm!,
      price: values.price!,
    };

    let request;
    if (mode.kind === 'create') {
      const body: CreateListingRequest = {
        ...fields,
        ...(mode.owner
          ? { ownerId: mode.owner.id }
          : {
              ownerName: values.ownerName.trim(),
              ownerPhone: values.ownerPhone,
            }),
        compound: orUndefined(values.compound.trim()),
        address: orUndefined(values.address.trim()),
        floor: orUndefined(values.floor),
        bedrooms: orUndefined(values.bedrooms),
        bathrooms: orUndefined(values.bathrooms),
        furnishing: orUndefined(values.furnishing),
        description: orUndefined(values.description.trim()),
      };
      request = () => CREATE_LISTING(body);
    } else {
      const before = initial;
      const body: UpdateListingRequest = {
        ...fields,
        compound: orNull(values.compound.trim()),
        address: orNull(values.address.trim()),
        floor: orNull(values.floor),
        bedrooms: orNull(values.bedrooms),
        bathrooms: orNull(values.bathrooms),
        furnishing: orNull(values.furnishing),
        description: orNull(values.description.trim()),
      };
      if (withOwnerFields && values.ownerName.trim() !== before.ownerName)
        body.ownerName = values.ownerName.trim();
      if (withOwnerFields && values.ownerPhone !== before.ownerPhone)
        body.ownerPhone = values.ownerPhone;
      const id = mode.listing.id;
      request = () => UPDATE_LISTING(id, body);
    }

    const res = await run(request, {
      showErrorToast: false,
      showSuccessToast: true,
      successMessage:
        mode.kind === 'create'
          ? t('listings.form.created')
          : t('listings.form.saved'),
    });
    if (!res || isUnauthorized(res)) return;
    if (!res.success) {
      const message = listingErrorMessage(t, res);
      if (res.error && PHONE_CODES.has(res.error) && withOwnerFields)
        setError('ownerPhone', { message }, { shouldFocus: true });
      else setServerError(message);
      return;
    }
    setLeaving(true);
    router.push(`/listings/${res.data.id}`);
    router.refresh();
  }

  const title =
    mode.kind === 'create'
      ? t('listings.form.newTitle')
      : t('listings.form.editTitle');
  const cancelHref =
    mode.kind === 'edit' ? `/listings/${mode.listing.id}` : '/listings';

  return (
    <form
      noValidate
      aria-busy={busy || undefined}
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-5"
      data-testid="listing-form"
    >
      <PageHeader title={title} />

      {serverError && (
        <p
          role="alert"
          data-testid="form-error"
          className="flex items-start gap-2 rounded-md bg-destructive-soft px-3.5 py-3 text-sm font-semibold text-destructive"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {serverError}
        </p>
      )}

      <Card title={t('listings.form.ownerSection')}>
        {mode.kind === 'create' && mode.owner ? (
          <div
            className="flex items-center gap-3 rounded-md bg-secondary px-4 py-3"
            data-testid="source-owner"
          >
            <span className="grid min-w-0 gap-0.5">
              <span className="text-xs font-semibold text-muted-foreground">
                {t('listings.form.fromOwner')}
              </span>
              <span className="truncate font-bold">{mode.owner.name}</span>
              {mode.owner.area && (
                <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
                  <MapPin aria-hidden className="size-3.5" />
                  {mode.owner.area}
                </span>
              )}
            </span>
          </div>
        ) : withOwnerFields ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('listings.form.ownerName')}
              required
              error={errors.ownerName?.message}
            >
              {(field) => (
                <Input
                  {...field}
                  {...register('ownerName')}
                  autoComplete="off"
                  placeholder={t('listings.form.ownerNamePlaceholder')}
                  data-testid="owner-name"
                />
              )}
            </FormField>
            <FormField
              label={t('listings.form.ownerPhone')}
              required
              error={errors.ownerPhone?.message}
            >
              {(field) => (
                <Controller
                  control={control}
                  name="ownerPhone"
                  render={({ field: f }) => (
                    <PhoneInput
                      {...field}
                      name={f.name}
                      ref={f.ref}
                      value={f.value}
                      onChange={f.onChange}
                      onBlur={f.onBlur}
                      data-testid="owner-phone-input"
                    />
                  )}
                />
              )}
            </FormField>
          </div>
        ) : (
          <p className="font-bold">
            {mode.kind === 'edit' ? mode.listing.ownerName : ''}
          </p>
        )}
      </Card>

      <Card title={t('listings.form.propertySection')}>
        <FormField
          label={t('listings.purpose.label')}
          required
          error={errors.purpose?.message}
        >
          {(field) => (
            <Controller
              control={control}
              name="purpose"
              render={({ field: f }) => (
                <ChoiceChips
                  {...field}
                  label={t('listings.purpose.label')}
                  value={f.value}
                  onChange={f.onChange}
                  options={ListingPurposeSchema.options.map((p) => ({
                    value: p,
                    label: t(`listings.purpose.${p}`),
                  }))}
                />
              )}
            />
          )}
        </FormField>
        <FormField
          label={t('listings.type.label')}
          required
          error={errors.type?.message}
        >
          {(field) => (
            <Controller
              control={control}
              name="type"
              render={({ field: f }) => (
                <ChoiceChips
                  {...field}
                  label={t('listings.type.label')}
                  value={f.value}
                  onChange={f.onChange}
                  options={PropertyTypeSchema.options.map((type) => ({
                    value: type,
                    label: t(`listings.type.${type}`),
                  }))}
                />
              )}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t('listings.form.area')}
            required
            error={errors.area?.message}
          >
            {(field) => (
              <Controller
                control={control}
                name="area"
                render={({ field: f }) => (
                  <AreaCombobox
                    {...field}
                    value={f.value}
                    onChange={f.onChange}
                    onPick={(option) => setCompounds(option.compounds)}
                    placeholder={t('listings.form.areaPlaceholder')}
                  />
                )}
              />
            )}
          </FormField>
          <FormField
            label={t('listings.form.compound')}
            error={errors.compound?.message}
          >
            {(field) => (
              <Controller
                control={control}
                name="compound"
                render={({ field: f }) => (
                  <div className="grid gap-2">
                    <Input
                      {...field}
                      name={f.name}
                      ref={f.ref}
                      value={f.value}
                      onBlur={f.onBlur}
                      onChange={f.onChange}
                      autoComplete="off"
                      placeholder={t('listings.form.compoundPlaceholder')}
                    />
                    {compounds.length > 0 && (
                      <ChoiceChips
                        label={t('listings.lookup.suggestions')}
                        value={compounds.includes(f.value) ? f.value : null}
                        onChange={f.onChange}
                        options={compounds
                          .slice(0, 8)
                          .map((c) => ({ value: c, label: c }))}
                      />
                    )}
                  </div>
                )}
              />
            )}
          </FormField>
        </div>
        <FormField
          label={t('listings.form.address')}
          error={errors.address?.message}
        >
          {(field) => (
            <Input
              {...field}
              {...register('address')}
              autoComplete="off"
              placeholder={t('listings.form.addressPlaceholder')}
            />
          )}
        </FormField>
      </Card>

      <Card title={t('listings.form.detailsSection')}>
        <NumberField
          control={control}
          name="price"
          label={t('listings.form.price')}
          placeholder={t('listings.form.pricePlaceholder')}
          hint={
            purpose === 'RENT' ? t('listings.form.priceHintRent') : undefined
          }
          required
          error={errors.price?.message}
          testId="price-input"
        />
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            control={control}
            name="sizeSqm"
            label={t('listings.form.size')}
            placeholder={t('listings.form.sizePlaceholder')}
            required
            error={errors.sizeSqm?.message}
            testId="size-input"
          />
          <NumberField
            control={control}
            name="floor"
            label={t('listings.form.floor')}
            placeholder={t('listings.form.floorPlaceholder')}
            hint={t('listings.form.floorHint')}
            allowNegative
            error={errors.floor?.message}
          />
          <NumberField
            control={control}
            name="bedrooms"
            label={t('listings.form.bedrooms')}
            placeholder={t('listings.form.bedroomsPlaceholder')}
            error={errors.bedrooms?.message}
          />
          <NumberField
            control={control}
            name="bathrooms"
            label={t('listings.form.bathrooms')}
            placeholder={t('listings.form.bathroomsPlaceholder')}
            error={errors.bathrooms?.message}
          />
        </div>
        <FormField
          label={t('listings.furnishing.label')}
          error={errors.furnishing?.message}
        >
          {(field) => (
            <Controller
              control={control}
              name="furnishing"
              render={({ field: f }) => (
                <ChoiceChips
                  {...field}
                  label={t('listings.furnishing.label')}
                  value={f.value ?? 'NONE'}
                  onChange={(next) => f.onChange(next === 'NONE' ? null : next)}
                  options={[
                    { value: 'NONE', label: t('listings.furnishing.none') },
                    ...FurnishingSchema.options.map((value) => ({
                      value,
                      label: t(`listings.furnishing.${value}`),
                    })),
                  ]}
                />
              )}
            />
          )}
        </FormField>
        <FormField
          label={t('listings.form.description')}
          error={errors.description?.message}
        >
          {(field) => (
            <Controller
              control={control}
              name="description"
              render={({ field: f }) => (
                <Textarea
                  showCount
                  {...field}
                  name={f.name}
                  ref={f.ref}
                  value={f.value}
                  onBlur={f.onBlur}
                  onChange={f.onChange}
                  maxLength={LISTING_DESCRIPTION_MAX_LENGTH}
                  placeholder={t('listings.form.descriptionPlaceholder')}
                />
              )}
            />
          )}
        </FormField>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="secondary" size="lg">
          <Link href={cancelHref}>{t('action.cancel')}</Link>
        </Button>
        <Button
          type="submit"
          size="lg"
          disabled={busy || !hydrated}
          data-testid="listing-submit"
        >
          {busy && <LoaderCircle aria-hidden className="animate-spin" />}
          {mode.kind === 'create'
            ? busy
              ? t('listings.form.creating')
              : t('listings.form.create')
            : busy
              ? t('listings.form.saving')
              : t('listings.form.save')}
        </Button>
      </div>
    </form>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-lg bg-card p-5 shadow-raised">
      <h2 className="type-h2">{title}</h2>
      {children}
    </section>
  );
}

type NumberName = 'price' | 'sizeSqm' | 'floor' | 'bedrooms' | 'bathrooms';

function NumberField({
  control,
  name,
  label,
  placeholder,
  hint,
  required,
  error,
  allowNegative,
  testId,
}: {
  control: ReturnType<typeof useForm<Values>>['control'];
  name: NumberName;
  label: string;
  placeholder: string;
  hint?: string;
  required?: boolean;
  error?: string;
  allowNegative?: boolean;
  testId?: string;
}) {
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      {(field) => (
        <Controller
          control={control}
          name={name}
          render={({ field: f }) => (
            <NumberInput
              {...field}
              name={f.name}
              ref={f.ref}
              value={f.value ?? null}
              onBlur={f.onBlur}
              onChange={f.onChange}
              allowNegative={allowNegative}
              placeholder={placeholder}
              data-testid={testId}
            />
          )}
        />
      )}
    </FormField>
  );
}
