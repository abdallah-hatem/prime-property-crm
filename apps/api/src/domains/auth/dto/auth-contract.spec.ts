import {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  UpdateMeRequestSchema,
} from '@prime-crm/shared';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { ZodType } from 'zod';
import { ChangePasswordDto } from './change-password.dto';
import { LoginDto } from './login.dto';
import { RefreshTokenDto } from './refresh-token.dto';
import { UpdateMeDto } from './update-me.dto';

/** The DTOs mirror the shared zod contract: both accept and refuse the same bodies. */
async function dtoAccepts(dto: ClassConstructor<object>, body: unknown) {
  const errors = await validate(plainToInstance(dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.length === 0;
}

const cases: [string, ClassConstructor<object>, ZodType, unknown[]][] = [
  [
    'login',
    LoginDto,
    LoginRequestSchema,
    [
      { email: 'sara@prime.test', password: 'x' },
      { email: '  Sara@Prime.TEST ', password: 'secret-1' },
      { email: 'not-an-email', password: 'secret-1' },
      { email: 'sara@prime.test', password: '' },
      { email: 'sara@prime.test' },
      { email: 'sara@prime.test', password: 'secret-1', role: 'admin' },
      { email: 42, password: 'secret-1' },
      { email: 'sara@prime.test', password: 'p'.repeat(129) },
    ],
  ],
  [
    'refresh',
    RefreshTokenDto,
    RefreshRequestSchema,
    [
      { refreshToken: 'abc' },
      { refreshToken: '' },
      {},
      { refreshToken: 1 },
      { refreshToken: 'a', x: 1 },
    ],
  ],
  [
    'update me',
    UpdateMeDto,
    UpdateMeRequestSchema,
    [
      {},
      { name: 'سارة أحمد' },
      { name: '   ' },
      { name: 'n'.repeat(101) },
      { phone: '0100 123 4567' },
      { phone: null },
      { phone: 'call me' },
      { language: 'ar' },
      { language: 'fr' },
      { email: 'new@prime.test' },
      { roleId: '00000000-0000-0000-0000-000000000000' },
      { active: false },
    ],
  ],
  [
    'change password',
    ChangePasswordDto,
    ChangePasswordRequestSchema,
    [
      { currentPassword: 'old', newPassword: '12345678' },
      { currentPassword: 'old', newPassword: '1234567' },
      { currentPassword: '', newPassword: '12345678' },
      { newPassword: '12345678' },
      { currentPassword: 'old', newPassword: 12345678 },
    ],
  ],
];

describe('auth DTOs agree with the shared contract', () => {
  for (const [name, dto, schema, bodies] of cases) {
    it.each(bodies.map((body) => [JSON.stringify(body), body]))(
      `${name}: %s`,
      async (_label, body) => {
        expect(await dtoAccepts(dto, body)).toBe(
          schema.safeParse(body).success,
        );
      },
    );
  }
});
