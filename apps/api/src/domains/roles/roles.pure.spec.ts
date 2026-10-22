import { PERMISSION_KEYS } from '@prime-crm/shared';
import {
  canonicalPermissions,
  changesAdminPermissions,
  permissionDiff,
  toRole,
} from './roles.pure';

describe('roles.pure', () => {
  it('toRole gives Admin every key whatever the row stores, and counts users', () => {
    const role = toRole({
      id: 'r1',
      name: 'Admin',
      builtIn: 'ADMIN',
      permissions: ['users.manage'],
      _count: { users: 2 },
    });
    expect(role).toEqual({
      id: 'r1',
      name: 'Admin',
      builtIn: 'ADMIN',
      permissions: [...PERMISSION_KEYS],
      userCount: 2,
    });
  });

  it('toRole keeps a custom role’s known keys and drops unknown ones', () => {
    const role = toRole({
      id: 'r2',
      name: 'Team lead',
      builtIn: null,
      permissions: ['owners.assign', 'gone.key'],
      _count: { users: 0 },
    });
    expect(role.permissions).toEqual(['owners.assign']);
    expect(role.builtIn).toBeNull();
  });

  it('canonicalPermissions dedupes and orders by the fixed list', () => {
    expect(
      canonicalPermissions(['trash.restore', 'users.manage', 'trash.restore']),
    ).toEqual(['users.manage', 'trash.restore']);
    expect(canonicalPermissions([])).toEqual([]);
  });

  it('permissionDiff lists added and removed keys', () => {
    expect(
      permissionDiff(
        ['users.manage', 'data.export'],
        ['data.export', 'activity.view'],
      ),
    ).toEqual({ added: ['activity.view'], removed: ['users.manage'] });
  });

  it('changesAdminPermissions: only Admin, only when the list is not every key', () => {
    expect(changesAdminPermissions('ADMIN', ['users.manage'])).toBe(true);
    expect(changesAdminPermissions('ADMIN', [])).toBe(true);
    expect(changesAdminPermissions('ADMIN', [...PERMISSION_KEYS])).toBe(false);
    expect(changesAdminPermissions('ADMIN', undefined)).toBe(false);
    expect(changesAdminPermissions('TEAM_MEMBER', [])).toBe(false);
    expect(changesAdminPermissions(null, ['users.manage'])).toBe(false);
  });
});
