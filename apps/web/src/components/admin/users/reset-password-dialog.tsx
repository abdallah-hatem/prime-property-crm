'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type User,
} from '@prime-crm/shared';
import { RESET_USER_PASSWORD } from '@/apis';
import { FormAlert } from '@/components/admin/admin-ui';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { errorMessage } from '@/lib/error-message';

/** Set a new password for someone; every session of theirs ends. */
export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ field?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  const close = (next: boolean) => {
    if (saving) return;
    if (!next) {
      setPassword('');
      setError({});
    }
    onOpenChange(next);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!password) return setError({ field: t('form.required') });
    if (password.length < PASSWORD_MIN_LENGTH)
      return setError({ field: t('admin.users.passwordShort') });
    if (password.length > PASSWORD_MAX_LENGTH)
      return setError({
        field: t('admin.tooLong', { max: PASSWORD_MAX_LENGTH }),
      });
    setSaving(true);
    try {
      const res = await callApi(
        RESET_USER_PASSWORD(user.id, { newPassword: password }),
        {
          showErrorToast: false,
          showSuccessToast: true,
          successMessage: t('admin.users.resetDone', { name: user.name }),
        },
      );
      if (res.success) {
        setPassword('');
        setError({});
        return onOpenChange(false);
      }
      if (!isUnauthorized(res)) setError({ form: errorMessage(t, res) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent variant="sheet" size="sm" closeLabel={t('dialog.close')}>
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader>
            <DialogTitle>
              {t('admin.users.resetTitle', { name: user.name })}
            </DialogTitle>
            <DialogDescription>{t('admin.users.resetBody')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid content-start gap-4 pb-4">
            <FormField
              label={t('admin.users.newPassword')}
              required
              hint={t('admin.users.passwordHint')}
              error={error.field}
            >
              {(field) => (
                <Input
                  {...field}
                  type="text"
                  dir="ltr"
                  autoComplete="new-password"
                  spellCheck={false}
                  className="rtl:text-end"
                  value={password}
                  disabled={saving}
                  placeholder={t('admin.users.passwordPlaceholder')}
                  data-testid="reset-password-input"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError({});
                  }}
                />
              )}
            </FormField>
            <FormAlert message={error.form} />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => close(false)}
            >
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <LoaderCircle aria-hidden className="animate-spin" />}
              {saving ? t('dialog.working') : t('admin.users.resetConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
