import { describe, expect, it } from 'vitest';
import { CreateNoteRequestSchema, NOTE_BODY_MAX_LENGTH } from './notes';
import {
  AssignOwnersRequestSchema,
  CreateOwnerRequestSchema,
  OwnerListQuerySchema,
  OWNER_BULK_MAX,
  UpdateOwnerRequestSchema,
} from './owners';

const ID = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';

describe('owners contract', () => {
  it('1–3 phones, valid and distinct once normalised', () => {
    const body = (phones: unknown[]) => ({ name: 'أحمد علي', phones });
    expect(
      CreateOwnerRequestSchema.safeParse(body(['01001234567'])).success,
    ).toBe(true);
    expect(CreateOwnerRequestSchema.safeParse(body([])).success).toBe(false);
    expect(
      CreateOwnerRequestSchema.safeParse(
        body(['01001234567', '01101234567', '01201234567', '01501234567']),
      ).success,
    ).toBe(false);
    expect(CreateOwnerRequestSchema.safeParse(body(['12345'])).success).toBe(
      false,
    );
    expect(
      CreateOwnerRequestSchema.safeParse(
        body(['01001234567', '+20 100 123 4567']),
      ).success,
    ).toBe(false);
  });

  it('name is trimmed and required; unknown fields are refused', () => {
    expect(
      CreateOwnerRequestSchema.parse({
        name: '  Sara ',
        phones: ['01001234567'],
      }).name,
    ).toBe('Sara');
    expect(
      CreateOwnerRequestSchema.safeParse({
        name: '  ',
        phones: ['01001234567'],
      }).success,
    ).toBe(false);
    expect(
      CreateOwnerRequestSchema.safeParse({
        name: 'x',
        phones: ['01001234567'],
        status: 'NEW',
      }).success,
    ).toBe(false);
  });

  it('PATCH takes name, phones, area (null clears) and doNotCall', () => {
    expect(UpdateOwnerRequestSchema.safeParse({}).success).toBe(true);
    expect(UpdateOwnerRequestSchema.safeParse({ area: null }).success).toBe(
      true,
    );
    expect(
      UpdateOwnerRequestSchema.safeParse({ doNotCall: 'yes' }).success,
    ).toBe(false);
    expect(UpdateOwnerRequestSchema.safeParse({ assignedTo: ID }).success).toBe(
      false,
    );
  });

  it(`assign takes 1–${OWNER_BULK_MAX} ids and a nullable assignee`, () => {
    expect(
      AssignOwnersRequestSchema.safeParse({ ownerIds: [ID], assigneeId: null })
        .success,
    ).toBe(true);
    expect(
      AssignOwnersRequestSchema.safeParse({ ownerIds: [], assigneeId: ID })
        .success,
    ).toBe(false);
    expect(
      AssignOwnersRequestSchema.safeParse({
        ownerIds: Array.from({ length: OWNER_BULK_MAX + 1 }, () => ID),
        assigneeId: ID,
      }).success,
    ).toBe(false);
    expect(
      AssignOwnersRequestSchema.safeParse({ ownerIds: [ID] }).success,
    ).toBe(false);
  });

  it('list query reads repeated and comma statuses', () => {
    expect(
      OwnerListQuerySchema.parse({ status: 'NEW,CALL_BACK' }).status,
    ).toEqual(['NEW', 'CALL_BACK']);
    expect(
      OwnerListQuerySchema.parse({ status: ['NEW', 'LISTED'] }).status,
    ).toEqual(['NEW', 'LISTED']);
    expect(OwnerListQuerySchema.safeParse({ status: 'OPEN' }).success).toBe(
      false,
    );
    expect(
      OwnerListQuerySchema.safeParse({ assignedTo: 'someone' }).success,
    ).toBe(false);
    expect(
      OwnerListQuerySchema.parse({ hasReminder: 'false' }).hasReminder,
    ).toBe(false);
  });

  it('note body 1–2000 characters', () => {
    expect(CreateNoteRequestSchema.safeParse({ body: ' ' }).success).toBe(
      false,
    );
    expect(
      CreateNoteRequestSchema.safeParse({
        body: 'ن'.repeat(NOTE_BODY_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      CreateNoteRequestSchema.safeParse({
        body: 'n'.repeat(NOTE_BODY_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});
