import {
  AssignOwnersRequestSchema,
  CreateNoteRequestSchema,
  CreateOwnerRequestSchema,
  OWNER_BULK_MAX,
  UpdateOwnerRequestSchema,
} from '@prime-crm/shared';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { ZodType } from 'zod';
import { CreateNoteDto } from '../../notes/dto/create-note.dto';
import { AssignOwnersDto } from './assign-owners.dto';
import { CreateOwnerDto } from './create-owner.dto';
import { UpdateOwnerDto } from './update-owner.dto';

/** The DTOs mirror the shared zod contract: both accept and refuse the same bodies. */
async function dtoAccepts(dto: ClassConstructor<object>, body: unknown) {
  const errors = await validate(plainToInstance(dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.length === 0;
}

const ID = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';
const P1 = '01001234567';
const P2 = '01101234567';

const cases: [string, ClassConstructor<object>, ZodType, unknown[]][] = [
  [
    'create owner',
    CreateOwnerDto,
    CreateOwnerRequestSchema,
    [
      { name: 'أحمد علي', phones: [P1] },
      {
        name: '  Sara  ',
        phones: [P1, '+20 110 123 4567', '0020 120 123 4567'],
      },
      {
        name: 'Sara',
        phones: [P1],
        area: 'New Cairo',
        note: 'hi',
        assignedTo: ID,
      },
      { name: 'Sara', phones: [] },
      { name: 'Sara', phones: [P1, P2, '01201234567', '01501234567'] },
      { name: 'Sara', phones: ['12345'] },
      { name: 'Sara', phones: [P1, '+20 100 123 4567'] },
      { name: 'Sara', phones: P1 },
      { name: 'Sara', phones: [42] },
      { name: '   ', phones: [P1] },
      { name: 'n'.repeat(201), phones: [P1] },
      { phones: [P1] },
      { name: 'Sara', phones: [P1], area: '  ' },
      { name: 'Sara', phones: [P1], note: '' },
      { name: 'Sara', phones: [P1], note: 'n'.repeat(2001) },
      { name: 'Sara', phones: [P1], assignedTo: 'sara' },
      { name: 'Sara', phones: [P1], status: 'NEW' },
      { name: 'Sara', phones: [P1], area: null },
      { name: 'Sara', phones: [P1], note: null },
      { name: 'Sara', phones: [P1], assignedTo: null },
      { name: null, phones: [P1] },
    ],
  ],
  [
    'update owner',
    UpdateOwnerDto,
    UpdateOwnerRequestSchema,
    [
      {},
      { name: 'سارة' },
      { area: null },
      { area: 'Maadi' },
      { area: '' },
      { phones: [P2] },
      { phones: [] },
      { phones: [P1, P1] },
      { doNotCall: true },
      { doNotCall: 'true' },
      { assignedTo: ID },
      { status: 'NEW' },
      { note: 'x' },
      { name: null },
      { phones: null },
      { doNotCall: null },
    ],
  ],
  [
    'assign owners',
    AssignOwnersDto,
    AssignOwnersRequestSchema,
    [
      { ownerIds: [ID], assigneeId: ID },
      { ownerIds: [ID], assigneeId: null },
      { ownerIds: [ID] },
      { ownerIds: [], assigneeId: null },
      { ownerIds: ['x'], assigneeId: null },
      { ownerIds: [ID], assigneeId: 'x' },
      { ownerIds: ID, assigneeId: null },
      {
        ownerIds: Array.from({ length: OWNER_BULK_MAX + 1 }, () => ID),
        assigneeId: null,
      },
      { ownerIds: [ID], assigneeId: null, extra: 1 },
    ],
  ],
  [
    'create note',
    CreateNoteDto,
    CreateNoteRequestSchema,
    [
      { body: 'hi' },
      { body: ' 🙂 ملاحظة ' },
      { body: '' },
      { body: '   ' },
      { body: 'n'.repeat(2000) },
      { body: 'n'.repeat(2001) },
      { body: 5 },
      {},
      { body: 'x', authorId: ID },
    ],
  ],
];

describe('owner DTOs agree with the shared contract', () => {
  for (const [name, dto, schema, bodies] of cases) {
    it.each(bodies.map((body) => [JSON.stringify(body).slice(0, 80), body]))(
      `${name}: %s`,
      async (_label, body) => {
        expect(await dtoAccepts(dto, body)).toBe(
          schema.safeParse(body).success,
        );
      },
    );
  }
});
