import { callRefusal, statusAfterOutcome } from './calls.pure';

describe('calls.pure', () => {
  describe('statusAfterOutcome', () => {
    it("Set outcome → owner status becomes the outcome's mapped status (business: outcome sets status)", () => {
      expect(statusAfterOutcome('NEW', 'INTERESTED', false)).toBe('INTERESTED');
      expect(statusAfterOutcome('CALL_BACK', 'CONTACTED', false)).toBe(
        'CONTACTED',
      );
      expect(statusAfterOutcome('CONTACTED', 'DO_NOT_CALL', false)).toBe(
        'DO_NOT_CALL',
      );
    });

    it("Outcome set on an older call after a newer call already has one → owner status keeps the newer call's status (business: latest call sets status)", () => {
      expect(statusAfterOutcome('INTERESTED', 'NOT_INTERESTED', true)).toBe(
        null,
      );
    });

    it('Outcome on a call whose owner became LISTED meanwhile → outcome saved, status stays LISTED (invariant: Listed only through a listing)', () => {
      expect(statusAfterOutcome('LISTED', 'CONTACTED', false)).toBe(null);
    });

    it('a Do not call owner stays Do not call (only the admin clears it)', () => {
      expect(statusAfterOutcome('DO_NOT_CALL', 'CONTACTED', false)).toBe(null);
    });

    it('no change when the status already matches', () => {
      expect(statusAfterOutcome('CONTACTED', 'CONTACTED', false)).toBe(null);
    });
  });

  it('Start a call on a DO_NOT_CALL owner → 409; on a LISTED owner → 409 (invariant)', () => {
    expect(callRefusal('DO_NOT_CALL')).toBe('DO_NOT_CALL');
    expect(callRefusal('LISTED')).toBe('OWNER_LISTED');
    for (const s of [
      'NEW',
      'CONTACTED',
      'INTERESTED',
      'NOT_INTERESTED',
      'CALL_BACK',
    ] as const) {
      expect(callRefusal(s)).toBe(null);
    }
  });
});
