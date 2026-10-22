import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import { DatabaseService } from '../../../database/database.service';

/** The columns behind the contract's `CallOutcome` (`inUse` from the call count). */
export const CALL_OUTCOME_SELECT = {
  id: true,
  labelEn: true,
  labelAr: true,
  setsStatus: true,
  hidden: true,
  order: true,
  _count: { select: { calls: true } },
} as const satisfies Prisma.CallOutcomeSelect;

export type CallOutcomeRow = Prisma.CallOutcomeGetPayload<{
  select: typeof CALL_OUTCOME_SELECT;
}>;

/** Call outcomes: the admin-edited list. Rows are deleted only while no call uses them. */
@Injectable()
export class CallOutcomeRepository {
  constructor(private readonly db: DatabaseService) {}

  /** A page in list order (`order`, then label, then id). */
  async findPage(
    includeHidden: boolean,
    skip: number,
    take: number,
  ): Promise<{ rows: CallOutcomeRow[]; total: number }> {
    const where: Prisma.CallOutcomeWhereInput = includeHidden
      ? {}
      : { hidden: false };
    const [rows, total] = await Promise.all([
      this.db.callOutcome.findMany({
        where,
        select: CALL_OUTCOME_SELECT,
        orderBy: [{ order: 'asc' }, { labelEn: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.db.callOutcome.count({ where }),
    ]);
    return { rows, total };
  }

  findById(id: string, tx?: Tx): Promise<CallOutcomeRow | null> {
    return (tx ?? this.db).callOutcome.findUnique({
      where: { id },
      select: CALL_OUTCOME_SELECT,
    });
  }

  /** The next free position at the end of the list. */
  async nextOrder(tx: Tx): Promise<number> {
    const { _max } = await tx.callOutcome.aggregate({ _max: { order: true } });
    return (_max.order ?? 0) + 1;
  }

  create(
    tx: Tx,
    data: Prisma.CallOutcomeUncheckedCreateInput,
  ): Promise<CallOutcomeRow> {
    return tx.callOutcome.create({ data, select: CALL_OUTCOME_SELECT });
  }

  update(
    tx: Tx,
    id: string,
    data: Prisma.CallOutcomeUncheckedUpdateInput,
  ): Promise<CallOutcomeRow> {
    return tx.callOutcome.update({
      where: { id },
      data,
      select: CALL_OUTCOME_SELECT,
    });
  }

  /**
   * Deletes the outcome only while no call has it, in one statement, so a call setting it at
   * the same moment can't be left pointing at nothing. False when it is in use (or gone).
   */
  async deleteUnused(tx: Tx, id: string): Promise<boolean> {
    const { count } = await tx.callOutcome.deleteMany({
      where: { id, calls: { none: {} } },
    });
    return count === 1;
  }
}
