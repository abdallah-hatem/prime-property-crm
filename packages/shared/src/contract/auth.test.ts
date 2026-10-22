import { describe, expect, it } from 'vitest';
import {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  normalizeEmail,
  UpdateMeRequestSchema,
} from './auth';

describe('auth contract', () => {
  it('emails are trimmed and lower-cased', () => {
    expect(normalizeEmail('  Sara@Prime.TEST\t')).toBe('sara@prime.test');
    expect(
      LoginRequestSchema.parse({ email: ' Sara@Prime.test ', password: 'x' })
        .email,
    ).toBe('sara@prime.test');
  });

  it('PATCH /auth/me takes name, phone and language only', () => {
    expect(UpdateMeRequestSchema.safeParse({ name: 'سارة' }).success).toBe(
      true,
    );
    expect(UpdateMeRequestSchema.safeParse({ phone: null }).success).toBe(true);
    expect(UpdateMeRequestSchema.safeParse({ phone: 'abc' }).success).toBe(
      false,
    );
    for (const key of ['email', 'roleId', 'active']) {
      expect(UpdateMeRequestSchema.safeParse({ [key]: 'x' }).success).toBe(
        false,
      );
    }
  });

  it('a new password has at least 8 characters', () => {
    const body = (newPassword: string) => ({
      currentPassword: 'a',
      newPassword,
    });
    expect(ChangePasswordRequestSchema.safeParse(body('1234567')).success).toBe(
      false,
    );
    expect(
      ChangePasswordRequestSchema.safeParse(body('12345678')).success,
    ).toBe(true);
  });
});
