import { Injectable } from '@nestjs/common';
import { del } from '@vercel/blob';

/**
 * The one place that deletes files from Vercel Blob (purged photos). Behind a class so tests
 * replace it: no test ever reaches a real store.
 */
@Injectable()
export class BlobFilesGateway {
  async delete(urls: string[], token: string): Promise<void> {
    if (urls.length === 0) return;
    await del(urls, { token });
  }
}
