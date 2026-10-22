import { z } from 'zod';
import { PICKER_LIMIT_MAX } from './envelope';
import {
  BuiltInRoleSchema,
  PERMISSION_KEYS,
  PermissionSchema,
} from './permissions';

/**
 * Roles contract (spec, "Roles — /roles"). The API's DTOs mirror these schemas;
 * `apps/api/src/domains/roles/dto/roles-contract.spec.ts` checks the two agree.
 */

/** Domain error codes of the roles endpoints. */
export const RoleErrorCode = {
  /** Another role has this name (compared case-insensitively). */
  ROLE_NAME_TAKEN: 'ROLE_NAME_TAKEN',
  /** Admin's permissions can't change; neither built-in role can be deleted. */
  BUILT_IN_ROLE: 'BUILT_IN_ROLE',
  /** Users still hold the role (deactivated users included). */
  ROLE_IN_USE: 'ROLE_IN_USE',
} as const;
export type RoleErrorCode = (typeof RoleErrorCode)[keyof typeof RoleErrorCode];

export const ROLE_NAME_MAX_LENGTH = 50;

const RoleNameSchema = z.string().trim().min(1).max(ROLE_NAME_MAX_LENGTH);

/** Keys from the fixed list only; a repeated key counts once. */
const PermissionListSchema = z
  .array(PermissionSchema)
  .max(PERMISSION_KEYS.length);

/**
 * `Role` (spec, Shapes). `builtIn` names the built-in role (`ADMIN`, `TEAM_MEMBER`) or is null
 * for a custom role, so it reads as a boolean too. Admin's `permissions` is always every key.
 */
export const RoleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  builtIn: BuiltInRoleSchema.nullable(),
  permissions: z.array(PermissionSchema),
  /** Users on the role, deactivated ones included. */
  userCount: z.number().int().min(0),
});
export type Role = z.infer<typeof RoleSchema>;

/** `GET /roles/permissions`: the fixed list, in display order. */
export const PermissionInfoSchema = z.object({
  key: PermissionSchema,
  labelEn: z.string(),
  labelAr: z.string(),
});
export type PermissionInfo = z.infer<typeof PermissionInfoSchema>;

/** `GET /roles` (picker): built-in roles first, then by name. */
export const RoleListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PICKER_LIMIT_MAX)
    .default(PICKER_LIMIT_MAX),
});
export type RoleListQuery = z.input<typeof RoleListQuerySchema>;

export const CreateRoleRequestSchema = z.strictObject({
  name: RoleNameSchema,
  permissions: PermissionListSchema,
});
export type CreateRoleRequest = z.input<typeof CreateRoleRequestSchema>;

/** Built-in roles can be renamed; Admin's permissions can't be changed. */
export const UpdateRoleRequestSchema = z.strictObject({
  name: RoleNameSchema.optional(),
  permissions: PermissionListSchema.optional(),
});
export type UpdateRoleRequest = z.input<typeof UpdateRoleRequestSchema>;
