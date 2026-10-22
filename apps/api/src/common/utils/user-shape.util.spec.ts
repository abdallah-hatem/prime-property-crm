import { PERMISSION_KEYS } from '@prime-crm/shared';
import { rolePermissions, toMe } from './user-shape.util';

describe('rolePermissions', () => {
  it('the built-in Admin role holds every key, whatever is stored', () => {
    expect(rolePermissions({ builtIn: 'ADMIN', permissions: [] })).toEqual([
      ...PERMISSION_KEYS,
    ]);
  });

  it('other roles hold their known keys, unknown and duplicate keys dropped', () => {
    expect(
      rolePermissions({
        builtIn: null,
        permissions: ['owners.assign', 'reports.view', 'owners.assign'],
      }),
    ).toEqual(['owners.assign']);
  });
});

describe('toMe', () => {
  it('maps the row to the contract shape, without role internals', () => {
    const createdAt = new Date('2026-10-22T10:00:00.000Z');
    expect(
      toMe({
        id: 'u',
        name: 'سارة',
        email: 's@prime.test',
        phone: null,
        language: 'ar',
        active: true,
        createdAt,
        role: {
          id: 'r',
          name: 'Team member',
          builtIn: 'TEAM_MEMBER',
          permissions: [],
        },
      }),
    ).toEqual({
      id: 'u',
      name: 'سارة',
      email: 's@prime.test',
      phone: null,
      language: 'ar',
      active: true,
      role: { id: 'r', name: 'Team member' },
      createdAt: '2026-10-22T10:00:00.000Z',
      permissions: [],
    });
  });
});
