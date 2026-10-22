import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import {
  adChange,
  addDays,
  canManage,
  canSeePhone,
  checkInRefusal,
  listingOrder,
  statusEffects,
} from './listings.pure';

const member = (id: string, permissions: string[] = []): CurrentUser =>
  ({ id, roleId: 'r', permissions, isAdmin: false }) as CurrentUser;
const admin: CurrentUser = {
  id: 'adm',
  roleId: 'a',
  permissions: [],
  isAdmin: true,
};
const NOW = new Date('2026-10-22T09:00:00.000Z');
const LINK = 'https://pf.example/1';

describe('listings.pure', () => {
  describe('phone and change rights', () => {
    it('Member searches listings → sees all Available listings, `ownerPhone` null + hidden for listings not assigned to them (invariant: phone hidden)', () => {
      expect(canSeePhone({ assignedToId: 'b' }, member('a'))).toBe(false);
      expect(canSeePhone({ assignedToId: null }, member('a'))).toBe(false);
    });

    it('Assigned member and admin see the phone (business rule)', () => {
      expect(canSeePhone({ assignedToId: 'a' }, member('a'))).toBe(true);
      expect(canSeePhone({ assignedToId: 'b' }, admin)).toBe(true);
      expect(
        canSeePhone({ assignedToId: 'b' }, member('x', ['listings.manageAll'])),
      ).toBe(true);
    });

    it('Member edits a listing not assigned to them → 403 (role)', () => {
      expect(canManage({ assignedToId: 'b' }, member('a'))).toBe(false);
      expect(
        canManage({ assignedToId: 'b' }, member('a', ['owners.viewAll'])),
      ).toBe(false);
    });
  });

  describe('status effects', () => {
    const none = { takeDown: false, checkIn: false };

    it('Status → SOLD/RENTED/OFF_MARKET while LIVE → AD_TAKE_DOWN task created once (not twice on a second status change) (business + checklist: duplicates)', () => {
      for (const to of ['SOLD', 'RENTED', 'OFF_MARKET'] as const) {
        expect(statusEffects('AVAILABLE', to, 'LIVE', none).openTakeDown).toBe(
          true,
        );
        // A second change (already off Available) opens nothing.
        expect(statusEffects(to, 'RENTED', 'LIVE', none).openTakeDown).toBe(
          false,
        );
        // An open task is never doubled.
        expect(
          statusEffects('AVAILABLE', to, 'LIVE', { ...none, takeDown: true })
            .openTakeDown,
        ).toBe(false);
      }
    });

    it('Status change when ad NOT_POSTED → no take-down task (business)', () => {
      expect(
        statusEffects('AVAILABLE', 'SOLD', 'NOT_POSTED', none).openTakeDown,
      ).toBe(false);
    });

    it('Status OFF_MARKET with ad NOT_POSTED or TAKEN_DOWN → no task (business)', () => {
      for (const ad of ['NOT_POSTED', 'TAKEN_DOWN'] as const) {
        expect(statusEffects('AVAILABLE', 'OFF_MARKET', ad, none)).toEqual({
          closeCheckIn: true,
          openTakeDown: false,
          scheduleCheckIn: false,
        });
      }
    });

    it('Listing leaving AVAILABLE closes its open check-in (business: no check-ins after sale)', () => {
      expect(
        statusEffects('AVAILABLE', 'SOLD', 'LIVE', none).closeCheckIn,
      ).toBe(true);
      expect(statusEffects('SOLD', 'RENTED', 'LIVE', none).closeCheckIn).toBe(
        false,
      );
    });

    it('back to Available with a Live ad resumes check-ins, unless one is open', () => {
      expect(
        statusEffects('SOLD', 'AVAILABLE', 'LIVE', none).scheduleCheckIn,
      ).toBe(true);
      expect(
        statusEffects('SOLD', 'AVAILABLE', 'LIVE', { ...none, checkIn: true })
          .scheduleCheckIn,
      ).toBe(false);
      expect(
        statusEffects('SOLD', 'AVAILABLE', 'TAKEN_DOWN', none).scheduleCheckIn,
      ).toBe(false);
    });
  });

  describe('ad changes', () => {
    const available = {
      status: 'AVAILABLE' as const,
      adStatus: 'NOT_POSTED' as const,
      adLink: null,
    };

    it('Ad → LIVE without link → 400 AD_LINK_REQUIRED; on a non-AVAILABLE listing → 400 (business: Live only when Available)', () => {
      expect(adChange(available, { status: 'LIVE' }, NOW)).toMatchObject({
        kind: 'refused',
        error: 'AD_LINK_REQUIRED',
      });
      expect(
        adChange(available, { status: 'LIVE', link: null }, NOW),
      ).toMatchObject({ kind: 'refused', error: 'AD_LINK_REQUIRED' });
      expect(
        adChange(
          { ...available, status: 'SOLD' },
          { status: 'LIVE', link: LINK },
          NOW,
        ),
      ).toMatchObject({ kind: 'refused', error: 'LISTING_NOT_AVAILABLE' });
      // The stored link is enough.
      expect(
        adChange({ ...available, adLink: LINK }, { status: 'LIVE' }, NOW).kind,
      ).toBe('ok');
    });

    it('Ad → LIVE creates one AD_CHECK_IN due now + interval days (business: weekly check-in)', () => {
      expect(
        adChange(available, { status: 'LIVE', link: LINK }, NOW),
      ).toMatchObject({ kind: 'ok', scheduleCheckIn: true, postedAt: NOW });
      // Saving an already Live ad schedules nothing more.
      expect(
        adChange(
          { ...available, adStatus: 'LIVE', adLink: LINK },
          { status: 'LIVE', link: 'https://pf.example/2' },
          NOW,
        ),
      ).toMatchObject({
        kind: 'ok',
        scheduleCheckIn: false,
        postedAt: undefined,
      });
      expect(addDays(NOW, 7).toISOString()).toBe('2026-10-29T09:00:00.000Z');
    });

    it('Ad → TAKEN_DOWN closes the take-down task and any open check-in (business)', () => {
      expect(
        adChange(
          { status: 'SOLD', adStatus: 'LIVE', adLink: LINK },
          { status: 'TAKEN_DOWN' },
          NOW,
        ),
      ).toMatchObject({
        kind: 'ok',
        close: ['AD_TAKE_DOWN', 'AD_CHECK_IN'],
        takenDownAt: NOW,
        link: LINK,
      });
    });

    it('Not posted stops check-ins only; a take-down task stays until Taken down', () => {
      expect(
        adChange(
          { status: 'SOLD', adStatus: 'LIVE', adLink: LINK },
          { status: 'NOT_POSTED' },
          NOW,
        ),
      ).toMatchObject({ kind: 'ok', close: ['AD_CHECK_IN'], postedAt: null });
    });
  });

  describe('check-in', () => {
    it('Check-in when ad not LIVE → 400 (contract)', () => {
      expect(
        checkInRefusal({ status: 'AVAILABLE', adStatus: 'NOT_POSTED' })?.error,
      ).toBe('AD_NOT_LIVE');
      expect(
        checkInRefusal({ status: 'AVAILABLE', adStatus: 'TAKEN_DOWN' })?.error,
      ).toBe('AD_NOT_LIVE');
      expect(checkInRefusal({ status: 'SOLD', adStatus: 'LIVE' })?.error).toBe(
        'LISTING_NOT_AVAILABLE',
      );
      expect(
        checkInRefusal({ status: 'AVAILABLE', adStatus: 'LIVE' }),
      ).toBeNull();
    });
  });

  it('sorts: newest by default, price both ways, largest first; ties by id', () => {
    expect(listingOrder(undefined)).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
    expect(listingOrder('priceAsc')[0]).toEqual({ price: 'asc' });
    expect(listingOrder('priceDesc')[0]).toEqual({ price: 'desc' });
    expect(listingOrder('sizeDesc')[0]).toEqual({ sizeSqm: 'desc' });
  });
});
