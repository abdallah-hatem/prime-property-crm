import 'reflect-metadata';
import {
  CreateUserRequestSchema,
  ResetPasswordRequestSchema,
  UpdateUserRequestSchema,
  UserListQuerySchema,
  UserOptionsQuerySchema,
} from '@prime-crm/shared';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { ZodType } from 'zod';
import { CreateUserDto } from './create-user.dto';
import { ResetPasswordDto } from './reset-password.dto';
import { UpdateUserDto } from './update-user.dto';
import { UserListQueryDto } from './user-list-query.dto';
import { UserOptionsQueryDto } from './user-options-query.dto';

/** The DTOs mirror the shared zod contract: both accept and refuse the same bodies. */
async function dtoAccepts(dto: ClassConstructor<object>, body: unknown) {
  const errors = await validate(
    plainToInstance(dto, body, { enableImplicitConversion: false }),
    { whitelist: true, forbidNonWhitelisted: true },
  );
  return errors.length === 0;
}

const ROLE = '7b0a6c1e-2f43-4c8e-9d61-3a5b8e2f1c47';
const valid = {
  name: 'سارة أحمد',
  email: ' Sara@Prime.TEST ',
  roleId: ROLE,
  language: 'ar',
  password: 'long-enough-1',
};

const cases: [string, ClassConstructor<object>, ZodType, unknown[]][] = [
  [
    'create user',
    CreateUserDto,
    CreateUserRequestSchema,
    [
      valid,
      { ...valid, phone: '0100 123 4567' },
      { ...valid, phone: '+20 100 123 4567' },
      { ...valid, phone: null },
      { ...valid, phone: '0100123456' },
      { ...valid, phone: 'call me' },
      { ...valid, name: '   ' },
      { ...valid, name: 'n'.repeat(101) },
      { ...valid, email: 'not-an-email' },
      { ...valid, roleId: 'admin' },
      { ...valid, language: 'fr' },
      { ...valid, password: '1234567' },
      { ...valid, password: 'p'.repeat(129) },
      { ...valid, active: false },
      { ...valid, passwordHash: 'x' },
      { name: 'Omar' },
      {},
    ],
  ],
  [
    'update user',
    UpdateUserDto,
    UpdateUserRequestSchema,
    [
      {},
      { name: 'عمر' },
      { name: '' },
      { name: null },
      { email: null },
      { roleId: null },
      { language: null },
      { email: 'OMAR@prime.test' },
      { email: 'x' },
      { phone: null },
      { phone: '01001234567' },
      { phone: '123' },
      { roleId: ROLE },
      { roleId: 'x' },
      { language: 'en' },
      { language: 'de' },
      { password: 'new-password-1' },
      { active: true },
    ],
  ],
  [
    'reset password',
    ResetPasswordDto,
    ResetPasswordRequestSchema,
    [
      { newPassword: '12345678' },
      { newPassword: '1234567' },
      { newPassword: 12345678 },
      {},
      { newPassword: '12345678', currentPassword: 'x' },
    ],
  ],
];

const queries: [string, ClassConstructor<object>, ZodType, unknown[]][] = [
  [
    'list users query',
    UserListQueryDto,
    UserListQuerySchema,
    [
      {},
      { q: 'سارة', page: '2', limit: '20' },
      { q: 'x'.repeat(101) },
      { roleId: ROLE, active: 'true' },
      { active: 'false' },
      { active: 'yes' },
      { roleId: 'nope' },
      { page: '0' },
      { limit: '21' },
      { limit: 'abc' },
      { sort: 'name' },
    ],
  ],
  [
    'user options query',
    UserOptionsQueryDto,
    UserOptionsQuerySchema,
    [
      {},
      { active: 'false', limit: '100' },
      { limit: '101' },
      { page: '1.5' },
      { q: 'x' },
    ],
  ],
];

describe('users DTOs agree with the shared contract', () => {
  for (const [name, dto, schema, bodies] of [...cases, ...queries]) {
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
