import { describe, expect, it } from 'vitest';
import { normalizePhone, toE164 } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['01001234567', '+201001234567'],
    ['01112345678', '+201112345678'],
    ['01212345678', '+201212345678'],
    ['01512345678', '+201512345678'],
  ])('normalises the national mobile %s', (input, e164) => {
    expect(normalizePhone(input)).toEqual({ ok: true, e164 });
  });

  it('keeps an already international +20 mobile', () => {
    expect(toE164('+201001234567')).toBe('+201001234567');
  });

  it('turns a 0020 prefix into +20', () => {
    expect(toE164('00201001234567')).toBe('+201001234567');
  });

  it.each(['0100 123 4567', '0100-123-4567', '+20 100 123 4567', '(0100) 123.4567'])(
    'ignores spaces, dashes, dots and brackets in %s',
    (input) => {
      expect(toE164(input)).toBe('+201001234567');
    },
  );

  it('ignores the bidi marks an Arabic keyboard adds', () => {
    expect(toE164('‎0100 123 4567‏')).toBe('+201001234567');
  });

  it('rejects a mobile number with a 12th digit', () => {
    expect(normalizePhone('010012345678')).toEqual({ ok: false, reason: 'INVALID' });
    expect(normalizePhone('+2010012345678')).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('rejects a mobile number one digit short', () => {
    expect(normalizePhone('0100123456')).toEqual({ ok: false, reason: 'INVALID' });
  });

  it.each(['01312345678', '01412345678', '01912345678', '+201312345678'])(
    'rejects the impossible mobile prefix in %s',
    (input) => {
      expect(normalizePhone(input)).toEqual({ ok: false, reason: 'INVALID' });
    },
  );

  it('normalises a Cairo landline 02 to +202', () => {
    expect(toE164('02 2345 6789')).toBe('+20223456789');
  });

  it('normalises an Alexandria landline 03 to +203', () => {
    expect(toE164('03 456 7890')).toBe('+2034567890');
  });

  it('normalises a two-digit area code landline', () => {
    expect(toE164('040 123 4567')).toBe('+20401234567');
  });

  it.each([null, undefined, '', '   ', ' - '])('rejects empty input %j', (input) => {
    expect(normalizePhone(input)).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it.each(['abc', '0100abc4567', '1001234567', '+20', '++201001234567'])(
    'rejects malformed input %j',
    (input) => {
      expect(normalizePhone(input)).toEqual({ ok: false, reason: 'INVALID' });
    },
  );

  it('accepts a foreign E.164 number unchanged', () => {
    expect(toE164('+971 50 123 4567')).toBe('+971501234567');
  });

  it('rejects a foreign number that is too short to be E.164', () => {
    expect(toE164('+9711234')).toBeNull();
  });

  it('never loses the leading zero of a national number', () => {
    expect(toE164('01001234567')?.endsWith('1001234567')).toBe(true);
  });
});
