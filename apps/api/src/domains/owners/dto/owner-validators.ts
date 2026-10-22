import { normalizePhone, toE164 } from '@prime-crm/shared';
import {
  registerDecorator,
  ValidateIf,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Optional, but not nullable: `@IsOptional()` lets `null` through, which the contract refuses.
 * Skips validation only when the field is absent.
 */
export const IsOptionalNotNull = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined);

/** A phone `normalizePhone` accepts (as typed: local, +20, spaces...). `{ each: true }` for lists. */
export function IsPhoneInput(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isPhoneInput',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && normalizePhone(value).ok,
        defaultMessage: (args?: ValidationArguments) =>
          `${args?.property ?? 'phone'} must contain valid phone numbers`,
      },
    });
}

/** A list of phones that stay distinct once normalised (`01001234567` = `+20 100 123 4567`). */
export function DistinctPhones(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'distinctPhones',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          Array.isArray(value) &&
          new Set(value.map((p) => (typeof p === 'string' ? toE164(p) : p)))
            .size === value.length,
        defaultMessage: (args?: ValidationArguments) =>
          `${args?.property ?? 'phones'} must be distinct`,
      },
    });
}
