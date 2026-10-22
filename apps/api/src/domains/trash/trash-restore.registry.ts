import { Injectable } from '@nestjs/common';
import type { TrashKind } from '@prime-crm/shared';
import type { RestoreHandler } from './interfaces/trash.interface';

/**
 * Where domains plug their restore rules into the trash core.
 *
 * @example
 * export class ListingsModule implements OnModuleInit {
 *   constructor(private readonly registry: TrashRestoreRegistry, private readonly handler: ListingRestoreHandler) {}
 *   onModuleInit() { this.registry.register('LISTING', this.handler); }
 * }
 *
 * A kind with no handler restores with the generic rules only (clear deletedAt, log RESTORE).
 */
@Injectable()
export class TrashRestoreRegistry {
  private readonly handlers = new Map<TrashKind, RestoreHandler>();

  register(kind: TrashKind, handler: RestoreHandler): void {
    if (this.handlers.has(kind)) {
      throw new Error(`A restore handler for ${kind} is already registered`);
    }
    this.handlers.set(kind, handler);
  }

  get(kind: TrashKind): RestoreHandler | undefined {
    return this.handlers.get(kind);
  }
}
