import { Injectable } from '@nestjs/common';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { IncomingMessage } from 'node:http';

/** The token options our handshake grants (a subset of @vercel/blob's). */
export interface UploadTokenOptions {
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
  addRandomSuffix: boolean;
  tokenPayload: string;
}

export interface UploadTokenResult {
  type: 'blob.generate-client-token';
  clientToken: string;
}

/**
 * The one place that calls @vercel/blob's `handleUpload` (signs a client upload token with the
 * read-write token, offline). Behind a class so unit tests mock it.
 */
@Injectable()
export class BlobUploadGateway {
  async issueToken(input: {
    token: string;
    request: IncomingMessage;
    body: HandleUploadBody;
    options: (pathname: string) => Promise<UploadTokenOptions>;
  }): Promise<UploadTokenResult> {
    const result = await handleUpload({
      token: input.token,
      request: input.request,
      body: input.body,
      onBeforeGenerateToken: (pathname) => input.options(pathname),
    });
    if (result.type !== 'blob.generate-client-token') {
      throw new Error('Unexpected Blob upload event');
    }
    return result;
  }
}
