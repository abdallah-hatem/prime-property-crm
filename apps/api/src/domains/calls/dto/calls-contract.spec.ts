import {
  CreateCallOutcomeRequestSchema,
  CreateReminderRequestSchema,
  SetCallOutcomeRequestSchema,
  StartCallRequestSchema,
  UpdateCallOutcomeRequestSchema,
  UpdateReminderRequestSchema,
} from '@prime-crm/shared';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { ZodType } from 'zod';
import { CreateCallOutcomeDto } from '../../call-outcomes/dto/create-call-outcome.dto';
import { UpdateCallOutcomeDto } from '../../call-outcomes/dto/update-call-outcome.dto';
import { CreateReminderDto } from '../../reminders/dto/create-reminder.dto';
import { UpdateReminderDto } from '../../reminders/dto/update-reminder.dto';
import { SetOutcomeDto } from './set-outcome.dto';
import { StartCallDto } from './start-call.dto';

/** The DTOs mirror the shared zod contract: both accept and refuse the same bodies. */
async function dtoAccepts(dto: ClassConstructor<object>, body: unknown) {
  const errors = await validate(plainToInstance(dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.length === 0;
}

const ID = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';
const AT = '2026-10-23T09:00:00Z';
const LONG_NOTE = 'n'.repeat(2001);

const cases: [string, ClassConstructor<object>, ZodType, unknown[]][] = [
  [
    'start call',
    StartCallDto,
    StartCallRequestSchema,
    [
      { phone: '01001234567', clientRequestId: ID },
      { phone: '+20 100 123 4567', clientRequestId: ID },
      { phone: '12345', clientRequestId: ID },
      { phone: '01001234567' },
      { phone: '01001234567', clientRequestId: 'tap-1' },
      { phone: 42, clientRequestId: ID },
      { phone: '01001234567', clientRequestId: ID, ownerId: ID },
    ],
  ],
  [
    'set outcome',
    SetOutcomeDto,
    SetCallOutcomeRequestSchema,
    [
      { outcomeId: ID },
      { outcomeId: ID, note: 'رد وقال يتصل بكره 🙂' },
      { outcomeId: ID, reminder: { dueAt: AT } },
      {
        outcomeId: ID,
        reminder: { dueAt: '2026-10-23T12:00:00+03:00', note: 'x' },
      },
      {},
      { outcomeId: 'busy' },
      { outcomeId: ID, note: '' },
      { outcomeId: ID, note: LONG_NOTE },
      { outcomeId: ID, note: null },
      { outcomeId: ID, reminder: null },
      { outcomeId: ID, reminder: { dueAt: '2026-10-23' } },
      { outcomeId: ID, reminder: { dueAt: '2026-10-23T09:00:00' } },
      { outcomeId: ID, reminder: { dueAt: AT, extra: 1 } },
      { outcomeId: ID, reminder: [] },
      { outcomeId: ID, status: 'NEW' },
    ],
  ],
  [
    'create reminder',
    CreateReminderDto,
    CreateReminderRequestSchema,
    [
      { ownerId: ID, dueAt: AT },
      { listingId: ID, dueAt: AT, note: 'تابع الإعلان' },
      { dueAt: AT },
      { ownerId: ID, listingId: ID, dueAt: AT },
      { ownerId: ID },
      { ownerId: 'x', dueAt: AT },
      { ownerId: ID, dueAt: 'tomorrow' },
      { ownerId: ID, dueAt: AT, kind: 'AD_CHECK_IN' },
      { ownerId: ID, dueAt: AT, memberId: ID },
    ],
  ],
  [
    'update reminder',
    UpdateReminderDto,
    UpdateReminderRequestSchema,
    [
      {},
      { dueAt: AT },
      { note: null },
      { note: 'x' },
      { dueAt: null },
      { note: '' },
      { doneAt: AT },
    ],
  ],
  [
    'create outcome',
    CreateCallOutcomeDto,
    CreateCallOutcomeRequestSchema,
    [
      { labelEn: 'Busy', labelAr: 'مشغول', setsStatus: 'CONTACTED' },
      { labelEn: 'Busy', labelAr: 'مشغول', setsStatus: 'LISTED' },
      { labelEn: ' ', labelAr: 'مشغول', setsStatus: 'CONTACTED' },
      { labelEn: 'Busy', setsStatus: 'CONTACTED' },
      { labelEn: 'b'.repeat(101), labelAr: 'x', setsStatus: 'NEW' },
      { labelEn: 'Busy', labelAr: 'x', setsStatus: 'NEW', hidden: true },
    ],
  ],
  [
    'update outcome',
    UpdateCallOutcomeDto,
    UpdateCallOutcomeRequestSchema,
    [
      {},
      { labelEn: 'Line busy' },
      { hidden: true, order: 0 },
      { setsStatus: 'LISTED' },
      { setsStatus: 'DO_NOT_CALL' },
      { order: -1 },
      { order: 1.5 },
      { order: 10_001 },
      { hidden: null },
      { hidden: 'yes' },
      { labelAr: '' },
      { inUse: false },
    ],
  ],
];

describe('calls, reminders and outcomes DTOs agree with the shared contract', () => {
  it.each(cases)('%s', async (_name, dto, schema, bodies) => {
    for (const body of bodies) {
      const zod = schema.safeParse(body).success;
      const classValidator = await dtoAccepts(dto, body);
      expect({ body, classValidator }).toEqual({ body, classValidator: zod });
    }
  });
});
