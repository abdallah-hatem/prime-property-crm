import {
  CALLING_STATUS_ORDER,
  doNotCallChange,
  latinDigits,
  NEVER_IN_CALLING_LIST,
  ownerOrder,
  parseSearch,
} from './owners.pure';

describe('owners.pure', () => {
  describe('parseSearch', () => {
    it('empty or blank → no search', () => {
      expect(parseSearch(undefined)).toBeUndefined();
      expect(parseSearch('   ')).toBeUndefined();
    });

    it('a name is a name search only', () => {
      expect(parseSearch(' محمد ')).toEqual({
        text: 'محمد',
        phoneDigits: null,
      });
      expect(parseSearch('Ahmed 2')).toEqual({
        text: 'Ahmed 2',
        phoneDigits: null,
      });
    });

    it('Same phone typed two ways (`01001234567`, `+20 100 123 4567`) → treated as one (decision: normalisation)', () => {
      for (const q of [
        '01001234567',
        '+20 100 123 4567',
        '0020-100-123-4567',
        '(010) 0123 4567',
        '٠١٠٠١٢٣٤٥٦٧',
      ]) {
        expect(parseSearch(q)?.phoneDigits).toBe('1001234567');
      }
    });

    it('partial digits search inside phones; fewer than 3 digits do not', () => {
      expect(parseSearch('123 45')?.phoneDigits).toBe('12345');
      expect(parseSearch('01')?.phoneDigits).toBeNull();
      expect(parseSearch('+20')?.phoneDigits).toBeNull();
    });

    it('Arabic-Indic and Persian digits become Latin', () => {
      expect(latinDigits('٠١٢۳۴')).toBe('01234');
    });
  });

  describe('doNotCallChange', () => {
    it('`doNotCall: true` sets status DO_NOT_CALL; member can set it on own owner (business: Do not call flag)', () => {
      for (const status of [
        'NEW',
        'CONTACTED',
        'INTERESTED',
        'NOT_INTERESTED',
        'CALL_BACK',
      ] as const) {
        expect(doNotCallChange(status, true, false)).toEqual({
          kind: 'set',
          status: 'DO_NOT_CALL',
        });
      }
      expect(doNotCallChange('DO_NOT_CALL', true, false)).toEqual({
        kind: 'none',
      });
    });

    it('Member sets Do not call on own owner; member clearing Do not call → 403, admin can clear it to Contacted (business: Do not call flag)', () => {
      expect(doNotCallChange('DO_NOT_CALL', false, false)).toEqual({
        kind: 'forbidden',
      });
      expect(doNotCallChange('NEW', false, false)).toEqual({
        kind: 'forbidden',
      });
      expect(doNotCallChange('DO_NOT_CALL', false, true)).toEqual({
        kind: 'set',
        status: 'CONTACTED',
      });
      expect(doNotCallChange('NEW', false, true)).toEqual({ kind: 'none' });
    });

    it('a Listed owner is refused; no flag changes nothing', () => {
      expect(doNotCallChange('LISTED', true, true)).toEqual({ kind: 'listed' });
      expect(doNotCallChange('NEW', undefined, false)).toEqual({
        kind: 'none',
      });
    });
  });

  it('Calling list order: overdue reminder → due today → NEW → CALL_BACK → CONTACTED → INTERESTED → NOT_INTERESTED, oldest last call first (business: calling-list order)', () => {
    expect(CALLING_STATUS_ORDER).toEqual([
      'NEW',
      'CALL_BACK',
      'CONTACTED',
      'INTERESTED',
      'NOT_INTERESTED',
    ]);
  });

  it('Calling list excludes LISTED and DO_NOT_CALL owners (invariant)', () => {
    expect([...NEVER_IN_CALLING_LIST].sort()).toEqual([
      'DO_NOT_CALL',
      'LISTED',
    ]);
    for (const status of NEVER_IN_CALLING_LIST) {
      expect(CALLING_STATUS_ORDER).not.toContain(status);
    }
  });

  it('ownerOrder: newest first by default, name A–Z, last call newest with never-called last', () => {
    expect(ownerOrder(undefined)).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
    expect(ownerOrder('name')[0]).toEqual({ name: 'asc' });
    expect(ownerOrder('lastCall')[0]).toEqual({
      lastCallAt: { sort: 'desc', nulls: 'last' },
    });
  });
});
