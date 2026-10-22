import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { IMPORT_MAX_BYTES, ImportErrorCode } from '@prime-crm/shared';
import { FileInterceptor } from '@nestjs/platform-express';
import { catchError, type Observable } from 'rxjs';

/** Multer, in memory, one `file` part of at most 4 MB (the rows go to the database). */
export const ImportFileUpload = FileInterceptor('file', {
  limits: { fileSize: IMPORT_MAX_BYTES, files: 1 },
});

/**
 * Multer answers an oversized file with 413; the contract says `400 FILE_TOO_LARGE`. Put it
 * before `ImportFileUpload` so it wraps it.
 */
@Injectable()
export class ImportFileErrors implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof PayloadTooLargeException) {
          throw new BadRequestException({
            message: `The file must be at most ${IMPORT_MAX_BYTES / 1024 / 1024} MB`,
            error: ImportErrorCode.FILE_TOO_LARGE,
          });
        }
        throw error;
      }),
    );
  }
}
