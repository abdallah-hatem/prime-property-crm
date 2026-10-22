import { registerDecorator, type ValidationArguments } from 'class-validator';

/**
 * An absolute URL with one of `protocols` (without the colon), parsed like the shared zod
 * `z.url({ protocol })`: the ad link (http/https) and a photo URL (https).
 */
export function IsWebUrl(protocols: readonly string[]) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isWebUrl',
      target: target.constructor,
      propertyName,
      validator: {
        validate: (value: unknown) => {
          if (
            typeof value !== 'string' ||
            !/^[a-z][a-z\d+.-]*:\/\//i.test(value)
          )
            return false;
          try {
            const url = new URL(value);
            return (
              protocols.includes(url.protocol.replace(/:$/, '')) &&
              url.hostname.length > 0
            );
          } catch {
            return false;
          }
        },
        defaultMessage: (args?: ValidationArguments) =>
          `${args?.property ?? 'url'} must be a ${protocols.join(' or ')} URL`,
      },
    });
}
