import { Injectable } from '@nestjs/common';
import type { BuiltInRole } from '@prime-crm/shared';
import { DatabaseService } from '../../database/database.service';

/** Finds the built-in roles by their fixed key (Role.builtIn), never by their editable name. */
@Injectable()
export class RoleLookupRepository {
  constructor(private readonly db: DatabaseService) {}

  async findIdByBuiltIn(builtIn: BuiltInRole): Promise<string | null> {
    const role = await this.db.role.findUnique({
      where: { builtIn },
      select: { id: true },
    });
    return role?.id ?? null;
  }
}
