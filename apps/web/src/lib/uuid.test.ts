import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { randomUuid } from './uuid';

describe('randomUuid', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('works on an insecure page, where crypto.randomUUID is missing', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (a: Uint8Array) => real.getRandomValues(a),
    });
    const ids = Array.from({ length: 50 }, () => randomUuid());
    vi.unstubAllGlobals();
    for (const id of ids) expect(z.uuid().safeParse(id).success).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
