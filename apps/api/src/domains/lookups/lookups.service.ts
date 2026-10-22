import { Injectable } from '@nestjs/common';
import { PICKER_LIMIT_MAX, type AreaOption } from '@prime-crm/shared';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import { pageWindow, toPage } from '../../common/utils/pagination.util';
import type { AreaLookupQueryDto } from './dto/area-lookup-query.dto';
import { AreaRepository } from './repositories/area.repository';

/** Pickers fed by what is already in the data. */
@Injectable()
export class LookupsService {
  constructor(private readonly areaRepo: AreaRepository) {}

  /** Areas with their compounds, A–Z; `q` matches an area or a compound (literally). */
  async areas(query: AreaLookupQueryDto): Promise<Paginated<AreaOption>> {
    const window = pageWindow(query.page, query.limit, PICKER_LIMIT_MAX);
    const { rows, total } = await this.areaRepo.findPage(
      query.q,
      window.skip,
      window.take,
    );
    return toPage(rows, total, window);
  }
}
