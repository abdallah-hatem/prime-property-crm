import { normalizePhone } from '@prime-crm/shared';
import { registerDecorator, type ValidationArguments } from 'class-validator';

/**
 * A phone `normalizePhone` accepts, as typed (local, +20, spaces...). Mirrors the shared
 * `PhoneInputSchema`; services store `toE164(value)`.
 */
export function IsPhone() {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isPhone',
      target: target.constructor,
      propertyName,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && normalizePhone(value).ok,
        defaultMessage: (args?: ValidationArguments) =>
          `${args?.property ?? 'phone'} must be a valid phone number`,
      },
    });
}
