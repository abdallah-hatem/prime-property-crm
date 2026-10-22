/**
 * A list query parameter: `?type=A&type=B` and `?type=A,B` both become ['A', 'B'].
 * Use as `@Transform(({ value }) => toList(value))` on a list DTO field.
 */
export function toList(value: unknown): unknown {
  if (value === undefined || value === '') return undefined;
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) =>
    typeof item === 'string'
      ? item
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [item],
  );
}

/** `?flag=true|false` as a boolean; anything else is left for `@IsBoolean()` to refuse. */
export function toBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/** Trims a string body field; other types pass through for the validators to refuse. */
export function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
