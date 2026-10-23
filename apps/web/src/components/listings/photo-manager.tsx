'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  ImagePlus,
  Trash2,
  X,
} from 'lucide-react';
import { LISTING_PHOTOS_MAX, type Photo } from '@prime-crm/shared';
import { DELETE_LISTING_PHOTO, REORDER_LISTING_PHOTOS } from '@/apis';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/i18n-provider';
import type { Translate } from '@/i18n/translate';
import { isUnauthorized } from '@/lib/api-result';
import { cn } from '@/lib/utils';
import { ListingCover } from './listing-cover';
import { listingErrorMessage } from './listing-error';
import { PHOTO_ACCEPT, preparePhoto } from './photo-prepare';
import { uploadListingPhoto } from './photo-upload';
import { useMutation } from './use-mutation';

type Stage = 'waiting' | 'converting' | 'preparing' | 'uploading' | 'saving';

interface QueueItem {
  key: string;
  name: string;
  stage: Stage;
  percent: number;
}

const STAGE_LABEL: Record<Stage, Parameters<Translate>[0]> = {
  waiting: 'listings.photos.preparing',
  converting: 'listings.photos.converting',
  preparing: 'listings.photos.preparing',
  uploading: 'listings.photos.uploading',
  saving: 'listings.photos.saving',
};

/** A new order for `photos`: the one at `from` moved to `to`. */
export function movePhoto(photos: readonly Photo[], from: number, to: number) {
  const next = [...photos];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((photo, order) => ({ ...photo, order }));
}

/**
 * The listing's photos for its member (or a manager): add up to 30 (HEIC converted, large photos
 * scaled to 2560 px, wrong types and files over 10 MB refused with a reason), each upload with
 * its own progress; reorder by dragging on a desktop or with the move buttons on a phone (the
 * first is the cover); delete with a confirm.
 */
export function PhotoManager({
  listingId,
  photos,
  onPhotosChange,
}: {
  listingId: string;
  photos: readonly Photo[];
  onPhotosChange: (photos: Photo[]) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [removing, setRemoving] = useState<Photo | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const reorder = useMutation();
  const current = useRef(photos);
  useEffect(() => {
    current.current = photos;
  }, [photos]);

  const busy = queue.length > 0;
  const full = photos.length >= LISTING_PHOTOS_MAX;

  const patch = (key: string, change: Partial<QueueItem>) =>
    setQueue((items) =>
      items.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0 || busy) return;
    const files = Array.from(list);
    const room = LISTING_PHOTOS_MAX - current.current.length;
    const accepted = files.slice(0, Math.max(0, room));
    let found: string[] =
      files.length > accepted.length
        ? [
            t('listings.photos.tooMany', {
              count: files.length - accepted.length,
            }),
          ]
        : [];

    const items = accepted.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      name: file.name,
      stage: 'waiting' as Stage,
      percent: 0,
    }));
    setProblems(found);
    setQueue(items);

    let stopAll = false;
    for (const [i, file] of accepted.entries()) {
      const { key, name } = items[i];
      if (stopAll) break;
      let prepared;
      try {
        prepared = await preparePhoto(file, (stage) => patch(key, { stage }));
      } catch {
        prepared = null;
      }
      if (!prepared || !prepared.ok) {
        const reason = prepared?.reason;
        found = [
          ...found,
          reason === 'wrongType'
            ? t('listings.photos.wrongType', { name })
            : reason === 'tooLarge'
              ? t('listings.photos.tooLarge', { name })
              : t('listings.photos.failed', { name }),
        ];
        setProblems(found);
        setQueue((q) => q.filter((item) => item.key !== key));
        continue;
      }

      patch(key, { stage: 'uploading', percent: 0 });
      const outcome = await uploadListingPhoto(
        listingId,
        prepared.file,
        (percent) =>
          patch(key, {
            percent: Math.round(percent),
            stage: percent >= 100 ? 'saving' : 'uploading',
          }),
      );
      setQueue((q) => q.filter((item) => item.key !== key));
      if (outcome.ok) {
        onPhotosChange([...current.current, outcome.photo]);
        current.current = [...current.current, outcome.photo];
        continue;
      }
      const failure = outcome.failure;
      if (failure && isUnauthorized(failure)) return;
      if (failure?.error === 'UPLOADS_NOT_CONFIGURED') {
        found = [...found, t('listings.photos.notConfigured')];
        stopAll = true;
      } else if (failure?.error)
        found = [...found, `${name}: ${listingErrorMessage(t, failure)}`];
      else found = [...found, t('listings.photos.failed', { name })];
      setProblems(found);
    }
    setQueue([]);
  }

  async function saveOrder(next: Photo[]) {
    const before = [...current.current];
    onPhotosChange(next);
    const res = await reorder.run(
      () =>
        REORDER_LISTING_PHOTOS(listingId, {
          photoIds: next.map((photo) => photo.id),
        }),
      { showErrorToast: false },
    );
    if (!res || isUnauthorized(res)) return;
    if (!res.success) {
      onPhotosChange(before);
      setProblems([listingErrorMessage(t, res)]);
    } else onPhotosChange(res.data);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= photos.length || from === to || reorder.pending) return;
    void saveOrder(movePhoto(photos, from, to));
  }

  async function remove() {
    if (!removing) return;
    const res = await reorder.run(() =>
      DELETE_LISTING_PHOTO(listingId, removing.id),
    );
    if (!res || isUnauthorized(res) || !res.success) return false;
    onPhotosChange(
      current.current
        .filter((photo) => photo.id !== removing.id)
        .map((photo, order) => ({ ...photo, order })),
    );
  }

  return (
    <section
      aria-labelledby="photo-manager-title"
      data-testid="photo-manager"
      className="grid gap-3 rounded-lg bg-card p-4 shadow-raised"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="photo-manager-title"
          className="flex items-baseline gap-2 text-sm font-bold"
        >
          {t('listings.photos.title')}
          <bdi className="font-numeric text-xs font-semibold text-muted-foreground tabular-nums">
            {t('listings.photos.count', {
              count: photos.length,
              max: LISTING_PHOTOS_MAX,
            })}
          </bdi>
        </h2>
        <Button
          variant="soft"
          size="sm"
          className="h-11"
          disabled={busy || full}
          onClick={() => input.current?.click()}
          data-testid="add-photos"
        >
          <ImagePlus aria-hidden />
          {t('listings.photos.add')}
        </Button>
        <Input
          ref={input}
          type="file"
          multiple
          accept={PHOTO_ACCEPT}
          tabIndex={-1}
          aria-hidden
          data-testid="photo-input"
          onChange={(event) => {
            const files = event.target.files;
            void addFiles(files).finally(() => {
              if (input.current) input.current.value = '';
            });
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('listings.photos.hint')}
      </p>

      {problems.length > 0 && (
        <div
          role="alert"
          className="grid gap-1.5 rounded-md bg-destructive-soft px-3.5 py-3 text-sm font-semibold text-destructive"
        >
          <div className="flex items-start justify-between gap-2">
            <ul className="grid gap-1">
              {problems.map((problem) => (
                <li key={problem} className="flex items-start gap-2">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {problem}
                </li>
              ))}
            </ul>
            <button
              type="button"
              aria-label={t('listings.photos.dismiss')}
              onClick={() => setProblems([])}
              className="-m-2 grid size-11 shrink-0 cursor-pointer place-items-center rounded-pill hover:bg-destructive/10"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <ul className="grid gap-2" aria-label={t('listings.photos.uploading')}>
          {queue.map((item) => (
            <li
              key={item.key}
              className="grid gap-1.5 rounded-md bg-secondary px-3.5 py-2.5"
            >
              <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {t(STAGE_LABEL[item.stage])}
                  {item.stage === 'uploading' && (
                    <bdi className="ms-1 font-numeric tabular-nums">
                      {item.percent}%
                    </bdi>
                  )}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={item.name}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={item.percent}
                className="h-1.5 overflow-hidden rounded-pill bg-card"
              >
                <div
                  className="h-full origin-left rounded-pill bg-primary transition-transform duration-200 ease-snappy rtl:origin-right"
                  style={{ transform: `scaleX(${item.percent / 100})` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {photos.length === 0 && queue.length === 0 ? (
        <p className="rounded-md bg-secondary px-3.5 py-6 text-center text-sm text-muted-foreground">
          {t('listings.photos.empty')}
        </p>
      ) : (
        <>
          {photos.length > 1 && (
            <p className="hidden text-xs text-muted-foreground pointer-fine:block">
              {t('listings.photos.dragHint')}
            </p>
          )}
          <ol
            className={cn(
              'grid grid-cols-2 gap-2.5 sm:grid-cols-3',
              reorder.pending && 'opacity-70 transition-opacity',
            )}
            aria-busy={reorder.pending || undefined}
            data-testid="photo-list"
          >
            {photos.map((photo, index) => (
              <li
                key={photo.id}
                data-photo-id={photo.id}
                draggable={!reorder.pending}
                onDragStart={() => setDragFrom(index)}
                onDragEnd={() => setDragFrom(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragFrom !== null) move(dragFrom, index);
                  setDragFrom(null);
                }}
                className={cn(
                  'relative overflow-hidden rounded-md bg-secondary shadow-soft pointer-fine:cursor-grab',
                  dragFrom === index && 'opacity-50',
                )}
              >
                <ListingCover
                  url={photo.url}
                  alt={t('listings.photoAlt', {
                    index: index + 1,
                    total: photos.length,
                  })}
                  className="aspect-[4/3] w-full"
                />
                {index === 0 && (
                  <Badge
                    variant="solid"
                    dot="none"
                    className="absolute start-2 top-2"
                  >
                    {t('listings.photos.cover')}
                  </Badge>
                )}
                <button
                  type="button"
                  aria-label={`${t('listings.photos.remove')} ${index + 1}`}
                  onClick={() => setRemoving(photo)}
                  className="absolute end-1 top-1 grid size-11 cursor-pointer place-items-center rounded-pill text-background"
                >
                  <span className="grid size-8 place-items-center rounded-pill bg-foreground/60 backdrop-blur-md">
                    <Trash2 aria-hidden className="size-4" />
                  </span>
                </button>
                <div className="absolute inset-x-1 bottom-1 flex justify-between">
                  <MoveButton
                    label={`${t('listings.photos.moveEarlier')} ${index + 1}`}
                    disabled={index === 0 || reorder.pending}
                    onClick={() => move(index, index - 1)}
                    icon={<ArrowLeft aria-hidden className="size-4 flip-rtl" />}
                  />
                  <MoveButton
                    label={`${t('listings.photos.moveLater')} ${index + 1}`}
                    disabled={index === photos.length - 1 || reorder.pending}
                    onClick={() => move(index, index + 1)}
                    icon={
                      <ArrowRight aria-hidden className="size-4 flip-rtl" />
                    }
                  />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => !next && setRemoving(null)}
        title={t('listings.photos.removeTitle')}
        description={t('listings.photos.removeBody')}
        confirmLabel={t('action.delete')}
        destructive
        onConfirm={remove}
      />
    </section>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 cursor-pointer place-items-center rounded-pill text-background disabled:cursor-not-allowed disabled:opacity-0"
    >
      <span className="grid size-8 place-items-center rounded-pill bg-foreground/60 backdrop-blur-md">
        {icon}
      </span>
    </button>
  );
}
