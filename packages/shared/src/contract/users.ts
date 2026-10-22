import { z } from 'zod';
import {
  EmailSchema,
  NameSchema,
  PasswordSchema,
  PhoneInputSchema,
  UserSchema,
} from './auth';
import { PAGE_LIMIT_MAX, PICKER_LIMIT_MAX } from './envelope';
import { LanguageSchema } from './enums';

/**
 * Users contract (spec, "Users — /users"). The API's DTOs mirror these schemas with
 * class-validator; `apps/api/src/domains/users/dto/users-contract.spec.ts` checks the two agree.
 * Deactivate / reactivate belong to the admin-ops task and add their own schemas.
 */

/** Domain error codes of the users endpoints. */
export const UserErrorCode = {
  /** Another user already has this email (compared trimmed and lower-cased). */
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  /** The change would leave no active user on the Admin role. */
  LAST_ADMIN: 'LAST_ADMIN',
  /** `roleId` names no role. */
  INVALID_ROLE: 'INVALID_ROLE',
} as const;
export type UserErrorCode = (typeof UserErrorCode)[keyof typeof UserErrorCode];

/** Longest `q` accepted by the users list search. */
export const USER_SEARCH_MAX_LENGTH = 100;

/** `?active=true|false` in a query string. */
const ActiveQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const pageField = z.coerce.number().int().min(1).default(1);
const limitField = (max: number) =>
  z.coerce.number().int().min(1).max(max).default(max);

/** `UserSummary { id, name }` (spec, Shapes). */
export const UserSummarySchema = z.object({ id: z.uuid(), name: z.string() });
export type UserSummary = z.infer<typeof UserSummarySchema>;

/** `GET /users` query: search by name, email or phone; filter by role and active. */
export const UserListQuerySchema = z.strictObject({
  q: z.string().max(USER_SEARCH_MAX_LENGTH).optional(),
  roleId: z.uuid().optional(),
  active: ActiveQuerySchema.optional(),
  page: pageField,
  limit: limitField(PAGE_LIMIT_MAX),
});
export type UserListQuery = z.input<typeof UserListQuerySchema>;

/** `GET /users/options` (picker): active users by default, sorted by name. */
export const UserOptionsQuerySchema = z.strictObject({
  active: ActiveQuerySchema.optional(),
  page: pageField,
  limit: limitField(PICKER_LIMIT_MAX),
});
export type UserOptionsQuery = z.input<typeof UserOptionsQuerySchema>;

/** `POST /users`. The phone goes in as typed and is stored as E.164. */
export const CreateUserRequestSchema = z.strictObject({
  name: NameSchema,
  email: EmailSchema,
  phone: PhoneInputSchema.nullable().optional(),
  roleId: z.uuid(),
  language: LanguageSchema,
  password: PasswordSchema,
});
export type CreateUserRequest = z.input<typeof CreateUserRequestSchema>;

/** `PATCH /users/:id`. Active and password have their own endpoints. `phone: null` clears it. */
export const UpdateUserRequestSchema = z.strictObject({
  name: NameSchema.optional(),
  email: EmailSchema.optional(),
  phone: PhoneInputSchema.nullable().optional(),
  roleId: z.uuid().optional(),
  language: LanguageSchema.optional(),
});
export type UpdateUserRequest = z.input<typeof UpdateUserRequestSchema>;

/** `POST /users/:id/reset-password`. Ends every session of that user. */
export const ResetPasswordRequestSchema = z.strictObject({
  newPassword: PasswordSchema,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

/** `GET /users/:id`: the user plus what they hold now. */
export const UserDetailSchema = UserSchema.extend({
  counts: z.object({
    /** Live owners assigned to them. */
    owners: z.number().int().min(0),
    /** Live listings assigned to them. */
    listings: z.number().int().min(0),
    /** Their reminders not done yet. */
    openReminders: z.number().int().min(0),
  }),
});
export type UserDetail = z.infer<typeof UserDetailSchema>;
