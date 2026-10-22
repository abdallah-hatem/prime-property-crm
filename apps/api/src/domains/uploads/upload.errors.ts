import { ServiceUnavailableException } from '@nestjs/common';
import { PhotoErrorCode } from '@prime-crm/shared';

/** No Blob token or store host on this server: photo uploads can't work (503). */
export function uploadsNotConfigured(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: 'Photo uploads are not configured on this server',
    error: PhotoErrorCode.UPLOADS_NOT_CONFIGURED,
  });
}
