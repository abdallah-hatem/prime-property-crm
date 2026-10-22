import { z } from 'zod';

/**
 * The fixed permission list (spec, "Permissions (fixed list)"). Roles store a subset of these
 * keys; the API validates every role write against this list and the seed gives the built-in
 * Admin role all of them. Add a permission here and nowhere else.
 */
export const PERMISSIONS = [
  {
    key: 'users.manage',
    labelEn: 'Manage users',
    labelAr: 'إدارة المستخدمين',
  },
  { key: 'roles.manage', labelEn: 'Manage roles', labelAr: 'إدارة الأدوار' },
  {
    key: 'owners.viewAll',
    labelEn: 'See every owner and phone',
    labelAr: 'عرض كل الملاك وأرقامهم',
  },
  {
    key: 'owners.import',
    labelEn: 'Import, add and delete owners',
    labelAr: 'استيراد الملاك وإضافتهم وحذفهم',
  },
  {
    key: 'owners.assign',
    labelEn: 'Assign owners and listings',
    labelAr: 'توزيع الملاك والعقارات',
  },
  {
    key: 'listings.create',
    labelEn: 'Add and import listings',
    labelAr: 'إضافة العقارات واستيرادها',
  },
  {
    key: 'listings.manageAll',
    labelEn: 'Edit or delete any listing',
    labelAr: 'تعديل أو حذف أي عقار',
  },
  {
    key: 'analytics.view',
    labelEn: 'View analytics',
    labelAr: 'عرض التحليلات',
  },
  {
    key: 'activity.view',
    labelEn: 'View the activity log',
    labelAr: 'عرض سجل النشاط',
  },
  { key: 'data.export', labelEn: 'Export data', labelAr: 'تصدير البيانات' },
  {
    key: 'trash.restore',
    labelEn: 'Restore deleted records',
    labelAr: 'استعادة السجلات المحذوفة',
  },
  {
    key: 'settings.manage',
    labelEn: 'Manage settings and call outcomes',
    labelAr: 'إدارة الإعدادات ونتائج المكالمات',
  },
] as const;

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as [
  (typeof PERMISSIONS)[number]['key'],
  ...(typeof PERMISSIONS)[number]['key'][],
];

export const PermissionSchema = z.enum(PERMISSION_KEYS);
export type Permission = z.infer<typeof PermissionSchema>;
export const Permission = PermissionSchema.enum;

export function isPermission(value: unknown): value is Permission {
  return PermissionSchema.safeParse(value).success;
}

/** Keys of the two roles the system creates and never deletes. */
export const BuiltInRoleSchema = z.enum(['ADMIN', 'TEAM_MEMBER']);
export type BuiltInRole = z.infer<typeof BuiltInRoleSchema>;
export const BuiltInRole = BuiltInRoleSchema.enum;

/** Seeded name and permissions of each built-in role. Admin always holds every key. */
export const BUILT_IN_ROLES: Record<
  BuiltInRole,
  { name: string; permissions: readonly Permission[] }
> = {
  ADMIN: { name: 'Admin', permissions: PERMISSION_KEYS },
  TEAM_MEMBER: { name: 'Team member', permissions: [] },
};
