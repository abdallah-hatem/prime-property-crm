import { listingPhotoFolder } from '@prime-crm/shared';

/**
 * Why a photo URL can't be registered on a listing, or null when it can. The URL must be an
 * https file on our Blob store (`hosts`), with no credentials or port, and its path must be
 * the given `pathname`, a single file directly in the listing's folder (`listings/<id>/`).
 * Anything else could point a listing at someone else's file or another listing's photo.
 */
export function photoUrlProblem(
  url: string,
  pathname: string,
  listingId: string,
  hosts: readonly string[],
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'The photo URL is not a URL';
  }
  if (parsed.protocol !== 'https:') return 'The photo URL must be https';
  if (parsed.username || parsed.password || parsed.port) {
    return 'The photo URL must not carry credentials or a port';
  }
  if (!hosts.includes(parsed.hostname.toLowerCase())) {
    return 'The photo must be on our photo store';
  }
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname).replace(/^\//, '');
  } catch {
    return 'The photo URL path is malformed';
  }
  if (path !== pathname) return 'The photo URL does not match its pathname';
  const folder = listingPhotoFolder(listingId);
  const file = pathname.slice(folder.length);
  if (!pathname.startsWith(folder) || !file || file.includes('/')) {
    return 'The photo is not in this listing’s folder';
  }
  return null;
}

/** True when `ids` is exactly the set `current` (same size, no duplicates, nothing foreign). */
export function isSameSet(ids: readonly string[], current: readonly string[]) {
  const wanted = new Set(ids);
  return (
    wanted.size === ids.length &&
    ids.length === current.length &&
    current.every((id) => wanted.has(id))
  );
}
