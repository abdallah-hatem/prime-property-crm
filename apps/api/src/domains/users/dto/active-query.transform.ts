import { Transform } from 'class-transformer';

/** `?active=true|false` → boolean; anything else stays as sent so `@IsBoolean` answers 400. */
export const ActiveQuery = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );
