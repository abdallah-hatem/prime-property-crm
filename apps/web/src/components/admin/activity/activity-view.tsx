'use client';

import { useState } from 'react';
import { ChevronRight, History } from 'lucide-react';
import {
  ActivityTypeSchema,
  type ActivityType,
  type Meta,
  type UserSummary,
} from '@prime-crm/shared';
import type { ActivityEntry } from '@/apis';
import { Select } from '@/components/admin/admin-ui';
import { DataList, type DataColumn } from '@/components/data-list';
import { DateText } from '@/components/date-text';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/i18n/i18n-provider';
import type { CairoDay } from '@/lib/cairo-time';
import { formatDate } from '@/lib/format';
import { useUrlParams } from '@/lib/use-url-params';
import { activityDetails, activitySummary } from './activity-summary';
import { DateRangeFilter } from './date-range-filter';

const ALL = 'all';

export interface ActorOption extends UserSummary {
  active: boolean;
}

/**
 * The activity log, newest first: filter by type, person and Cairo dates (all in the URL); each
 * entry reads as a sentence in the reader's language and opens its details.
 */
export function ActivityView({
  rows,
  meta,
  type,
  actorId,
  from,
  to,
  today,
  actors,
}: {
  rows: ActivityEntry[];
  meta: Meta;
  type: ActivityType | null;
  actorId: string | null;
  from: CairoDay | null;
  to: CairoDay | null;
  today: CairoDay;
  /** null when the viewer may not list users (the filter is left out). */
  actors: ActorOption[] | null;
}) {
  const { t } = useTranslation();
  const { setParams, isPending } = useUrlParams();
  const [open, setOpen] = useState<ActivityEntry | null>(null);
  const filtered = !!(type || actorId || from);
  const inactive = new Set(
    (actors ?? []).filter((a) => !a.active).map((a) => a.id),
  );
  const actorName = (actor: UserSummary) =>
    inactive.has(actor.id)
      ? t('admin.activity.deactivatedActor', { name: actor.name })
      : actor.name;

  const typeChip = (entry: ActivityEntry, className?: string) => (
    <Badge variant="neutral" dot="none" className={className}>
      {t(`admin.activity.types.${entry.type}`)}
    </Badge>
  );

  const columns: DataColumn<ActivityEntry>[] = [
    {
      id: 'when',
      header: t('admin.activity.when'),
      className: 'w-44',
      cell: (entry) => (
        <DateText
          value={entry.createdAt}
          style="dateTime"
          className="font-numeric text-muted-foreground"
        />
      ),
    },
    {
      id: 'who',
      header: t('admin.activity.who'),
      className: 'w-36',
      cell: (entry) => (
        <span className="font-semibold">
          <bdi>{actorName(entry.actor)}</bdi>
        </span>
      ),
    },
    {
      id: 'what',
      header: t('admin.activity.what'),
      cell: (entry) => (
        <span className="flex min-w-0 items-center gap-2">
          {/* The sentence already names the type; the chip only fits on wide screens. */}
          {typeChip(entry, 'hidden xl:inline-flex')}
          <span className="min-w-0 truncate" title={activitySummary(entry, t)}>
            <bdi>{activitySummary(entry, t)}</bdi>
          </span>
        </span>
      ),
    },
    {
      id: 'open',
      header: '',
      className: 'w-12 text-end',
      cell: () => (
        <ChevronRight
          aria-hidden
          className="inline size-4 flip-rtl text-muted-foreground"
        />
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5" data-testid="activity-page">
      <PageHeader title={t('nav.activity')} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select
          value={type ?? ALL}
          onValueChange={(next) =>
            setParams({ type: next === ALL ? null : next })
          }
        >
          <SelectTrigger
            aria-label={t('admin.activity.typeFilter')}
            data-testid="activity-type"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('admin.activity.allTypes')}</SelectItem>
            {ActivityTypeSchema.options.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`admin.activity.types.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {actors && (
          <Select
            value={actorId ?? ALL}
            onValueChange={(next) =>
              setParams({ actor: next === ALL ? null : next })
            }
          >
            <SelectTrigger
              aria-label={t('admin.activity.actorFilter')}
              data-testid="activity-actor"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t('admin.activity.allActors')}
              </SelectItem>
              {actors.map((actor) => (
                <SelectItem key={actor.id} value={actor.id}>
                  {actorName(actor)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DateRangeFilter
          from={from}
          to={to}
          today={today}
          onChange={(range) => setParams({ from: range.from, to: range.to })}
        />
      </div>
      <DataList
        // One shrinkable track: a wide table scrolls inside its card instead of widening the page.
        className="grid-cols-1"
        label={t('nav.activity')}
        columns={columns}
        rows={rows}
        rowKey={(entry) => entry.id}
        meta={meta}
        isRefetching={isPending}
        onRowClick={setOpen}
        renderCard={(entry) => (
          <button
            type="button"
            onClick={() => setOpen(entry)}
            data-testid="activity-card"
            className="flex w-full cursor-pointer items-center gap-3 rounded-md bg-card p-4 text-start shadow-raised transition-colors duration-150 hover:bg-accent/60"
          >
            <span className="grid min-w-0 flex-1 gap-1.5">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {typeChip(entry)}
                <DateText
                  value={entry.createdAt}
                  style="dateTime"
                  className="font-numeric"
                />
              </span>
              <span className="text-sm font-semibold break-words">
                <bdi>{activitySummary(entry, t)}</bdi>
              </span>
              <span className="truncate text-xs text-muted-foreground">
                <bdi>{actorName(entry.actor)}</bdi>
              </span>
            </span>
            <ChevronRight
              aria-hidden
              className="size-5 shrink-0 flip-rtl text-muted-foreground"
            />
          </button>
        )}
        empty={{
          icon: History,
          title: t('admin.activity.emptyTitle'),
          body: filtered ? t('admin.activity.emptyBody') : undefined,
        }}
      />
      <ActivityDetails
        entry={open}
        actorName={open ? actorName(open.actor) : ''}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

function ActivityDetails({
  entry,
  actorName,
  onClose,
}: {
  entry: ActivityEntry | null;
  actorName: string;
  onClose: () => void;
}) {
  const { t, locale } = useTranslation();
  const lines = entry ? activityDetails(entry, t, locale) : [];
  return (
    <Dialog open={!!entry} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        variant="sheet"
        size="md"
        closeLabel={t('dialog.close')}
        data-testid="activity-details"
      >
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle>
                {t(`admin.activity.types.${entry.type}`)}
              </DialogTitle>
              <DialogDescription>
                <bdi>{actorName}</bdi>
                {', '}
                <bdi className="font-numeric">
                  {formatDate(entry.createdAt, locale, 'dateTime')}
                </bdi>
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="grid content-start gap-4 pb-6">
              <p className="text-base font-semibold break-words">
                <bdi>{activitySummary(entry, t)}</bdi>
              </p>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('admin.activity.noDetails')}
                </p>
              ) : (
                <dl className="grid gap-2 rounded-md bg-secondary/60 p-4 text-sm">
                  {lines.map((line, index) => (
                    <div
                      key={`${line.label}-${index}`}
                      className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3"
                    >
                      <dt className="font-semibold text-muted-foreground">
                        {line.label}
                      </dt>
                      <dd className="min-w-0 break-words">
                        <bdi>{line.value}</bdi>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
