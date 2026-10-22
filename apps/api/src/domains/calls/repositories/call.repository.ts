import { Injectable } from '@nestjs/common';
import type { Call, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service';
import { AppendOnlyRepository } from '../../../common/repositories/append-only.repository';

/**
 * Calls are the activity record: created and read, never deleted (business doc, "Call").
 * The one write after creation — setting the outcome once — is added with the calls domain
 * as a conditional update, not a general `update`.
 */
@Injectable()
export class CallRepository extends AppendOnlyRepository<
  Call,
  Prisma.CallUncheckedCreateInput
> {
  constructor(db: DatabaseService) {
    super(db.call);
  }
}
