import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { CurrentUser } from '../interfaces/current-user.interface';
import {
  assertAccessible,
  assertFound,
  canAccess,
  ownerScope,
} from './ownership.util';

const member: CurrentUser = {
  id: 'member-1',
  roleId: 'role-member',
  permissions: [],
  isAdmin: false,
};
const viewer: CurrentUser = { ...member, permissions: ['owners.viewAll'] };
const admin: CurrentUser = { ...member, isAdmin: true };

const ownedBy = (assignedToId: string | null) => ({
  id: 'rec-1',
  assignedToId,
});
const ownerOf = (r: { assignedToId: string | null }) => r.assignedToId;
const rule = { bypass: 'owners.viewAll' as const, what: 'Owner' };

describe('ownership helpers', () => {
  it("Ownership helper: member asking for someone else's record → NotFound, not Forbidden", () => {
    const act = () =>
      assertAccessible(ownedBy('member-2'), member, ownerOf, rule);
    expect(act).toThrow(NotFoundException);
    expect(act).not.toThrow(ForbiddenException);
    // Indistinguishable from a record that doesn't exist.
    expect(act).toThrow('Owner not found');
    expect(() => assertAccessible(null, member, ownerOf, rule)).toThrow(
      'Owner not found',
    );
  });

  it('returns the record to its owner', () => {
    const record = ownedBy('member-1');
    expect(assertAccessible(record, member, ownerOf, rule)).toBe(record);
  });

  it('hides an unassigned record from a member, shows it with the bypass permission', () => {
    expect(() =>
      assertAccessible(ownedBy(null), member, ownerOf, rule),
    ).toThrow(NotFoundException);
    expect(canAccess(viewer, null, rule)).toBe(true);
    expect(canAccess(admin, 'member-2', rule)).toBe(true);
  });

  it('gives no bypass when the rule names no permission', () => {
    expect(canAccess(admin, 'member-2')).toBe(false);
    expect(canAccess(admin, admin.id)).toBe(true);
  });

  it('scopes a repository query to the caller unless the bypass is held', () => {
    expect(ownerScope(member, 'assignedToId', rule)).toEqual({
      assignedToId: 'member-1',
    });
    expect(ownerScope(viewer, 'assignedToId', rule)).toEqual({});
    expect(ownerScope(admin, 'memberId', { bypass: 'analytics.view' })).toEqual(
      {},
    );
    expect(ownerScope(admin, 'memberId')).toEqual({ memberId: 'member-1' });
  });

  it('assertFound throws a coded 404 for null and undefined only', () => {
    expect(() => assertFound(null, 'Call')).toThrow('Call not found');
    expect(() => assertFound(undefined)).toThrow(NotFoundException);
    expect(assertFound(0)).toBe(0);
  });
});
