import { PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES } from '@prime-crm/shared';

/**
 * Getting a picked file ready for upload, in the browser: iPhone HEIC/HEIF becomes JPEG (the
 * converter is loaded only when such a file shows up), anything longer than 2560 px on its long
 * side is scaled down, and what's left must be JPEG, PNG or WebP under 10 MB.
 */
export const PHOTO_LONG_SIDE_MAX = 2560;
const JPEG_QUALITY = 0.88;

const HEIC_TYPES = ['image/heic', 'image/heif'];
const HEIC_NAME = /\.(heic|heif)$/i;

export const PHOTO_ACCEPT = [
  ...PHOTO_CONTENT_TYPES,
  ...HEIC_TYPES,
  '.heic',
  '.heif',
].join(',');

export const isHeic = (file: File): boolean =>
  HEIC_TYPES.includes(file.type.toLowerCase()) || HEIC_NAME.test(file.name);

export const isAcceptedType = (file: File): boolean =>
  (PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type) ||
  isHeic(file);

const renamed = (name: string, extension: string) =>
  `${name.replace(/\.[^.]+$/, '') || 'photo'}.${extension}`;

/** HEIC/HEIF → JPEG with heic2any, loaded on demand (it is large and browser-only). */
export async function convertHeic(file: File): Promise<File> {
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: JPEG_QUALITY,
  });
  const blob = Array.isArray(out) ? out[0] : out;
  return new File([blob], renamed(file.name, 'jpg'), { type: 'image/jpeg' });
}

/** Scale down to PHOTO_LONG_SIDE_MAX on the long side; smaller photos pass through untouched. */
export async function resizeToLongSide(
  file: File,
  max = PHOTO_LONG_SIDE_MAX,
): Promise<File> {
  if (
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined'
  )
    return file;
  const bitmap = await createImageBitmap(file);
  try {
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (longSide <= max) return file;
    const scale = max / longSide;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // PNG keeps its transparency; everything else is re-encoded as JPEG.
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, JPEG_QUALITY),
    );
    if (!blob) return file;
    return new File(
      [blob],
      type === 'image/png' ? file.name : renamed(file.name, 'jpg'),
      { type },
    );
  } finally {
    bitmap.close();
  }
}

export type PrepareResult =
  { ok: true; file: File } | { ok: false; reason: 'wrongType' | 'tooLarge' };

/** Every step for one file; `onStage` reports what's happening so the row can say it. */
export async function preparePhoto(
  file: File,
  onStage: (stage: 'converting' | 'preparing') => void = () => {},
): Promise<PrepareResult> {
  if (!isAcceptedType(file)) return { ok: false, reason: 'wrongType' };
  let ready = file;
  if (isHeic(ready)) {
    onStage('converting');
    ready = await convertHeic(ready);
  }
  onStage('preparing');
  try {
    ready = await resizeToLongSide(ready);
  } catch {
    // A file the browser can't decode is uploaded as is; the store checks its type again.
  }
  if (ready.size > PHOTO_MAX_BYTES) return { ok: false, reason: 'tooLarge' };
  return { ok: true, file: ready };
}
