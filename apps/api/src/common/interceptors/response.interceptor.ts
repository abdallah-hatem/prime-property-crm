import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';
import type { ApiResponse } from '../interfaces/api-response.interface';
import { ResponseUtil } from '../utils/response.util';

function isEnvelope(value: unknown): value is ApiResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    'message' in value
  );
}

function defaultMessage(method: string, statusCode: number): string {
  if (method === 'POST' && statusCode === 201)
    return 'Resource created successfully';
  if (method === 'PUT' || method === 'PATCH')
    return 'Resource updated successfully';
  if (method === 'DELETE') return 'Resource deleted successfully';
  if (method === 'GET') return 'Data retrieved successfully';
  return 'Operation successful';
}

/** Wraps whatever a controller returns in the envelope, except routes marked `@RawResponse()`. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T> | ApiResponse
> {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | ApiResponse> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const raw = this.reflector.getAllAndOverride<boolean | undefined>(
      RAW_RESPONSE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (raw) return next.handle() as Observable<ApiResponse<T>>;

    return next.handle().pipe(
      map((data) => {
        // Already enveloped (a route used ResponseUtil for a custom message or meta).
        if (isEnvelope(data)) {
          return { ...data, path: data.path ?? request.url };
        }
        const statusCode = response.statusCode;
        return ResponseUtil.success(
          data ?? null,
          defaultMessage(request.method, statusCode),
          statusCode,
          request.url,
        );
      }),
    );
  }
}
