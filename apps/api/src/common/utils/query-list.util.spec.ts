import { escapeLike } from './like.util';
import { pageWindow, toPage } from './pagination.util';
import { toBoolean, toList, trimString } from './query-list.util';

describe('like.util', () => {
  it('escapes %, _ and the backslash so search text matches literally', () => {
    expect(escapeLike('100% a_b \\')).toBe('100\\% a\\_b \\\\');
  });
});

describe('pagination.util', () => {
  it('caps the limit and computes skip', () => {
    expect(pageWindow(3, 50)).toEqual({
      page: 3,
      limit: 20,
      skip: 40,
      take: 20,
    });
    expect(pageWindow(1, 50, 100)).toMatchObject({ limit: 50 });
    expect(pageWindow(0, 0)).toMatchObject({ page: 1, limit: 1 });
  });

  it('builds the page meta', () => {
    expect(toPage([1], 3, { page: 2, limit: 1 })).toEqual({
      data: [1],
      total: 3,
      page: 2,
      limit: 1,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });
});

describe('query-list.util', () => {
  it('reads repeated and comma lists', () => {
    expect(toList('A, B')).toEqual(['A', 'B']);
    expect(toList(['A', 'B,C'])).toEqual(['A', 'B', 'C']);
    expect(toList('')).toBeUndefined();
  });

  it('reads booleans and trims strings, leaving other values for the validators', () => {
    expect(toBoolean('true')).toBe(true);
    expect(toBoolean('false')).toBe(false);
    expect(toBoolean('yes')).toBe('yes');
    expect(trimString('  x ')).toBe('x');
    expect(trimString(5)).toBe(5);
  });
});
