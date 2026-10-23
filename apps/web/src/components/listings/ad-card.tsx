'use client';

import { useState } from 'react';
import { CircleAlert, ExternalLink, LoaderCircle } from 'lucide-react';
import {
  AdLinkSchema,
  NOTE_BODY_MAX_LENGTH,
  type Listing,
} from '@prime-crm/shared';
import { LOG_LISTING_CHECK_IN, UPDATE_LISTING_AD } from '@/apis';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DateText } from '@/components/date-text';
import { FormField } from '@/components/form-field';
import { StatusChip } from '@/components/status-chip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { listingErrorMessage } from './listing-error';
import { Textarea } from '@/components/ui/textarea';
import { useMutation } from './use-mutation';

type Props = {
  listing: Listing;
  canManage: boolean;
  onUpdated: (listing: Listing) => void;
};

/**
 * The listing has an open "Take down the ad" task (the API's `adTakeDownOpen`): its ad was Live
 * when it left Available, and nobody has marked the ad Taken down yet.
 */
export const takeDownPending = (listing: Listing) => listing.adTakeDownOpen;

/**
 * The Property Finder ad: its status, link, when it was posted and the check-in rhythm, with the
 * actions the listing's member (or a manager) takes — set it live with a link, log a check-in,
 * mark it taken down. Everyone else sees the facts and the link.
 */
export function AdCard({ listing, canManage, onUpdated }: Props) {
  const { t } = useTranslation();
  const { ad } = listing;
  const [liveOpen, setLiveOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [takeDownOpen, setTakeDownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { run } = useMutation();

  const live = ad.status === 'LIVE';
  const available = listing.status === 'AVAILABLE';
  const now = new Date();
  const todayKey = formatDate(now, 'en');
  const nextDue =
    ad.nextCheckInAt !== null &&
    (new Date(ad.nextCheckInAt) <= now ||
      formatDate(ad.nextCheckInAt, 'en') === todayKey);

  async function takeDown() {
    setError(null);
    const res = await run(
      () => UPDATE_LISTING_AD(listing.id, { status: 'TAKEN_DOWN' }),
      {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('listings.ad.takenDownSaved'),
      },
    );
    if (!res || isUnauthorized(res)) return false;
    if (!res.success) {
      setError(listingErrorMessage(t, res));
      return true;
    }
    onUpdated(res.data);
  }

  return (
    <section
      aria-labelledby="ad-card-title"
      data-testid="ad-card"
      className="relative overflow-hidden rounded-lg bg-card ps-1.5 shadow-raised"
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-4 start-2.5 w-1.25 rounded-pill',
          live ? 'bg-success' : 'bg-border',
        )}
      />
      <h2
        id="ad-card-title"
        className="flex items-center justify-between gap-3 ps-4.5 pe-4 pt-3.5 pb-2.5 text-sm font-bold"
      >
        {t('listings.ad.title')}
        <StatusChip kind="ad" status={ad.status} />
      </h2>

      {ad.status === 'NOT_POSTED' && (
        <p className="ps-4.5 pe-4 pb-2 text-sm text-muted-foreground">
          {t('listings.ad.notPostedBody')}
        </p>
      )}

      {ad.status !== 'NOT_POSTED' && (
        <dl className="grid text-[13px]">
          <Row label={t('listings.ad.posted')}>
            {ad.postedAt ? (
              <DateText value={ad.postedAt} />
            ) : (
              t('listings.ad.never')
            )}
          </Row>
          {live && (
            <>
              <Row label={t('listings.ad.lastCheckIn')}>
                {ad.lastCheckInAt ? (
                  <DateText value={ad.lastCheckInAt} />
                ) : (
                  t('listings.ad.never')
                )}
              </Row>
              {ad.nextCheckInAt && (
                <Row
                  label={t('listings.ad.nextCheckIn')}
                  highlight={nextDue}
                  testId="next-check-in"
                >
                  {formatDate(ad.nextCheckInAt, 'en') === todayKey ? (
                    t('listings.ad.today')
                  ) : (
                    <DateText value={ad.nextCheckInAt} />
                  )}
                </Row>
              )}
            </>
          )}
          {ad.status === 'TAKEN_DOWN' && ad.takenDownAt && (
            <Row label={t('listings.ad.takenDown')}>
              <DateText value={ad.takenDownAt} />
            </Row>
          )}
        </dl>
      )}
      {ad.status === 'TAKEN_DOWN' && (
        <p className="ps-4.5 pe-4 pt-1 text-sm text-muted-foreground">
          {t('listings.ad.takenDownBody')}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mx-3 mt-2 flex items-start gap-2 rounded-sm bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 ps-4 pe-3.5 pt-3 pb-3.5">
        {canManage && live && available && (
          <Button
            variant="soft"
            className="min-w-36 flex-1"
            onClick={() => setCheckInOpen(true)}
            data-testid="log-check-in"
          >
            {t('listings.ad.logCheckIn')}
          </Button>
        )}
        {canManage && live && !available && (
          <Button
            variant="soft"
            className="min-w-36 flex-1"
            onClick={() => setTakeDownOpen(true)}
          >
            {t('listings.ad.markTakenDown')}
          </Button>
        )}
        {canManage && !live && (
          <Button
            variant="soft"
            className="min-w-36 flex-1"
            disabled={!available}
            onClick={() => setLiveOpen(true)}
            data-testid="set-live"
          >
            {t('listings.ad.setLive')}
          </Button>
        )}
        {ad.link && (
          <Button asChild variant="secondary" className="min-w-36 flex-1">
            <a href={ad.link} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              {t('listings.ad.openAd')}
            </a>
          </Button>
        )}
      </div>
      {canManage && !live && !available && (
        <p className="ps-4.5 pe-4 pb-3.5 text-xs text-muted-foreground">
          {t('listings.ad.notAvailableHint')}
        </p>
      )}
      {canManage && live && available && (
        <div className="ps-4 pe-3.5 pb-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setTakeDownOpen(true)}
          >
            {t('listings.ad.markTakenDown')}
          </Button>
        </div>
      )}

      <SetLiveDialog
        open={liveOpen}
        onOpenChange={setLiveOpen}
        listing={listing}
        onUpdated={onUpdated}
      />
      <CheckInDialog
        open={checkInOpen}
        onOpenChange={setCheckInOpen}
        listing={listing}
        onUpdated={onUpdated}
      />
      <ConfirmDialog
        open={takeDownOpen}
        onOpenChange={setTakeDownOpen}
        title={t('listings.ad.takeDownTitle')}
        description={t('listings.ad.takeDownBody')}
        confirmLabel={t('listings.ad.markTakenDown')}
        onConfirm={takeDown}
      />
    </section>
  );
}

function Row({
  label,
  highlight = false,
  testId,
  children,
}: {
  label: string;
  highlight?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      data-due={highlight || undefined}
      className={cn(
        'flex items-center justify-between gap-3 py-2.5 ps-4.5 pe-4',
        highlight && 'mx-2.5 rounded-md bg-urgency-soft ps-3 pe-3',
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-bold', highlight && 'text-warning')}>
        {children}
      </dd>
    </div>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-sm bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}

/** Live needs a link: an empty or malformed one is refused here, before any request. */
function SetLiveDialog({
  open,
  onOpenChange,
  listing,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: Listing;
  onUpdated: (listing: Listing) => void;
}) {
  const { t } = useTranslation();
  const [link, setLink] = useState(listing.ad.link ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useMutation();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const value = link.trim();
    if (!value) return setFieldError(t('listings.ad.linkRequired'));
    if (!AdLinkSchema.safeParse(value).success)
      return setFieldError(t('listings.ad.linkInvalid'));
    setFieldError(null);
    const res = await run(
      () => UPDATE_LISTING_AD(listing.id, { status: 'LIVE', link: value }),
      {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('listings.ad.liveSaved'),
      },
    );
    if (!res || isUnauthorized(res)) return;
    if (!res.success) return setError(listingErrorMessage(t, res));
    onUpdated(res.data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent size="sm" closeLabel={t('dialog.close')}>
        <form
          noValidate
          onSubmit={(event) => void save(event)}
          className="contents"
        >
          <DialogHeader>
            <DialogTitle>{t('listings.ad.liveTitle')}</DialogTitle>
            <DialogDescription>{t('listings.ad.liveBody')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-3">
            <ErrorLine message={error} />
            <FormField
              label={t('listings.ad.link')}
              required
              error={fieldError ?? undefined}
            >
              {(field) => (
                <Input
                  {...field}
                  type="url"
                  inputMode="url"
                  dir="ltr"
                  autoComplete="off"
                  className="rtl:text-end"
                  placeholder={t('listings.ad.linkPlaceholder')}
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  data-testid="ad-link"
                />
              )}
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={pending} data-testid="save-live">
              {pending && <LoaderCircle aria-hidden className="animate-spin" />}
              {pending ? t('dialog.working') : t('listings.ad.setLive')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Is the home still available?" Yes saves at once; "No longer available" asks first, because it
 * takes the listing Off market and opens a take-down task.
 */
function CheckInDialog({
  open,
  onOpenChange,
  listing,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: Listing;
  onUpdated: (listing: Listing) => void;
}) {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useMutation();

  function reset(next: boolean) {
    if (pending) return;
    if (!next) {
      setConfirming(false);
      setAvailable(true);
      setNote('');
      setError(null);
    }
    onOpenChange(next);
  }

  async function submit() {
    setError(null);
    const body = note.trim()
      ? { stillAvailable: available, note: note.trim() }
      : { stillAvailable: available };
    const res = await run(() => LOG_LISTING_CHECK_IN(listing.id, body), {
      showErrorToast: false,
      showSuccessToast: true,
      successMessage: t('listings.ad.checkInSaved'),
    });
    if (!res || isUnauthorized(res)) return;
    if (!res.success) {
      setConfirming(false);
      return setError(listingErrorMessage(t, res));
    }
    onUpdated(res.data);
    reset(false);
  }

  const choice = (value: boolean, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={available === value}
      onClick={() => setAvailable(value)}
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-4 text-start text-sm font-semibold',
        'transition-[background-color,box-shadow] duration-200 ease-snappy',
        'outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
        available === value
          ? 'bg-primary-soft text-primary-soft-foreground shadow-soft'
          : 'bg-secondary text-secondary-foreground hover:bg-accent',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-5 shrink-0 place-items-center rounded-pill border-2',
          available === value ? 'border-primary' : 'border-input',
        )}
      >
        {available === value && (
          <span className="size-2.5 rounded-pill bg-primary" />
        )}
      </span>
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent
        size="sm"
        closeLabel={t('dialog.close')}
        data-testid="check-in-dialog"
      >
        {confirming ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('listings.ad.confirmOffMarketTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('listings.ad.confirmOffMarketBody')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setConfirming(false)}
              >
                {t('action.cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => void submit()}
                data-testid="confirm-off-market"
              >
                {pending && (
                  <LoaderCircle aria-hidden className="animate-spin" />
                )}
                {pending
                  ? t('dialog.working')
                  : t('listings.ad.confirmOffMarket')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('listings.ad.checkInTitle')}</DialogTitle>
            </DialogHeader>
            <DialogBody className="grid gap-4">
              <ErrorLine message={error} />
              <div
                role="radiogroup"
                aria-label={t('listings.ad.checkInQuestion')}
                className="grid gap-2"
              >
                <p className="type-label">{t('listings.ad.checkInQuestion')}</p>
                {choice(true, t('listings.ad.stillAvailable'))}
                {choice(false, t('listings.ad.noLonger'))}
              </div>
              <FormField label={t('listings.ad.checkInNote')}>
                {(field) => (
                  <Textarea
                    showCount
                    {...field}
                    rows={3}
                    maxLength={NOTE_BODY_MAX_LENGTH}
                    value={note}
                    placeholder={t('listings.ad.checkInNotePlaceholder')}
                    onChange={(event) => setNote(event.target.value)}
                  />
                )}
              </FormField>
            </DialogBody>
            <DialogFooter>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => reset(false)}
              >
                {t('action.cancel')}
              </Button>
              <Button
                disabled={pending}
                data-testid="save-check-in"
                onClick={() =>
                  available ? void submit() : setConfirming(true)
                }
              >
                {pending && (
                  <LoaderCircle aria-hidden className="animate-spin" />
                )}
                {pending ? t('dialog.working') : t('listings.ad.checkInSave')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
