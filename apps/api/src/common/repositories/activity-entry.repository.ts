import { Injectable } from '@nestjs/common';
import type { ActivityEntry, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AppendOnlyRepository } from './append-only.repository';

/** The activity log: append and read only (business doc: it cannot be edited or deleted). */
@Injectable()
export class ActivityEntryRepository extends AppendOnlyRepository<
  ActivityEntry,
  Prisma.ActivityEntryUncheckedCreateInput
> {
  constructor(db: DatabaseService) {
    super(db.activityEntry);
  }
}
