import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_ROLES,
  isPermission,
  PERMISSION_KEYS,
  PERMISSIONS,
} from './permissions';
import { DEFAULT_CALL_OUTCOMES } from './outcomes';

describe('permissions', () => {
  it('lists the twelve keys of the spec, each once', () => {
    expect(PERMISSION_KEYS).toEqual([
      'users.manage',
      'roles.manage',
      'owners.viewAll',
      'owners.import',
      'owners.assign',
      'listings.create',
      'listings.manageAll',
      'analytics.view',
      'activity.view',
      'data.export',
      'trash.restore',
      'settings.manage',
    ]);
  });

  it('every permission has an English and an Arabic label', () => {
    for (const p of PERMISSIONS) {
      expect(p.labelEn.trim(), p.key).not.toBe('');
      expect(p.labelAr.trim(), p.key).not.toBe('');
    }
  });

  it('rejects unknown keys', () => {
    expect(isPermission('owners.assign')).toBe(true);
    expect(isPermission('owners.delete')).toBe(false);
    expect(isPermission(undefined)).toBe(false);
  });

  it('Admin holds every key, Team member none', () => {
    expect(BUILT_IN_ROLES.ADMIN.permissions).toEqual(PERMISSION_KEYS);
    expect(BUILT_IN_ROLES.TEAM_MEMBER.permissions).toEqual([]);
  });
});

describe('default call outcomes', () => {
  it('has ten outcomes with distinct labels and orders 1..10', () => {
    expect(DEFAULT_CALL_OUTCOMES).toHaveLength(10);
    expect(new Set(DEFAULT_CALL_OUTCOMES.map((o) => o.labelEn)).size).toBe(10);
    expect(new Set(DEFAULT_CALL_OUTCOMES.map((o) => o.labelAr)).size).toBe(10);
    expect(DEFAULT_CALL_OUTCOMES.map((o) => o.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('no default outcome sets LISTED', () => {
    expect(
      DEFAULT_CALL_OUTCOMES.some((o) => (o.setsStatus as string) === 'LISTED'),
    ).toBe(false);
  });
});
