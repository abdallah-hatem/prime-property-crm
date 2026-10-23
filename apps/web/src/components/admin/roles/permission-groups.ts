import { PERMISSIONS, type Locale, type Permission } from '@prime-crm/shared';

export type PermissionGroupKey =
  'people' | 'owners' | 'listings' | 'insights' | 'system';

/** The fixed permission list in the editor's groups (every key appears exactly once). */
export const PERMISSION_GROUPS: readonly {
  key: PermissionGroupKey;
  permissions: readonly Permission[];
}[] = [
  { key: 'people', permissions: ['users.manage', 'roles.manage'] },
  {
    key: 'owners',
    permissions: ['owners.viewAll', 'owners.import', 'owners.assign'],
  },
  { key: 'listings', permissions: ['listings.create', 'listings.manageAll'] },
  {
    key: 'insights',
    permissions: ['analytics.view', 'activity.view', 'data.export'],
  },
  { key: 'system', permissions: ['trash.restore', 'settings.manage'] },
];

/** A permission's label in the reader's language (the fixed list carries both). */
export function permissionLabel(key: string, locale: Locale): string {
  const info = PERMISSIONS.find((p) => p.key === key);
  if (!info) return key;
  return locale === 'ar' ? info.labelAr : info.labelEn;
}

export const PERMISSION_COUNT = PERMISSIONS.length;
