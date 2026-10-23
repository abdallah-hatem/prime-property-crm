import { put } from '@vercel/blob/client';
import { listingPhotoPathname, type Photo } from '@prime-crm/shared';
import { REGISTER_LISTING_PHOTO, REQUEST_LISTING_PHOTO_TOKEN } from '@/apis';
import type { ApiFailure, ApiUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';

/** Listing photos are shown by URL on every screen, so the store is public. */
const PHOTO_ACCESS = 'public';

export type UploadOutcome =
  | { ok: true; photo: Photo }
  | { ok: false; failure: ApiFailure | ApiUnauthorized | null };

/**
 * One photo into the listing's Blob folder, straight from the browser: the API signs a client
 * token for this file (`POST /uploads/listing-photo`, via a server action — the browser never
 * holds the session), the file goes to Blob with progress, then `POST /listings/:id/photos`
 * registers it. Without a Blob token on the server the first step fails with
 * UPLOADS_NOT_CONFIGURED and nothing is sent.
 */
export async function uploadListingPhoto(
  listingId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadOutcome> {
  const pathname = listingPhotoPathname(listingId, file.name);
  const token = await callApi(
    REQUEST_LISTING_PHOTO_TOKEN(listingId, pathname),
    {
      showErrorToast: false,
    },
  );
  if (!token.success) return { ok: false, failure: token };

  let blob: { url: string; pathname: string };
  try {
    blob = await put(pathname, file, {
      access: PHOTO_ACCESS,
      token: token.data.clientToken,
      contentType: file.type,
      onUploadProgress: ({ percentage }) => onProgress(percentage),
    });
  } catch {
    return { ok: false, failure: null };
  }
  onProgress(100);

  const registered = await callApi(
    REGISTER_LISTING_PHOTO(listingId, {
      url: blob.url,
      pathname: blob.pathname,
    }),
    { showErrorToast: false },
  );
  if (!registered.success) return { ok: false, failure: registered };
  return { ok: true, photo: registered.data };
}
