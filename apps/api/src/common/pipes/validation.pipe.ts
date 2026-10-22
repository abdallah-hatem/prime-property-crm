import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ErrorCode } from '@prime-crm/shared';

function messages(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((e) => {
    const path = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {});
    return [...own, ...messages(e.children ?? [], path)];
  });
}

/** The one ValidationPipe the app and its e2e tests use: strict, and coded VALIDATION_FAILED. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        message: messages(errors),
        error: ErrorCode.VALIDATION_FAILED,
      }),
  });
}
