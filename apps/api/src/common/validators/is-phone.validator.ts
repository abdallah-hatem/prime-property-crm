import { normalizePhone, toE164 } from '@prime-crm/shared';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * A phone `normalizePhone` accepts, as typed (local, +20, spaces...). Mirrors the shared
 * `PhoneInputSchema`; services store `toE164(value)`. `{ each: true }` for lists.
 */
export function IsPhone(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isPhone',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && normalizePhone(value).ok,
        defaultMessage: (args?: ValidationArguments) =>
          `${args?.property ?? 'phone'} must be a valid phone number`,
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
