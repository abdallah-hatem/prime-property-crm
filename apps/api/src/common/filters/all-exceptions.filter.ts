import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { ERROR_CODE_PATTERN, ErrorCode } from '@prime-crm/shared';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env.validation';
import { ResponseUtil } from '../utils/response.util';

type Normalized = {
  status: number;
  message: string;
  error: string;
  data?: unknown;
};

/** The stable code for an HttpException that didn't name its own. */
const CODE_BY_STATUS: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: ErrorCode.METHOD_NOT_ALLOWED,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.GONE]: ErrorCode.GONE,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
};

function codeForStatus(status: number): string {
  return (
    CODE_BY_STATUS[status] ??
    (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST)
  );
}

/**
 * Prisma's error classes are matched by name rather than `instanceof` so this file needs no
 * value import from @prisma/client (house lint: value imports only in repositories).
 */
function isPrismaKnownError(
  e: unknown,
): e is Prisma.PrismaClientKnownRequestError {
  return (
    e instanceof Error &&
    e.name === 'PrismaClientKnownRequestError' &&
    typeof (e as { code?: unknown }).code === 'string'
  );
}

function isPrismaValidationError(
  e: unknown,
): e is Prisma.PrismaClientValidationError {
  return e instanceof Error && e.name === 'PrismaClientValidationError';
}

/**
 * An error from Express middleware that ran before Nest (body-parser: 413 `entity.too.large`,
 * 400 for malformed JSON). They follow the `http-errors` shape: a 4xx `status` and
 * `expose: true` when the message is safe to show.
 */
function isClientHttpError(
  e: unknown,
): e is Error & { status: number; expose: true; type?: string } {
  if (!(e instanceof Error)) return false;
  const { status, expose } = e as { status?: unknown; expose?: unknown };
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    expose === true
  );
}

/**
 * Turns every thrown thing into the envelope, with `error` always a stable UPPER_SNAKE code.
 * Throw `new ConflictException({ message, error: 'EMAIL_TAKEN', data? })` for a domain code.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly production: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.production = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, message, error, data } = this.normalize(exception);

    // Only 5xx is our bug; 4xx is the caller's and would just be noise.
    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res
      .status(status)
      .json(ResponseUtil.error(message, status, error, req.url, data));
  }

  private normalize(exception: unknown): Normalized {
    if (exception instanceof HttpException) return this.fromHttp(exception);
    if (isPrismaKnownError(exception)) return this.fromPrisma(exception);
    if (isClientHttpError(exception)) {
      return {
        status: exception.status,
        message:
          exception.status === HttpStatus.PAYLOAD_TOO_LARGE
            ? 'The request body is too large'
            : exception.message,
        error: codeForStatus(exception.status),
      };
    }
    if (isPrismaValidationError(exception)) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid query',
        error: ErrorCode.BAD_REQUEST,
      };
    }

    // Unknown: never leak an internal message or stack in production.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        !this.production && exception instanceof Error
          ? exception.message
          : 'Internal server error',
      error: ErrorCode.INTERNAL_ERROR,
    };
  }

  private fromHttp(exception: HttpException): Normalized {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const fallbackCode = codeForStatus(status);

    if (typeof body !== 'object' || body === null) {
      return { status, message: exception.message, error: fallbackCode };
    }

    const b = body as Record<string, unknown>;
    const raw = b.message;
    // ValidationPipe returns message as string[]: join so the client shows one line.
    const message = Array.isArray(raw)
      ? raw.join(', ')
      : typeof raw === 'string'
        ? raw
        : exception.message;
    // Nest's own bodies carry a human phrase in `error` ("Not Found"); only a code passes.
    const error =
      typeof b.error === 'string' && ERROR_CODE_PATTERN.test(b.error)
        ? b.error
        : fallbackCode;

    return { status, message, error, data: b.data };
  }

  private fromPrisma(e: Prisma.PrismaClientKnownRequestError): Normalized {
    const target = Array.isArray(e.meta?.target)
      ? (e.meta.target as string[]).join(', ')
      : undefined;

    switch (e.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: target
            ? `${target} already exists`
            : 'Resource already exists',
          error: ErrorCode.UNIQUE_VIOLATION,
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Resource not found',
          error: ErrorCode.NOT_FOUND,
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Related resource does not exist',
          error: ErrorCode.FOREIGN_KEY_VIOLATION,
        };
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Operation would violate a required relation',
          error: ErrorCode.RELATION_VIOLATION,
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Database request failed',
          error: ErrorCode.DATABASE_ERROR,
        };
    }
  }
}
