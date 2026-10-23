'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { AD_CHECK_IN_DAYS_MAX, AD_CHECK_IN_DAYS_MIN } from '@prime-crm/shared';
import { UPDATE_SETTINGS } from '@/apis';
import { FormAlert, Panel } from '@/components/admin/admin-ui';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { errorMessage } from '@/lib/error-message';

/** A whole number of days in range, or null. Arabic-Indic digits are read too. */
export function parseCheckInDays(text: string): number | null {
  const latin = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  if (!/^\d{1,3}$/.test(latin)) return null;
  const days = Number(latin);
  return days >= AD_CHECK_IN_DAYS_MIN && days <= AD_CHECK_IN_DAYS_MAX
    ? days
    : null;
}

/** The ad check-in interval (1–90 days) with what it does. */
export function CheckInInterval({ days }: { days: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [text, setText] = useState(String(days));
  const [error, setError] = useState<{ field?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const next = parseCheckInDays(text);
    if (next === null)
      return setError({ field: t('admin.settings.checkInInvalid') });
    if (next === days)
      return setError({ field: t('admin.settings.checkInUnchanged') });
    setSaving(true);
    try {
      const res = await callApi(UPDATE_SETTINGS({ adCheckInDays: next }), {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('admin.settings.checkInSaved'),
      });
      if (res.success) {
        setText(String(res.data.adCheckInDays));
        router.refresh();
      } else if (!isUnauthorized(res)) setError({ form: errorMessage(t, res) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title={t('admin.settings.checkInTitle')}
      description={t('admin.settings.checkInBody')}
      testId="check-in-panel"
    >
      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="flex flex-wrap items-start gap-3"
      >
        <FormField
          label={t('admin.settings.checkInLabel')}
          required
          hint={t('admin.settings.checkInHint')}
          error={error.field}
          className="w-full max-w-60"
        >
          {(field) => (
            <div className="relative">
              <Input
                {...field}
                type="text"
                inputMode="numeric"
                value={text}
                disabled={saving}
                placeholder={t('admin.settings.checkInPlaceholder')}
                className="pe-16 font-numeric tabular-nums"
                data-testid="check-in-days"
                onChange={(event) => {
                  setText(event.target.value);
                  setError({});
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 end-4 grid place-items-center text-sm text-muted-foreground"
              >
                {t('admin.settings.days')}
              </span>
            </div>
          )}
        </FormField>
        <Button
          type="submit"
          disabled={saving}
          className="md:mt-7"
          data-testid="check-in-save"
        >
          {saving && <LoaderCircle aria-hidden className="animate-spin" />}
          {saving ? t('dialog.working') : t('action.save')}
        </Button>
        <div className="basis-full">
          <FormAlert message={error.form} />
        </div>
      </form>
    </Panel>
  );
}
