import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { IsEmail, IsString } from 'class-validator';
import type { ApiResponse } from '../interfaces/api-response.interface';
import { createValidationPipe } from '../pipes/validation.pipe';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeFilter(nodeEnv = 'test') {
  const config = { get: () => nodeEnv } as unknown as ConfigService;
  const filter = new AllExceptionsFilter(config as never);
  // Keep 5xx logging out of the test output.
  jest
    .spyOn(
      (filter as unknown as { logger: { error: () => void } }).logger,
      'error',
    )
    .mockImplementation(() => undefined);
  return filter;
}

function capture(filter: AllExceptionsFilter, exception: unknown) {
  let status = 0;
  let body: ApiResponse | undefined;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: ApiResponse) {
      body = payload;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: 'GET', url: '/api/owners/123' }),
    }),
  } as unknown as ArgumentsHost;
  filter.catch(exception, host);
  if (!body) throw new Error('filter wrote no body');
  return { status, body };
}

function prismaError(code: string, meta?: Record<string, unknown>) {
  return Object.assign(new Error('prisma said no'), {
    name: 'PrismaClientKnownRequestError',
    code,
    meta,
  });
}

class SignUpDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;
}

describe('AllExceptionsFilter', () => {
  it('shapes an HttpException into the error envelope', () => {
    const { status, body } = capture(
      makeFilter(),
      new NotFoundException('Owner not found'),
    );
    expect(status).toBe(404);
    expect(body).toEqual({
      success: false,
      message: 'Owner not found',
      statusCode: 404,
      error: 'NOT_FOUND',
      timestamp: expect.any(String) as string,
      path: '/api/owners/123',
    });
  });

  it.each([
    [new BadRequestException(), 400, 'BAD_REQUEST'],
    [new UnauthorizedException(), 401, 'UNAUTHORIZED'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
    [new ConflictException('Taken'), 409, 'CONFLICT'],
    [
      new HttpException('Slow down', HttpStatus.TOO_MANY_REQUESTS),
      429,
      'TOO_MANY_REQUESTS',
    ],
  ])('maps %p to a stable code', (exception, statusCode, code) => {
    const { status, body } = capture(makeFilter(), exception);
    expect(status).toBe(statusCode);
    expect(body.error).toBe(code);
  });

  it('never passes Nest\'s human phrase ("Not Found") through as the code', () => {
    const { body } = capture(makeFilter(), new NotFoundException());
    expect(body.error).toBe('NOT_FOUND');
  });

  it('keeps a domain code and its data', () => {
    const { status, body } = capture(
      makeFilter(),
      new ConflictException({
        message: 'Another owner has this phone',
        error: 'PHONE_EXISTS',
        data: { ownerId: 'o-1' },
      }),
    );
    expect(status).toBe(409);
    expect(body.error).toBe('PHONE_EXISTS');
    expect(body.message).toBe('Another owner has this phone');
    expect(body.data).toEqual({ ownerId: 'o-1' });
  });

  it('keeps a domain code on a 5xx', () => {
    const { status, body } = capture(
      makeFilter(),
      new ServiceUnavailableException({
        message: 'Database is not reachable',
        error: 'DATABASE_UNAVAILABLE',
      }),
    );
    expect(status).toBe(503);
    expect(body.error).toBe('DATABASE_UNAVAILABLE');
  });

  it('reports DTO validation failures as VALIDATION_FAILED with one joined message', async () => {
    const pipe = createValidationPipe();
    const error = await pipe
      .transform(
        { email: 'not-an-email', name: 42, extra: true },
        { type: 'body', metatype: SignUpDto },
      )
      .catch((e: unknown) => e);

    const { status, body } = capture(makeFilter(), error);
    expect(status).toBe(400);
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.message).toContain('email must be an email');
    expect(body.message).toContain('name must be a string');
    expect(body.message).toContain('property extra should not exist');
  });

  it.each([
    [
      'P2002',
      { target: ['phone'] },
      409,
      'UNIQUE_VIOLATION',
      'phone already exists',
    ],
    ['P2025', undefined, 404, 'NOT_FOUND', 'Resource not found'],
    [
      'P2003',
      undefined,
      400,
      'FOREIGN_KEY_VIOLATION',
      'Related resource does not exist',
    ],
    [
      'P2014',
      undefined,
      400,
      'RELATION_VIOLATION',
      'Operation would violate a required relation',
    ],
    ['P2010', undefined, 400, 'DATABASE_ERROR', 'Database request failed'],
  ])('maps Prisma %s', (code, meta, statusCode, errorCode, message) => {
    const { status, body } = capture(makeFilter(), prismaError(code, meta));
    expect(status).toBe(statusCode);
    expect(body.error).toBe(errorCode);
    expect(body.message).toBe(message);
  });

  it('hides an unknown error message in production', () => {
    const { status, body } = capture(
      makeFilter('production'),
      new Error('connection string postgres://secret leaked'),
    );
    expect(status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Internal server error');
  });

  it('shows an unknown error message outside production', () => {
    const { body } = capture(makeFilter('development'), new Error('boom'));
    expect(body.message).toBe('boom');
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('handles a thrown non-Error value', () => {
    const { status, body } = capture(makeFilter(), 'just a string');
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.message).toBe('Internal server error');
  });
});
