import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseUtil } from '../utils/response.util';
import { ResponseInterceptor } from './response.interceptor';

function contextFor(method: string, url: string, statusCode: number) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

function run(
  value: unknown,
  { method = 'GET', url = '/api/things', statusCode = 200 } = {},
) {
  const next: CallHandler = { handle: () => of(value) };
  return lastValueFrom(
    new ResponseInterceptor().intercept(
      contextFor(method, url, statusCode),
      next,
    ),
  );
}

describe('ResponseInterceptor', () => {
  it('wraps a returned value in the success envelope', async () => {
    const body = await run({ id: 'a1' });
    expect(body).toEqual({
      success: true,
      message: 'Data retrieved successfully',
      statusCode: 200,
      data: { id: 'a1' },
      timestamp: expect.any(String) as string,
      path: '/api/things',
      meta: undefined,
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('turns an undefined return into data: null', async () => {
    const body = await run(undefined, { method: 'DELETE' });
    expect(body.data).toBeNull();
    expect(body.message).toBe('Resource deleted successfully');
  });

  it.each([
    ['POST', 201, 'Resource created successfully'],
    ['POST', 200, 'Operation successful'],
    ['PATCH', 200, 'Resource updated successfully'],
    ['PUT', 200, 'Resource updated successfully'],
  ])('%s with %i says "%s"', async (method, statusCode, message) => {
    const body = await run({}, { method, statusCode });
    expect(body.message).toBe(message);
    expect(body.statusCode).toBe(statusCode);
  });

  it('passes an already enveloped value through, keeping its meta', async () => {
    const meta = {
      total: 41,
      page: 2,
      limit: 20,
      hasNextPage: true,
      hasPreviousPage: true,
    };
    const envelope = ResponseUtil.success(
      [1, 2],
      'Listed',
      200,
      undefined,
      meta,
    );
    const body = await run(envelope, { url: '/api/owners?page=2' });
    expect(body.data).toEqual([1, 2]);
    expect(body.meta).toEqual(meta);
    expect(body.message).toBe('Listed');
    expect(body.path).toBe('/api/owners?page=2');
  });

  it('does not mistake a domain object with a success field for an envelope', async () => {
    const body = await run({ success: true });
    expect(body.data).toEqual({ success: true });
  });
});
