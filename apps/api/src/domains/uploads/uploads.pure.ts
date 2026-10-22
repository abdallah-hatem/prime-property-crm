import { listingPhotoFolder } from '@prime-crm/shared';

/**
 * Why an upload pathname is refused, or null: a listing photo goes directly into its
 * listing's folder (`listings/<id>/<file>`), one file name, no sub-folders or `..`.
 */
export function uploadRefusal(
  pathname: string,
  listingId: string,
): string | null {
  const folder = listingPhotoFolder(listingId);
  const file = pathname.startsWith(folder) ? pathname.slice(folder.length) : '';
  if (!file || /[/\\]/.test(file) || file === '..' || file === '.') {
    return `A listing photo must be uploaded to ${folder}<file name>`;
  }
  return null;
}
