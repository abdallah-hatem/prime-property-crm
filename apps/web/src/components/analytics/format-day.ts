import type { Locale } from '@prime-crm/shared';
import { fromCairo, type CairoDay } from '@/lib/cairo-time';
import { BUSINESS_TIME_ZONE, formatDate } from '@/lib/format';

const shortFormats = new Map<Locale, Intl.DateTimeFormat>();

/** `23 Oct` / `23 أكتوبر`: a Cairo day for chart axes and tooltips (Latin digits). */
export function shortDay(day: CairoDay, locale: Locale): string {
  let format = shortFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(
      locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB',
      { day: 'numeric', month: 'short', timeZone: BUSINESS_TIME_ZONE },
    );
    shortFormats.set(locale, format);
  }
  return format.format(fromCairo(day, '12:00'));
}

/** `23 Oct 2026` for one day, `1 Oct 2026 – 23 Oct 2026` for a range. */
export function rangeLabel(from: CairoDay, to: CairoDay, locale: Locale) {
  const long = (day: CairoDay) =>
    formatDate(fromCairo(day, '12:00'), locale, 'date');
  return from === to ? long(from) : `${long(from)} – ${long(to)}`;
}
