import { withListingFilters } from '../../listings/dto/listing-query.dto';
import { withOwnerFilters } from '../../owners/dto/owner-query.dto';

/** `GET /exports/owners`: the `GET /owners` filters, no paging. */
export class OwnerExportQueryDto extends withOwnerFilters(class {}) {}

/** `GET /exports/listings`: the `GET /listings` filters, no paging. */
export class ListingExportQueryDto extends withListingFilters(class {}) {}
