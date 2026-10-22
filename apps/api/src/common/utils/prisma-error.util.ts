/**
 * True for Prisma's unique-constraint violation (P2002), matched structurally so services need
 * no value import from @prisma/client. Use it to turn a lost race into the domain's 409.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'PrismaClientKnownRequestError' &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
