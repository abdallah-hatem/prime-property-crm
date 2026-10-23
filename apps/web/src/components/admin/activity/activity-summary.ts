import type { Locale } from '@prime-crm/shared';
import type { ActivityEntry } from '@/apis';
import { permissionLabel } from '@/components/admin/roles/permission-groups';
import type { MessageKey, Translate } from '@/i18n/translate';
import { formatDate, formatNumber } from '@/lib/format';

/**
 * Activity entries in the reader's language. The API stores an English `summary`; the screen
 * builds its own sentence from the type, the target and the details, and falls back to the API's
 * sentence for anything it doesn't recognise.
 */

type Details = Record<string, unknown>;

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const str = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const obj = (value: unknown): Details | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Details)
    : null;
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
const n = (value: unknown) => formatNumber(num(value) ?? 0);

const TRASH_KINDS = ['OWNER', 'LISTING', 'PHOTO'] as const;
type TrashKindName = (typeof TRASH_KINDS)[number];
const trashKind = (kind: string | undefined): TrashKindName | null =>
  (TRASH_KINDS as readonly string[]).includes(kind ?? '')
    ? (kind as TrashKindName)
    : null;

export function activitySummary(entry: ActivityEntry, t: Translate): string {
  const d = entry.details ?? {};
  const label = entry.target?.label ?? '';
  const name = label;
  switch (entry.type) {
    case 'IMPORT': {
      const counts = obj(d.counts) ?? {};
      return t('admin.activity.summary.import', {
        file: label,
        added: n(counts.added),
        duplicates: n(counts.duplicates),
        rejected: n(counts.rejected),
      });
    }
    case 'ASSIGN': {
      const listings = d.kind === 'LISTINGS';
      const count = n(d.count);
      if (entry.target)
        return t(
          listings
            ? 'admin.activity.summary.assignListings'
            : 'admin.activity.summary.assignOwners',
          { name, count },
        );
      return t(
        listings
          ? 'admin.activity.summary.unassignListings'
          : 'admin.activity.summary.unassignOwners',
        { count },
      );
    }
    case 'DELETE':
    case 'RESTORE': {
      const kind = trashKind(entry.target?.kind);
      if (!kind) break;
      const verb = entry.type === 'DELETE' ? 'delete' : 'restore';
      return t(`admin.activity.summary.${verb}${kind}` as MessageKey, {
        label,
      });
    }
    case 'USER_CREATE':
      return t('admin.activity.summary.userCreate', { name });
    case 'USER_UPDATE':
      return t('admin.activity.summary.userUpdate', { name });
    case 'USER_DEACTIVATE': {
      const to = str(obj(d.handOverTo)?.name);
      return to
        ? t('admin.activity.summary.userDeactivateTo', { name, to })
        : t('admin.activity.summary.userDeactivateNobody', { name });
    }
    case 'USER_REACTIVATE':
      return t('admin.activity.summary.userReactivate', { name });
    case 'PASSWORD_RESET':
      return t('admin.activity.summary.passwordReset', { name });
    case 'ROLE_CREATE':
      return t('admin.activity.summary.roleCreate', { name });
    case 'ROLE_UPDATE':
      return t('admin.activity.summary.roleUpdate', { name });
    case 'ROLE_DELETE':
      return t('admin.activity.summary.roleDelete', { name });
    case 'SETTINGS_UPDATE': {
      const change = obj(d.adCheckInDays);
      if (!change) break;
      return t('admin.activity.summary.checkIn', {
        from: n(change.from),
        to: n(change.to),
      });
    }
    case 'OUTCOME_UPDATE': {
      const action = str(d.action);
      if (action === 'create')
        return t('admin.activity.summary.outcomeCreate', { name });
      if (action === 'delete')
        return t('admin.activity.summary.outcomeDelete', { name });
      return t('admin.activity.summary.outcomeUpdate', { name });
    }
    case 'EXPORT':
      return t(
        d.kind === 'LISTINGS'
          ? 'admin.activity.summary.exportListings'
          : 'admin.activity.summary.exportOwners',
        { count: n(d.count ?? d.rows) },
      );
  }
  return entry.summary;
}

export interface DetailLine {
  label: string;
  value: string;
}

const FIELD_KEYS = [
  'name',
  'email',
  'phone',
  'roleId',
  'language',
  'labelEn',
  'labelAr',
  'setsStatus',
  'hidden',
  'order',
] as const;
const fieldLabel = (key: string, t: Translate): string =>
  (FIELD_KEYS as readonly string[]).includes(key)
    ? t(`admin.activity.detail.fields.${key}` as MessageKey)
    : key;

const show = (value: unknown): string =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'number'
      ? formatNumber(value)
      : typeof value === 'string'
        ? value
        : typeof value === 'boolean'
          ? String(value)
          : JSON.stringify(value);

/** The readable lines of an entry's details (what moved, what changed, counts). */
export function activityDetails(
  entry: ActivityEntry,
  t: Translate,
  locale: Locale,
): DetailLine[] {
  const d = entry.details ?? {};
  const lines: DetailLine[] = [];
  const add = (key: MessageKey, value: string) =>
    lines.push({ label: t(key), value });
  const joiner = locale === 'ar' ? '، ' : ', ';
  const fromTo = (from: unknown, to: unknown) =>
    t('admin.activity.detail.fromTo', { from: show(from), to: show(to) });

  if (entry.target) add('admin.activity.detail.target', entry.target.label);

  switch (entry.type) {
    case 'USER_DEACTIVATE':
      add('admin.activity.detail.owners', n(d.owners));
      add('admin.activity.detail.listings', n(d.listings));
      add('admin.activity.detail.reminders', n(d.reminders));
      if (num(d.sessionsEnded) !== null)
        add('admin.activity.detail.sessionsEnded', n(d.sessionsEnded));
      break;
    case 'PASSWORD_RESET':
      if (num(d.sessionsEnded) !== null)
        add('admin.activity.detail.sessionsEnded', n(d.sessionsEnded));
      break;
    case 'IMPORT': {
      const counts = obj(d.counts) ?? {};
      add('admin.activity.detail.added', n(counts.added));
      add('admin.activity.detail.duplicates', n(counts.duplicates));
      add('admin.activity.detail.rejected', n(counts.rejected));
      break;
    }
    case 'ASSIGN':
    case 'EXPORT':
      add(
        entry.type === 'EXPORT'
          ? 'admin.activity.detail.rows'
          : 'admin.activity.detail.count',
        n(d.count ?? d.rows),
      );
      if (obj(d.filters) && Object.keys(obj(d.filters) ?? {}).length > 0)
        add('admin.activity.detail.filters', show(d.filters));
      break;
    case 'USER_UPDATE': {
      const changed = strings(d.changed);
      if (changed.length)
        add(
          'admin.activity.detail.changed',
          changed.map((key) => fieldLabel(key, t)).join(joiner),
        );
      const role = obj(d.role);
      if (role)
        add(
          'admin.activity.detail.roleChange',
          fromTo(obj(role.from)?.name, obj(role.to)?.name),
        );
      break;
    }
    case 'ROLE_CREATE':
    case 'ROLE_DELETE': {
      const list = strings(d.permissions);
      if (list.length)
        add(
          'admin.activity.detail.permissions',
          list.map((key) => permissionLabel(key, locale)).join(joiner),
        );
      break;
    }
    case 'ROLE_UPDATE': {
      const rename = obj(d.name);
      if (rename)
        add('admin.activity.detail.nameChange', fromTo(rename.from, rename.to));
      const perms = obj(d.permissions);
      const added = strings(perms?.added);
      const removed = strings(perms?.removed);
      if (added.length)
        add(
          'admin.activity.detail.permissionsAdded',
          added.map((key) => permissionLabel(key, locale)).join(joiner),
        );
      if (removed.length)
        add(
          'admin.activity.detail.permissionsRemoved',
          removed.map((key) => permissionLabel(key, locale)).join(joiner),
        );
      break;
    }
    case 'SETTINGS_UPDATE': {
      const change = obj(d.adCheckInDays);
      if (change)
        add('admin.activity.detail.checkIn', fromTo(change.from, change.to));
      break;
    }
    case 'OUTCOME_UPDATE': {
      const changed = obj(d.changed);
      for (const [key, change] of Object.entries(changed ?? {})) {
        const c = obj(change);
        lines.push({
          label: fieldLabel(key, t),
          value:
            key === 'setsStatus' && c
              ? fromTo(
                  t(`leadStatus.${str(c.from) ?? 'NEW'}` as MessageKey),
                  t(`leadStatus.${str(c.to) ?? 'NEW'}` as MessageKey),
                )
              : fromTo(c?.from, c?.to),
        });
      }
      break;
    }
    case 'DELETE': {
      const until = str(d.purgeAt);
      if (until)
        add('admin.activity.detail.deleteUntil', formatDate(until, locale));
      break;
    }
    default:
      break;
  }
  return lines;
}
