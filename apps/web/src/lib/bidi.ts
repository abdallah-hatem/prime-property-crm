/** First-strong isolate … pop directional isolate (Unicode TR9). */
const FSI = '⁨';
const PDI = '⁩';

/**
 * Wraps a value a person typed before it goes into a translated sentence (a string, so `<bdi>`
 * can't be used): "إيقاف Smoke Agent: وانتقل عمله إلى Sara Mahmoud" keeps each name in one piece
 * and the Arabic sentence's punctuation where it belongs. Empty stays empty.
 */
export const isolate = (text: string): string =>
  text ? `${FSI}${text}${PDI}` : text;
