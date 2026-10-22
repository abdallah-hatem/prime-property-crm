import 'reflect-metadata';
import {
  DeactivateUserRequestSchema,
  UpdateSettingsRequestSchema,
} from '@prime-crm/shared';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { ZodType } from 'zod';
import { DeactivateUserDto } from '../../users/dto/deactivate-user.dto';
import { UpdateSettingsDto } from './update-settings.dto';

/** The T10 DTOs mirror the shared zod contract: both accept and refuse the same bodies. */
async function dtoAccepts(dto: ClassConstructor<object>, body: unknown) {
  const errors = await validate(
    plainToInstance(dto, body, { enableImplicitConversion: false }),
    { whitelist: true, forbidNonWhitelisted: true },
  );
  return errors.length === 0;
}

const USER = '7b0a6c1e-2f43-4c8e-9d61-3a5b8e2f1c47';

const cases: [string, ClassConstructor<object>, ZodType, unknown[]][] = [
  [
    'update settings',
    UpdateSettingsDto,
    UpdateSettingsRequestSchema,
    [
      { adCheckInDays: 1 },
      { adCheckInDays: 7 },
      { adCheckInDays: 90 },
      { adCheckInDays: 0 },
      { adCheckInDays: 91 },
      { adCheckInDays: -1 },
      { adCheckInDays: 2.5 },
      { adCheckInDays: '7' },
      { adCheckInDays: null },
      { adCheckInDays: 7, other: 1 },
      {},
    ],
  ],
  [
    'deactivate user',
    DeactivateUserDto,
    DeactivateUserRequestSchema,
    [
      { handOverTo: USER },
      { handOverTo: null },
      {},
      { handOverTo: 'nobody' },
      { handOverTo: '' },
      { handOverTo: 5 },
      { handOverTo: USER, extra: true },
    ],
  ],
];

describe('T10 DTOs agree with the shared contract', () => {
  for (const [name, dto, schema, bodies] of cases) {
    it(`${name}: same verdict for every body`, async () => {
      for (const body of bodies) {
        const zod = schema.safeParse(body).success;
        expect({ body, dto: await dtoAccepts(dto, body) }).toEqual({
          body,
          dto: zod,
        });
      }
    });
  }
});
