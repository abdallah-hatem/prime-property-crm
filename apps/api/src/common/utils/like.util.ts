/**
 * Prisma's `contains` / `startsWith` / `endsWith` become a Postgres LIKE pattern without
 * escaping its wildcards, so a search for "%" or "_" would match everything. Pass search text
 * through this first: backslash, `%` and `_` are escaped with LIKE's default escape character.
 *
 * @example { name: { contains: escapeLike(q), mode: 'insensitive' } }
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
