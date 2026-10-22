import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { Env } from '../src/config/env.validation';

describe('GET /api/health (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    const port = app
      .get<ConfigService<Env, true>>(ConfigService)
      .get('PORT', { infer: true });
    await app.listen(port);
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers without a token, in the envelope, with the database up', async () => {
    const res = await request(baseUrl).get('/api/health').expect(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Data retrieved successfully',
      statusCode: 200,
      data: { status: 'ok', database: 'up', uptimeSeconds: expect.any(Number) },
      timestamp: expect.any(String),
      path: '/api/health',
    });
  });

  it('ignores a garbage bearer token on a public route', async () => {
    await request(baseUrl)
      .get('/api/health')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(200);
  });

  it('answers an unknown route with the NOT_FOUND envelope', async () => {
    const res = await request(baseUrl).get('/api/nowhere').expect(404);
    expect(res.body).toMatchObject({
      success: false,
      statusCode: 404,
      error: 'NOT_FOUND',
      path: '/api/nowhere',
    });
  });

  it('serves nothing outside the /api prefix', async () => {
    await request(baseUrl).get('/health').expect(404);
  });
});
