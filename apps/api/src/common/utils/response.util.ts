import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@prime-crm/shared';
import type {
  ApiResponse,
  Meta,
  Paginated,
} from '../interfaces/api-response.interface';

/** Builders so no route hand-writes the envelope. */
export class ResponseUtil {
  static success<T>(
    data: T,
    message = 'Operation successful',
    statusCode: number = HttpStatus.OK,
    path?: string,
    meta?: Meta,
  ): ApiResponse<T> {
    return {
      success: true,
      message,
      statusCode,
      data,
      timestamp: new Date().toISOString(),
      path,
      meta,
    };
  }

  /** A paginated list: rows in `data`, the rest of the page in `meta`. */
  static paginated<T>(
    { data, ...meta }: Paginated<T>,
    message = 'Data retrieved successfully',
  ): ApiResponse<T[]> {
    return this.success(data, message, HttpStatus.OK, undefined, meta);
  }

  /** `data` carries structured detail for a domain error, e.g. `{ ownerId }` on PHONE_EXISTS. */
  static error(
    message = 'Operation failed',
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    error?: string,
    path?: string,
    data?: unknown,
  ): ApiResponse {
    return {
      success: false,
      message,
      statusCode,
      error,
      timestamp: new Date().toISOString(),
      path,
      ...(data === undefined ? {} : { data }),
    };
  }

  static created<T>(
    data: T,
    message = 'Resource created successfully',
    path?: string,
  ) {
    return this.success(data, message, HttpStatus.CREATED, path);
  }

  static deleted(message = 'Resource deleted successfully', path?: string) {
    return this.success(null, message, HttpStatus.OK, path);
  }

  static notFound(message = 'Resource not found', path?: string) {
    return this.error(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, path);
  }

  static unauthorized(message = 'Unauthorized access', path?: string) {
    return this.error(
      message,
      HttpStatus.UNAUTHORIZED,
      ErrorCode.UNAUTHORIZED,
      path,
    );
  }

  static forbidden(message = 'Forbidden access', path?: string) {
    return this.error(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, path);
  }

  static conflict(
    message = 'Resource conflict',
    error: string = ErrorCode.CONFLICT,
    path?: string,
  ) {
    return this.error(message, HttpStatus.CONFLICT, error, path);
  }
}
