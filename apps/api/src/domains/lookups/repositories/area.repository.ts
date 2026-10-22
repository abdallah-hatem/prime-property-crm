import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { escapeLike } from '../../../common/utils/like.util';
import { DatabaseService } from '../../../database/database.service';

export interface AreaRow {
  area: string;
  compounds: string[];
}

/**
 * Areas (and their compounds) in use on live owners and listings. Owners carry only an area;
 * compounds come from listings. Names are compared trimmed, as stored.
 */
@Injectable()
export class AreaRepository {
  constructor(private readonly db: DatabaseService) {}

  async findPage(
    q: string | undefined,
    skip: number,
    take: number,
  ): Promise<{ rows: AreaRow[]; total: number }> {
    const source = Prisma.sql`
      SELECT btrim(o.area) AS area, NULL::text AS compound
        FROM owners o
       WHERE o.deleted_at IS NULL AND o.area IS NOT NULL AND btrim(o.area) <> ''
      UNION ALL
      SELECT btrim(l.area), NULLIF(btrim(l.compound), '')
        FROM listings l
       WHERE l.deleted_at IS NULL AND btrim(l.area) <> ''`;
    const pattern = q?.trim() ? `%${escapeLike(q.trim())}%` : null;
    const having = pattern
      ? Prisma.sql`HAVING bool_or(s.area ILIKE ${pattern} ESCAPE '\\'
                          OR s.compound ILIKE ${pattern} ESCAPE '\\')`
      : Prisma.empty;
    const grouped = Prisma.sql`
      SELECT s.area,
             coalesce(array_agg(DISTINCT s.compound ORDER BY s.compound)
                        FILTER (WHERE s.compound IS NOT NULL), '{}') AS compounds
        FROM (${source}) s
       GROUP BY s.area
       ${having}`;

    const rows = await this.db.$queryRaw<AreaRow[]>`
      SELECT * FROM (${grouped}) g ORDER BY g.area ASC LIMIT ${take} OFFSET ${skip}`;
    const [{ total }] = await this.db.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM (${grouped}) g`;
    return { rows, total };
  }
}
