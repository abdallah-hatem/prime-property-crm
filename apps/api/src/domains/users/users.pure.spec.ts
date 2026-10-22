import type { UserShapeRow } from '../../common/utils/user-shape.util';
import { changedFields, pickChanges } from './users.pure';

const current: UserShapeRow = {
  id: 'u1',
  name: 'Sara',
  email: 'sara@prime.test',
  phone: '+201001234567',
  language: 'en',
  active: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  role: {
    id: 'r-member',
    name: 'Team member',
    builtIn: 'TEAM_MEMBER',
    permissions: [],
  },
};

describe('users.pure', () => {
  it('changedFields ignores fields not sent and fields sent unchanged', () => {
    expect(changedFields(current, {})).toEqual([]);
    expect(
      changedFields(current, {
        name: 'Sara',
        email: 'sara@prime.test',
        phone: '+201001234567',
        roleId: 'r-member',
        language: 'en',
      }),
    ).toEqual([]);
  });

  it('changedFields lists every changed field, phone cleared to null included', () => {
    expect(
      changedFields(current, {
        name: 'سارة',
        phone: null,
        roleId: 'r-admin',
        language: 'ar',
      }),
    ).toEqual(['name', 'phone', 'roleId', 'language']);
  });

  it('pickChanges keeps only the listed fields', () => {
    expect(
      pickChanges({ name: 'x', email: 'same@prime.test', phone: null }, [
        'name',
        'phone',
      ]),
    ).toEqual({ name: 'x', phone: null });
  });
});
