'use client';

import { useCallback, useRef, useState } from 'react';
import type { ApiResult } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import type { HandleResponseOptions } from '@/lib/handleResponse';

/**
 * One request at a time for a control: `pending` drives the busy state, a second call while one
 * is running is dropped (double taps send one request), and a server action that never reached
 * the server comes back as a network failure instead of throwing.
 */
export function useMutation() {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(
    async <T>(
      request: () => Promise<ApiResult<T>>,
      options: HandleResponseOptions = {},
    ): Promise<ApiResult<T> | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setPending(true);
      try {
        return await callApi(request(), options);
      } catch {
        return {
          success: false,
          status: 0,
          message: 'Network error',
          networkError: true,
        };
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [],
  );

  return { run, pending };
}

/** `+201004821937` → `+20 100 482 1937` (Egyptian mobiles); anything else as stored. */
export function formatPhone(e164: string): string {
  const match = /^\+20(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+20 ${match[1]} ${match[2]} ${match[3]}` : e164;
}
