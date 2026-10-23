import {
  EmailSchema,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type Language,
  type Role,
  type User,
} from '@prime-crm/shared';
import type { Translate } from '@/i18n/translate';
import { EG_MOBILE } from '@/lib/phone-input';

/** The admin role, if the list has it (the built-in `ADMIN`). */
export const adminRoleOf = (roles: readonly Role[]): Role | undefined =>
  roles.find((role) => role.builtIn === 'ADMIN');

/**
 * Whether this user is the last active admin: moving them off Admin or deactivating them would
 * leave nobody who can manage the system. The API refuses it too (409 LAST_ADMIN); this only
 * lets the screen say why before anyone tries.
 */
export function isLastActiveAdmin(
  user: Pick<User, 'active' | 'role'>,
  adminRoleId: string | undefined,
  activeAdmins: number | null,
): boolean {
  return (
    !!adminRoleId &&
    user.active &&
    user.role.id === adminRoleId &&
    activeAdmins !== null &&
    activeAdmins <= 1
  );
}

export interface UserFormValues {
  name: string;
  email: string;
  /** The 11-digit local mobile, or '' for none. */
  phone: string;
  roleId: string;
  language: Language;
  /** Create only. */
  password: string;
}

export type UserFormErrors = Partial<Record<keyof UserFormValues, string>>;

/** Translated field errors; empty when the form may be sent. */
export function validateUserForm(
  values: UserFormValues,
  mode: 'create' | 'edit',
  t: Translate,
): UserFormErrors {
  const errors: UserFormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = t('form.required');
  else if (name.length > NAME_MAX_LENGTH)
    errors.name = t('admin.tooLong', { max: NAME_MAX_LENGTH });

  if (!values.email.trim()) errors.email = t('form.required');
  else if (!EmailSchema.safeParse(values.email).success)
    errors.email = t('admin.users.emailInvalid');

  if (values.phone && !EG_MOBILE.test(values.phone))
    errors.phone = t('form.phoneInvalid');

  if (!values.roleId) errors.roleId = t('admin.users.roleRequired');

  if (mode === 'create') {
    if (!values.password) errors.password = t('form.required');
    else if (values.password.length < PASSWORD_MIN_LENGTH)
      errors.password = t('admin.users.passwordShort');
    else if (values.password.length > PASSWORD_MAX_LENGTH)
      errors.password = t('admin.tooLong', { max: PASSWORD_MAX_LENGTH });
  }
  return errors;
}

/** `+201001234567` → `01001234567` for the mobile field; anything else is left out. */
export function localMobile(e164: string | null): string {
  if (!e164) return '';
  const local = e164.startsWith('+20') ? `0${e164.slice(3)}` : e164;
  return EG_MOBILE.test(local) ? local : '';
}
