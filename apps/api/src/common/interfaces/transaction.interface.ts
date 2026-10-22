import type { Prisma } from '@prisma/client';

/**
 * The client handed to work inside `DatabaseService.transaction`. Repositories take it as an
 * optional argument so a write joins the caller's transaction instead of committing alone.
 */
export type Tx = Prisma.TransactionClient;
