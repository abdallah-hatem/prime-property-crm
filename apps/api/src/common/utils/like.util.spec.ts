import { escapeLike } from './like.util';

describe('escapeLike', () => {
  it('escapes %, _ and the backslash; leaves everything else', () => {
    expect(escapeLike('100%')).toBe(String.raw`100\%`);
    expect(escapeLike('a_b')).toBe(String.raw`a\_b`);
    expect(escapeLike(String.raw`C:\x`)).toBe(String.raw`C:\\x`);
    expect(escapeLike(`O'Brien "q" سارة`)).toBe(`O'Brien "q" سارة`);
    expect(escapeLike('')).toBe('');
  });
});
