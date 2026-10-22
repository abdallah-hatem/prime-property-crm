import 'reflect-metadata';
import {
  ImportIssuesQuerySchema,
  ImportListQuerySchema,
  PreviewImportRequestSchema,
  UploadImportRequestSchema,
} from '@prime-crm/shared';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { ZodType } from 'zod';
import {
  ImportIssuesQueryDto,
  ImportListQueryDto,
  PreviewImportDto,
  UploadImportDto,
} from './import.dto';

/** The DTOs mirror the shared zod contract: both accept and refuse the same bodies. */
async function dtoAccepts(dto: ClassConstructor<object>, body: unknown) {
  const errors = await validate(plainToInstance(dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.length === 0;
}

const ID = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';

const cases: [string, ClassConstructor<object>, ZodType, unknown[]][] = [
  [
    'upload',
    UploadImportDto,
    UploadImportRequestSchema,
    [
      { kind: 'OWNERS' },
      { kind: 'LISTINGS' },
      { kind: 'owners' },
      {},
      { kind: 'OWNERS', x: 1 },
    ],
  ],
  [
    'preview',
    PreviewImportDto,
    PreviewImportRequestSchema,
    [
      { mapping: { name: 'Name', phone: 'Phone' } },
      { mapping: { name: 'الاسم' }, assignTo: ID },
      { mapping: {} },
      { mapping: { name: '' } },
      { mapping: { name: 1 } },
      { mapping: ['Name'] },
      { mapping: 'Name' },
      { mapping: null },
      {},
      { mapping: {}, assignTo: 'x' },
      { mapping: {}, assignTo: null },
      { mapping: {}, extra: true },
    ],
  ],
  [
    'list query',
    ImportListQueryDto,
    ImportListQuerySchema,
    [
      {},
      { kind: 'OWNERS' },
      { page: '2', limit: '20' },
      { limit: '21' },
      { page: '0' },
      { kind: 'X' },
      { q: 'a' },
    ],
  ],
  [
    'issues query',
    ImportIssuesQueryDto,
    ImportIssuesQuerySchema,
    [
      {},
      { reason: 'DUPLICATE' },
      { reason: 'NOPE' },
      { limit: '0' },
      { page: '1.5' },
    ],
  ],
];

describe('imports DTOs agree with the shared contract', () => {
  for (const [name, dto, schema, bodies] of cases) {
    it.each(bodies.map((b) => [JSON.stringify(b), b]))(
      `${name}: %s`,
      async (_label, body) => {
        expect(await dtoAccepts(dto, body)).toBe(
          schema.safeParse(body).success,
        );
      },
    );
  }
});
