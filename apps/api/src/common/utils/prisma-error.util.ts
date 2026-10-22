function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    error.name === 'PrismaClientKnownRequestError' &&
    (error as { code?: unknown }).code === code
  );
}

/**
 * True for Prisma's unique-constraint violation (P2002), matched structurally so services need
 * no value import from @prisma/client. Use it to turn a lost race into the domain's 409.
 */
export function isUniqueViolation(error: unknown): boolean {
  return hasPrismaCode(error, 'P2002');
}

/** True for a foreign-key violation (P2003): a row still referenced, or a parent gone. */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasPrismaCode(error, 'P2003');
}
