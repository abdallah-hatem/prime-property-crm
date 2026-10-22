import { ValidateIf } from 'class-validator';

/**
 * Optional, but never null: absent skips validation, `null` is validated (and refused) like
 * any other value. `@IsOptional()` lets null through, which zod's `.optional()` refuses.
 */
export const IsOptionalNotNull = () =>
  ValidateIf((_, value: unknown) => value !== undefined);
