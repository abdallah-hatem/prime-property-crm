import 'reflect-metadata';
import {
  CreateRoleRequestSchema,
  PERMISSION_KEYS,
  RoleListQuerySchema,
  UpdateRoleRequestSchema,
} from '@prime-crm/shared';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { ZodType } from 'zod';
import { PickerQueryDto } from '../../users/dto/picker-query.dto';
import { CreateRoleDto } from './create-role.dto';
import { UpdateRoleDto } from './update-role.dto';

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
    'create role',
    CreateRoleDto,
    CreateRoleRequestSchema,
    [
      { name: 'Team lead', permissions: ['owners.assign', 'analytics.view'] },
      { name: '  قائد الفريق ', permissions: [] },
      { name: 'Team lead', permissions: ['owners.fly'] },
      { name: 'Team lead', permissions: 'owners.assign' },
      { name: 'Team lead', permissions: [...PERMISSION_KEYS, 'users.manage'] },
      { name: 'Team lead', permissions: ['users.manage', 'users.manage'] },
      { name: '', permissions: [] },
      { name: '   ', permissions: [] },
      { name: 'n'.repeat(51), permissions: [] },
      { name: 'Team lead' },
      { permissions: [] },
      { name: 'Team lead', permissions: [], builtIn: 'ADMIN' },
      { name: 7, permissions: [] },
    ],
  ],
  [
    'update role',
    UpdateRoleDto,
    UpdateRoleRequestSchema,
    [
      {},
      { name: 'Seniors' },
      { name: '' },
      { permissions: [] },
      { permissions: ['trash.restore'] },
      { permissions: ['nope'] },
      { permissions: null },
      { name: null },
      { userCount: 3 },
    ],
  ],
  [
    'roles list query',
    PickerQueryDto,
    RoleListQuerySchema,
    [
      {},
      { page: '2', limit: '100' },
      { limit: '101' },
      { page: '0' },
      { q: 'x' },
    ],
  ],
];

describe('roles DTOs agree with the shared contract', () => {
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
