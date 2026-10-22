import { z } from 'zod';

/**
 * Listing photos (spec, "Photos"). Files go straight from the browser to Vercel Blob (client
 * upload): `POST /uploads/listing-photo` hands out the upload token, then
 * `POST /listings/:id/photos` registers the uploaded file.
 */

/** A listing holds at most this many live photos. */
export const LISTING_PHOTOS_MAX = 30;
/** Largest photo the upload token allows (10 MB). */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const PHOTO_URL_MAX_LENGTH = 2000;
export const PHOTO_PATHNAME_MAX_LENGTH = 500;

/** Domain error codes of the photo endpoints. */
export const PhotoErrorCode = {
  /** The listing already has LISTING_PHOTOS_MAX photos. */
  TOO_MANY_PHOTOS: 'TOO_MANY_PHOTOS',
  /** The URL is not a file of this listing on our Blob store. */
  PHOTO_URL_INVALID: 'PHOTO_URL_INVALID',
  /** A reorder must list every live photo of the listing exactly once. */
  PHOTO_SET_MISMATCH: 'PHOTO_SET_MISMATCH',
  /** The upload handshake: a pathname outside the listing's folder or an unknown event. */
  UPLOAD_REFUSED: 'UPLOAD_REFUSED',
  /** Photo uploads are not configured on this server (no Blob token). */
  UPLOADS_NOT_CONFIGURED: 'UPLOADS_NOT_CONFIGURED',
} as const;
export type PhotoErrorCode =
  (typeof PhotoErrorCode)[keyof typeof PhotoErrorCode];

/** Every photo of a listing is uploaded under `listings/<listingId>/`. */
export function listingPhotoFolder(listingId: string): string {
  return `listings/${listingId}/`;
}

/** The Blob pathname to upload a file to: `listings/<listingId>/<file name>`. */
export function listingPhotoPathname(
  listingId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${listingPhotoFolder(listingId)}${safe || 'photo'}`;
}

/** `clientPayload` of the upload (a JSON string on the wire). */
export const ListingPhotoUploadPayloadSchema = z.strictObject({
  listingId: z.uuid(),
});
export type ListingPhotoUploadPayload = z.infer<
  typeof ListingPhotoUploadPayloadSchema
>;

/**
 * The body `upload()` from `@vercel/blob/client` posts to `POST /uploads/listing-photo`: the
 * token request. Upload-completed callbacks are not used (photos are registered explicitly).
 */
export const ListingPhotoUploadRequestSchema = z.strictObject({
  type: z.literal('blob.generate-client-token'),
  payload: z.strictObject({
    pathname: z.string().min(1).max(PHOTO_PATHNAME_MAX_LENGTH),
    /** JSON of ListingPhotoUploadPayload; the client omits it when not given. */
    clientPayload: z.string().max(1000).nullable().optional(),
    /** The client omits it unless multipart was asked for. */
    multipart: z.boolean().optional(),
  }),
});
export type ListingPhotoUploadRequest = z.infer<
  typeof ListingPhotoUploadRequestSchema
>;

/** The handshake's answer (not enveloped: the Blob client reads it as is). */
export const ListingPhotoUploadResponseSchema = z.object({
  type: z.literal('blob.generate-client-token'),
  clientToken: z.string(),
});

/** `POST /listings/:id/photos`: the uploaded blob's `url` and `pathname`. */
export const RegisterPhotoRequestSchema = z.strictObject({
  url: z.url({ protocol: /^https$/ }).max(PHOTO_URL_MAX_LENGTH),
  pathname: z.string().min(1).max(PHOTO_PATHNAME_MAX_LENGTH),
});
export type RegisterPhotoRequest = z.infer<typeof RegisterPhotoRequestSchema>;

/** `PUT /listings/:id/photos/order`: every live photo id, in the new order. */
export const ReorderPhotosRequestSchema = z.strictObject({
  photoIds: z
    .array(z.uuid())
    .min(1)
    .max(LISTING_PHOTOS_MAX)
    .refine((ids) => new Set(ids).size === ids.length, 'ids must be distinct'),
});
export type ReorderPhotosRequest = z.infer<typeof ReorderPhotosRequestSchema>;

export const PhotoSchema = z.object({
  id: z.uuid(),
  url: z.string(),
  /** 0-based display position; 0 is the cover. */
  order: z.number().int(),
});
export type Photo = z.infer<typeof PhotoSchema>;
