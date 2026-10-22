// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { acceptMobileChange } from './phone-input';
import { adminRoutesFor, canOpen, loginUrlFor, safeReturnPath } from './routes';

describe('safeReturnPath', () => {
  it('follows only paths on this site', () => {
    expect(safeReturnPath('/owners?page=2')).toBe('/owners?page=2');
    for (const unsafe of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      'owners',
      '',
      null,
    ])
      expect(safeReturnPath(unsafe)).toBeNull();
    // Never back to the login page itself.
    expect(safeReturnPath('/login?next=/x')).toBeNull();
  });

  it('builds the login URL with the return path', () => {
    expect(loginUrlFor('/')).toBe('/login');
    expect(loginUrlFor('//evil.test')).toBe('/login');
    expect(loginUrlFor('/listings?q=villa')).toBe(
      '/login?next=%2Flistings%3Fq%3Dvilla',
    );
  });
});

describe('route permissions', () => {
  it('opens admin pages by permission, everything else to any signed-in user', () => {
    expect(canOpen('/today', [])).toBe(true);
    expect(canOpen('/users/123', [])).toBe(false);
    expect(canOpen('/users/123', ['users.manage'])).toBe(true);
    // A custom role (Team lead: assign + analytics) sees only the analytics link.
    expect(
      adminRoutesFor(['owners.assign', 'analytics.view']).map((r) => r.href),
    ).toEqual(['/analytics']);
  });
});

describe('Egyptian mobile typing', () => {
  it('takes digits on the way to 01XXXXXXXXX', () => {
    expect(acceptMobileChange('0')).toBe('0');
    expect(acceptMobileChange('0101')).toBe('0101');
    expect(acceptMobileChange('01012345678')).toBe('01012345678');
    expect(acceptMobileChange('')).toBe('');
  });

  it('rejects a 12th digit, letters and an impossible prefix', () => {
    expect(acceptMobileChange('010123456789')).toBeNull();
    expect(acceptMobileChange('02')).toBeNull();
    expect(acceptMobileChange('1')).toBeNull();
    // Letters are dropped, not entered.
    expect(acceptMobileChange('01a')).toBe('01');
  });

  it('normalises a pasted +20 / 0020 number', () => {
    expect(acceptMobileChange('+20 10 1234 5678')).toBe('01012345678');
    expect(acceptMobileChange('0020 1012345678')).toBe('01012345678');
  });
});
