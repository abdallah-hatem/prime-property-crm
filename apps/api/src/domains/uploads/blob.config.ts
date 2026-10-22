import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';

/** `vercel_blob_rw_<storeId>_<secret>`: the store id is the 4th part (as @vercel/blob reads it). */
export function storeIdOf(token: string): string | null {
  const storeId = token.split('_')[3];
  return storeId ? storeId.toLowerCase() : null;
}

/**
 * Where photos live: the Blob read-write token (signs client upload tokens) and the store's
 * host (a registered photo URL must be on it). The host is BLOB_STORE_HOST, or derived from the
 * token's store id (public and private stores both). Tests replace this provider.
 */
@Injectable()
export class BlobConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  token(): string | undefined {
    return this.config.get('BLOB_READ_WRITE_TOKEN', { infer: true });
  }

  /** Hosts a photo URL may point at (lower case); empty = uploads not configured. */
  hosts(): string[] {
    const host = this.config.get('BLOB_STORE_HOST', { infer: true });
    if (host) return [host.toLowerCase()];
    const token = this.token();
    const store = token ? storeIdOf(token) : null;
    return store
      ? [
          `${store}.public.blob.vercel-storage.com`,
          `${store}.private.blob.vercel-storage.com`,
        ]
      : [];
  }
}
