'use client';

import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { z } from 'zod';
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '@prime-crm/shared';
import { LOGIN } from '@/apis';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/i18n-provider';
import type { Translate } from '@/i18n/translate';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { errorMessage } from '@/lib/error-message';

const loginSchema = (t: Translate) =>
  z.object({
    email: z
      .string()
      .trim()
      .min(1, t('auth.emailRequired'))
      .pipe(
        z
          .email(t('auth.emailInvalid'))
          .max(EMAIL_MAX_LENGTH, t('auth.emailInvalid')),
      ),
    password: z
      .string()
      .min(1, t('auth.passwordRequired'))
      .max(PASSWORD_MAX_LENGTH),
  });
type LoginValues = z.input<ReturnType<typeof loginSchema>>;

/**
 * Email + password. One request per sign-in however often the button is pressed: the button locks
 * while the request runs and stays locked through the page change that follows a success. Errors
 * come back as codes and are shown translated (wrong credentials, too many tries, offline).
 */
export function LoginForm({ next }: { next: string | null }) {
  const { t } = useTranslation();
  const schema = useMemo(() => loginSchema(t), [t]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const inFlight = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginValues) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await callApi(LOGIN(values, next), { showErrorToast: false });
      if (res.success) {
        // A full load, so the server renders the shell for the new session from the first paint.
        window.location.assign(res.data.redirectTo);
        return;
      }
      if (!isUnauthorized(res)) setServerError(errorMessage(t, res));
    } catch {
      // The action itself didn't reach the server (offline, deploy in progress).
      setServerError(t('error.network'));
    }
    inFlight.current = false;
    setSubmitting(false);
  };

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      aria-busy={submitting || undefined}
    >
      {serverError && (
        <p
          role="alert"
          data-testid="login-error"
          className="flex items-start gap-2 rounded-sm bg-destructive-soft px-3 py-2.5 text-sm font-semibold text-destructive"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {serverError}
        </p>
      )}
      <FormField label={t('auth.email')} required error={errors.email?.message}>
        {(field) => (
          <Input
            {...field}
            {...register('email')}
            type="email"
            inputMode="email"
            autoComplete="username"
            dir="ltr"
            className="rtl:text-end"
            placeholder={t('auth.emailPlaceholder')}
            data-testid="login-email"
          />
        )}
      </FormField>
      <FormField
        label={t('auth.password')}
        required
        error={errors.password?.message}
      >
        {(field) => (
          <div className="relative">
            <Input
              {...field}
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pe-12"
              placeholder={t('auth.passwordPlaceholder')}
              data-testid="login-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={
                showPassword ? t('auth.hidePassword') : t('auth.showPassword')
              }
              aria-pressed={showPassword}
              className="absolute inset-y-0 end-0 grid w-11 place-items-center rounded-e-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff aria-hidden className="size-[18px]" />
              ) : (
                <Eye aria-hidden className="size-[18px]" />
              )}
            </button>
          </div>
        )}
      </FormField>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={submitting}
        data-testid="login-submit"
      >
        {submitting && <LoaderCircle aria-hidden className="animate-spin" />}
        {submitting ? t('auth.submitting') : t('auth.submit')}
      </Button>
    </form>
  );
}
