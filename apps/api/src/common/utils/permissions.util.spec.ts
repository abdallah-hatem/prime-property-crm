import type { Permission } from '@prime-crm/shared';
import type { CurrentUser } from '../interfaces/current-user.interface';
import {
  hasAllPermissions,
  hasPermission,
  toCurrentUser,
} from './permissions.util';

const member: CurrentUser = {
  id: 'u1',
  roleId: 'r-custom',
  permissions: ['owners.assign'],
  isAdmin: false,
};

describe('permission helpers', () => {
  it('a member holds exactly the keys of their role', () => {
    expect(hasPermission(member, 'owners.assign')).toBe(true);
    expect(hasPermission(member, 'users.manage')).toBe(false);
  });

  it('the Admin role holds every key, including unknown future ones', () => {
    const admin = { ...member, permissions: [], isAdmin: true };
    expect(hasPermission(admin, 'users.manage')).toBe(true);
    expect(hasPermission(admin, 'future.key' as Permission)).toBe(true);
  });

  it('hasAllPermissions needs every key; an empty list always passes', () => {
    expect(hasAllPermissions(member, [])).toBe(true);
    expect(hasAllPermissions(member, ['owners.assign'])).toBe(true);
    expect(hasAllPermissions(member, ['owners.assign', 'data.export'])).toBe(
      false,
    );
  });

  it('toCurrentUser decides admin by role id and tolerates a malformed claim', () => {
    expect(
      toCurrentUser(
        { id: 'u1', roleId: 'r-admin', permissions: 'nope' },
        'r-admin',
      ),
    ).toEqual({ id: 'u1', roleId: 'r-admin', permissions: [], isAdmin: true });
    expect(
      toCurrentUser({ id: 'u1', roleId: 'r-admin', permissions: [] }, null)
        .isAdmin,
    ).toBe(false);
  });
});
