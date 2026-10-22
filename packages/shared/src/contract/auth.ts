import { z } from 'zod';
import { normalizePhone } from '../logic/phone';
import { LanguageSchema } from './enums';

/**
 * Auth contract (spec, "Auth — /auth"). The API's DTOs mirror these schemas with class-validator;
 * `apps/api/src/domains/auth/dto/auth-contract.spec.ts` checks the two agree.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;
export const NAME_MAX_LENGTH = 100;

/** Access token lifetime (JWT `exp`). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Refresh token lifetime; each use rotates it. */
export const REFRESH_TOKEN_TTL_DAYS = 30;
/**
 * A refresh token already used is accepted again for this long (two tabs refreshing at once get a
 * pair each, in the same family). Reuse after the window revokes the whole family.
 */
export const REFRESH_GRACE_SECONDS = 30;
/** Sign-in rate limit: this many failures per email inside the window → 429. */
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_FAILURE_WINDOW_MINUTES = 15;

/** Domain error codes of the auth endpoints. */
export const AuthErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH: 'INVALID_REFRESH',
  WRONG_PASSWORD: 'WRONG_PASSWORD',
} as const;
export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

/** Emails are compared trimmed and lower-cased everywhere. */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

const EmailSchema = z
  .string()
  .transform(normalizeEmail)
  .pipe(z.email().max(EMAIL_MAX_LENGTH));

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

export const LoginRequestSchema = z.strictObject({
  email: EmailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.input<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.strictObject({
  refreshToken: z.string().min(1).max(512),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

/** `POST /auth/logout` takes the same body as refresh. */
export const LogoutRequestSchema = RefreshRequestSchema;
export type LogoutRequest = RefreshRequest;

/** `PATCH /auth/me`: name, phone (as typed, `null` clears it) and language only. */
export const UpdateMeRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
  phone: z
    .string()
    .max(40)
    .refine((value) => normalizePhone(value).ok, 'must be a valid phone number')
    .nullable()
    .optional(),
  language: LanguageSchema.optional(),
});
export type UpdateMeRequest = z.input<typeof UpdateMeRequestSchema>;

export const ChangePasswordRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

/** `User` (spec, Shapes). */
export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  language: LanguageSchema,
  active: z.boolean(),
  role: z.object({ id: z.uuid(), name: z.string() }),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

/** `Me = User & { permissions }`. */
export const MeSchema = UserSchema.extend({ permissions: z.array(z.string()) });
export type Me = z.infer<typeof MeSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const LoginResponseSchema = TokenPairSchema.extend({ user: MeSchema });
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
