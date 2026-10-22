import {
  cairoDateOf,
  cairoDateRange,
  cairoDayRange,
  cairoDaysInRange,
  cairoToday,
  isCalendarDate,
  rangeBound,
  startOfCairoDay,
} from './cairo-date.util';

const HOUR = 3_600_000;
const iso = (d: Date) => d.toISOString();

describe('Cairo date helpers', () => {
  it('starts a winter day at 22:00 UTC the evening before (UTC+2)', () => {
    expect(iso(startOfCairoDay('2026-01-15'))).toBe('2026-01-14T22:00:00.000Z');
  });

  it('starts a summer day at 21:00 UTC the evening before (UTC+3)', () => {
    expect(iso(startOfCairoDay('2026-07-01'))).toBe('2026-06-30T21:00:00.000Z');
  });

  it('handles the spring-forward day (midnight does not exist; the day has 23 h)', () => {
    // Last Friday of April 2026: 00:00 jumps to 01:00.
    const day = cairoDayRange('2026-04-24');
    expect(iso(day.start)).toBe('2026-04-23T22:00:00.000Z');
    expect(day.end.getTime() - day.start.getTime()).toBe(23 * HOUR);
    expect(cairoDayRange('2026-04-23').end).toEqual(day.start);
  });

  it('handles the fall-back day (the day has 25 h)', () => {
    // Last Thursday of October 2026: 24:00 goes back to 23:00.
    const day = cairoDayRange('2026-10-29');
    expect(iso(day.start)).toBe('2026-10-28T21:00:00.000Z');
    expect(iso(day.end)).toBe('2026-10-29T22:00:00.000Z');
    expect(day.end.getTime() - day.start.getTime()).toBe(25 * HOUR);
  });

  it('"today" follows the Cairo calendar, not UTC', () => {
    // 21:30 UTC on 22 Oct is 00:30 on 23 Oct in Cairo (UTC+3).
    const now = new Date('2026-10-22T21:30:00.000Z');
    expect(cairoDateOf(now)).toBe('2026-10-23');
    const today = cairoToday(now);
    expect(iso(today.start)).toBe('2026-10-22T21:00:00.000Z');
    expect(iso(today.end)).toBe('2026-10-23T21:00:00.000Z');
    expect(now >= today.start && now < today.end).toBe(true);
  });

  it('a date range runs from the start of `from` to the start of the day after `to`', () => {
    const range = cairoDateRange('2026-10-01', '2026-10-31');
    expect(iso(range.start)).toBe('2026-09-30T21:00:00.000Z');
    expect(iso(range.end)).toBe('2026-10-31T22:00:00.000Z');
    const oneDay = cairoDateRange('2026-10-22', '2026-10-22');
    expect(oneDay).toEqual(cairoDayRange('2026-10-22'));
  });

  it('refuses a range that ends before it starts', () => {
    expect(() => cairoDateRange('2026-10-22', '2026-10-21')).toThrow(
      RangeError,
    );
  });

  it('counts the days in a range, both ends included', () => {
    expect(cairoDaysInRange('2026-10-22', '2026-10-22')).toBe(1);
    expect(cairoDaysInRange('2026-01-01', '2026-12-31')).toBe(365);
    expect(cairoDaysInRange('2028-01-01', '2028-12-31')).toBe(366);
  });

  it('accepts only real calendar dates', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('22-10-2026')).toBe(false);
    expect(() => startOfCairoDay('2026-02-30')).toThrow(RangeError);
  });

  it('reads a filter bound as a Cairo day or as an instant', () => {
    expect(iso(rangeBound('2026-10-22', 'from'))).toBe(
      '2026-10-21T21:00:00.000Z',
    );
    expect(iso(rangeBound('2026-10-22', 'to'))).toBe(
      '2026-10-22T21:00:00.000Z',
    );
    expect(iso(rangeBound('2026-10-22T10:00:00Z', 'to'))).toBe(
      '2026-10-22T10:00:00.000Z',
    );
    expect(() => rangeBound('yesterday', 'from')).toThrow(RangeError);
  });
});
