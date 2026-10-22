import { redirect } from 'next/navigation';
import { toast } from 'sonner';
import { createTranslator } from '@/i18n/translate';
import { isUnauthorized, type ApiResult } from './api-result';
import { documentLocale, errorMessage } from './error-message';
import { LOGIN_PATH } from './routes';

export interface HandleResponseOptions {
  showErrorToast?: boolean;
  showSuccessToast?: boolean;
  /** Shown on success (translated by the caller); the API's English message is never shown. */
  successMessage?: string;
}

/**
 * The only place toasts happen, and the logout hand-off. Runs twice per client call: inside the
 * endpoint on the server (no window: only the 401 redirect applies) and again in the browser
 * through `callApi`, where the toast can appear.
 */
export function handleResponse<R extends ApiResult<unknown>>(
  response: R,
  {
    showErrorToast = true,
    showSuccessToast = false,
    successMessage,
  }: HandleResponseOptions = {},
): R {
  const inBrowser = typeof window !== 'undefined';

  if (isUnauthorized(response)) {
    if (!inBrowser) redirect(LOGIN_PATH);
    const t = createTranslator(documentLocale());
    if (showErrorToast) toast.error(errorMessage(t, response));
    window.location.assign(LOGIN_PATH);
    return response;
  }

  if (!inBrowser) return response;

  if (response.success) {
    if (showSuccessToast && successMessage) toast.success(successMessage);
  } else if (showErrorToast) {
    toast.error(errorMessage(createTranslator(documentLocale()), response));
  }
  return response;
}
