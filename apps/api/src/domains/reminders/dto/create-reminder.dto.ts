import {
  IsUUID,
  ValidateIf,
  ValidatorConstraint,
  Validate,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ReminderInputDto } from './reminder-input.dto';

/** Exactly one of `ownerId` and `listingId`. */
@ValidatorConstraint({ name: 'exactlyOneTarget' })
class ExactlyOneTarget implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const body = args.object as CreateReminderDto;
    return (body.ownerId === undefined) !== (body.listingId === undefined);
  }

  defaultMessage(): string {
    return 'exactly one of ownerId and listingId is required';
  }
}

/**
 * `POST /reminders` (mirrors CreateReminderRequestSchema): a MANUAL reminder on exactly one of
 * an owner or a listing. With neither, `ownerId` is validated (and refused); with both, the
 * both-or-neither check fails on each.
 */
export class CreateReminderDto extends ReminderInputDto {
  @ValidateIf(
    (body: CreateReminderDto) =>
      body.ownerId !== undefined || body.listingId === undefined,
  )
  @Validate(ExactlyOneTarget)
  @IsUUID()
  ownerId?: string;

  @ValidateIf((body: CreateReminderDto) => body.listingId !== undefined)
  @Validate(ExactlyOneTarget)
  @IsUUID()
  listingId?: string;
}
