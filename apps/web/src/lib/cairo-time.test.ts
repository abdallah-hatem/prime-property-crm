// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addDays, cairoInstant, fromCairo, toCairo } from './cairo-time';
import { formatPhone, lateness } from './format';

describe('Cairo time', () => {
  it('sends a Cairo wall-clock time with the offset of that day', () => {
    // Summer time (until the last Thursday of October) is +03:00, winter +02:00.
    expect(cairoInstant('2026-10-22', '10:00')).toBe(
      '2026-10-22T10:00:00+03:00',
    );
    expect(cairoInstant('2026-12-01', '10:00')).toBe(
      '2026-12-01T10:00:00+02:00',
    );
  });

  it('round-trips an instant through its Cairo day and time', () => {
    const at = new Date('2026-10-22T21:30:00Z');
    expect(toCairo(at)).toEqual({ day: '2026-10-23', time: '00:30' });
    expect(fromCairo('2026-10-23', '00:30').toISOString()).toBe(
      at.toISOString(),
    );
  });

  it('adds days across a month end', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });
});

describe('format', () => {
  it('shows Egyptian numbers the way people read them', () => {
    expect(formatPhone('+201055500010')).toBe('0105 550 0010');
    expect(formatPhone('+20223456789')).toBe('02 2345 6789');
    expect(formatPhone('+447700900123')).toBe('+447700900123');
  });

  it('says how late in minutes, hours or days', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    expect(lateness('2026-10-22T11:50:00Z', now)).toEqual({
      unit: 'minutes',
      value: 10,
    });
    expect(lateness('2026-10-22T09:00:00Z', now)).toEqual({
      unit: 'hours',
      value: 3,
    });
    expect(lateness('2026-10-20T11:00:00Z', now)).toEqual({
      unit: 'days',
      value: 2,
    });
  });
});
