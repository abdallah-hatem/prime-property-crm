import { describe, expect, it } from 'vitest';
import { createTranslator, formatMessage } from './translate';

const DAYS_EN = '{count, plural, one {# day left} other {# days left}}';
const DAYS_AR =
  '{count, plural, zero {لا أيام} one {يوم واحد} two {يومان} few {# أيام} many {# يومًا} other {# يوم}}';

describe('plural messages', () => {
  it('English: one and other', () => {
    expect(formatMessage(DAYS_EN, { count: 1 }, 'en')).toBe('1 day left');
    expect(formatMessage(DAYS_EN, { count: 0 }, 'en')).toBe('0 days left');
    expect(formatMessage(DAYS_EN, { count: 2 }, 'en')).toBe('2 days left');
    // Grouped like every number on screen, from a number or an already formatted string.
    expect(formatMessage(DAYS_EN, { count: 1284 }, 'en')).toBe(
      '1,284 days left',
    );
    expect(formatMessage(DAYS_EN, { count: '1,284' }, 'en')).toBe(
      '1,284 days left',
    );
  });

  it('Arabic: zero, one, two, few, many and other', () => {
    const say = (count: number) => formatMessage(DAYS_AR, { count }, 'ar');
    expect(say(0)).toBe('لا أيام');
    expect(say(1)).toBe('يوم واحد');
    expect(say(2)).toBe('يومان');
    expect(say(3)).toBe('3 أيام');
    expect(say(10)).toBe('10 أيام');
    expect(say(11)).toBe('11 يومًا');
    expect(say(99)).toBe('99 يومًا');
    expect(say(100)).toBe('100 يوم');
    expect(say(103)).toBe('103 أيام');
  });

  it('an exact =N branch wins over the category, and missing categories fall back to other', () => {
    const text = '{n, plural, =0 {none yet} one {# item} other {# items}}';
    expect(formatMessage(text, { n: 0 }, 'en')).toBe('none yet');
    // Arabic "two" has no branch here: other.
    expect(formatMessage(text, { n: 2 }, 'ar')).toBe('2 items');
  });

  it('keeps placeholders inside a branch and around the block', () => {
    const text =
      'Hi {name}: {moved, plural, one {moved # owner to {to}} other {moved # owners to {to}}}.';
    expect(
      formatMessage(text, { name: 'Sara', moved: 1, to: 'Omar' }, 'en'),
    ).toBe('Hi Sara: moved 1 owner to Omar.');
    expect(
      formatMessage(text, { name: 'Sara', moved: 7, to: 'Omar' }, 'en'),
    ).toBe('Hi Sara: moved 7 owners to Omar.');
  });

  it('leaves the block as written when the count is missing or not a number', () => {
    expect(formatMessage(DAYS_EN, { count: 'many' }, 'en')).toBe(DAYS_EN);
    expect(formatMessage(DAYS_EN, { other: 1 }, 'en')).toBe(DAYS_EN);
  });

  it('the locale files use it: one owner, 1,284 owners, Arabic dual', () => {
    const en = createTranslator('en');
    const ar = createTranslator('ar');
    expect(en('ownersAdmin.total', { total: 1 })).toBe('1 owner');
    expect(en('ownersAdmin.total', { total: '1,284' })).toBe('1,284 owners');
    expect(ar('ownersAdmin.total', { total: 2 })).toBe('مالكان');
    expect(ar('ownersAdmin.total', { total: 5 })).toBe('5 ملاك');
    expect(en('admin.trash.daysLeft', { count: 1 })).toBe('1 day left');
  });
});
