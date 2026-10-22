import { Injectable } from '@nestjs/common';
import type { Call, LeadStatus, Prisma } from '@prisma/client';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import { AppendOnlyRepository } from '../../../common/repositories/append-only.repository';
import { DatabaseService } from '../../../database/database.service';
import { CALL_SELECT, type CallRow } from '../call.shape';

/** What starting a call needs to know about the owner. */
export interface CallTarget {
  id: string;
  name: string;
  status: LeadStatus;
  phones: { phone: string }[];
}

/** What setting an outcome needs to know about the call. */
export interface CallCore {
  id: string;
  ownerId: string | null;
  outcomeId: string | null;
  startedAt: Date;
}

/**
 * Calls are the activity record: created and read, never deleted (business doc, "Call"). The
 * one write after creation, setting the outcome once, is a conditional update. Starting a call
 * and setting its outcome also touch the owner row (last call time, lead status), so those
 * owner writes live here too.
 */
@Injectable()
export class CallRepository extends AppendOnlyRepository<
  Call,
  Prisma.CallUncheckedCreateInput
> {
  constructor(private readonly db: DatabaseService) {
    super(db.call, (tx) => tx.call);
  }

  // ------------------------------------------------------------------ reads

  findShaped(id: string, tx?: Tx): Promise<CallRow | null> {
    return (tx ?? this.db).call.findUnique({
      where: { id },
      select: CALL_SELECT,
    });
  }

  /** The member's call made with this `clientRequestId` (the double-tap guard). */
  findByRequest(
    memberId: string,
    clientRequestId: string,
    tx?: Tx,
  ): Promise<{ id: string; ownerId: string | null } | null> {
    return (tx ?? this.db).call.findUnique({
      where: { memberId_clientRequestId: { memberId, clientRequestId } },
      select: { id: true, ownerId: true },
    });
  }

  /** The member's own call; null for anyone else's. */
  findOwn(tx: Tx, id: string, memberId: string): Promise<CallCore | null> {
    return tx.call.findFirst({
      where: { id, memberId },
      select: { id: true, ownerId: true, outcomeId: true, startedAt: true },
    });
  }

  async findPage(
    where: Prisma.CallWhereInput,
    skip: number,
    take: number,
  ): Promise<{ rows: CallRow[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.db.call.findMany({
        where,
        select: CALL_SELECT,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.db.call.count({ where }),
    ]);
    return { rows, total };
  }

  count(where: Prisma.CallWhereInput): Promise<number> {
    return this.db.call.count({ where });
  }

  /** True when a call on the owner started after `startedAt` already has an outcome. */
  async newerOutcomeExists(
    tx: Tx,
    ownerId: string,
    startedAt: Date,
  ): Promise<boolean> {
    const newer = await tx.call.findFirst({
      where: {
        ownerId,
        startedAt: { gt: startedAt },
        outcomeId: { not: null },
      },
      select: { id: true },
    });
    return newer !== null;
  }

  // ------------------------------------------------------------------ writes

  createShaped(
    tx: Tx,
    data: Prisma.CallUncheckedCreateInput,
  ): Promise<CallRow> {
    return tx.call.create({ data, select: CALL_SELECT });
  }

  /** Sets the outcome only while the call has none; 0 when another request set it first. */
  async setOutcome(
    tx: Tx,
    id: string,
    data: { outcomeId: string; note: string | null; outcomeAt: Date },
  ): Promise<number> {
    const { count } = await tx.call.updateMany({
      where: { id, outcomeId: null },
      data,
    });
    return count;
  }

  // ------------------------------------------------------------------ the owner side

  /** A live owner assigned to `memberId`, with its phones; null otherwise. */
  findTarget(
    tx: Tx,
    ownerId: string,
    memberId: string,
  ): Promise<CallTarget | null> {
    return tx.owner.findFirst({
      where: { id: ownerId, assignedToId: memberId, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        phones: { select: { phone: true } },
      },
    });
  }

  /** A live owner's status and member (setting an outcome); null once deleted. */
  findOwnerState(
    tx: Tx,
    ownerId: string,
  ): Promise<{ status: LeadStatus; assignedToId: string | null } | null> {
    return tx.owner.findFirst({
      where: { id: ownerId, deletedAt: null },
      select: { status: true, assignedToId: true },
    });
  }

  /** Moves the owner's last call time forward to `at` (never back). */
  async touchLastCall(tx: Tx, ownerId: string, at: Date): Promise<void> {
    await tx.owner.updateMany({
      where: {
        id: ownerId,
        OR: [{ lastCallAt: null }, { lastCallAt: { lt: at } }],
      },
      data: { lastCallAt: at },
    });
  }

  async setOwnerStatus(
    tx: Tx,
    ownerId: string,
    status: LeadStatus,
  ): Promise<void> {
    await tx.owner.update({ where: { id: ownerId }, data: { status } });
  }
}
