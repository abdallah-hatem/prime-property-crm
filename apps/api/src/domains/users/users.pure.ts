import type { UserShapeRow } from '../../common/utils/user-shape.util';
import type { UserChanges } from './repositories/user.repository';

const FIELDS = ['name', 'email', 'phone', 'roleId', 'language'] as const;
export type UserField = (typeof FIELDS)[number];

/** The fields `changes` sets to a value different from `current` (undefined = not sent). */
export function changedFields(
  current: UserShapeRow,
  changes: UserChanges,
): UserField[] {
  const now: Record<UserField, unknown> = {
    name: current.name,
    email: current.email,
    phone: current.phone,
    roleId: current.role.id,
    language: current.language,
  };
  return FIELDS.filter(
    (key) => changes[key] !== undefined && changes[key] !== now[key],
  );
}

/** Only the changed fields of `changes`, ready to write. */
export function pickChanges(
  changes: UserChanges,
  fields: readonly UserField[],
): UserChanges {
  return Object.fromEntries(fields.map((key) => [key, changes[key]]));
}
