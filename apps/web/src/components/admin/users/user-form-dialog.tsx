'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import type { Language, Role, User } from '@prime-crm/shared';
import { CREATE_USER, UPDATE_USER } from '@/apis';
import { DisabledReason, FormAlert, Select } from '@/components/admin/admin-ui';
import { FormField } from '@/components/form-field';
import { PhoneInput } from '@/components/phone-input';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { errorMessage } from '@/lib/error-message';
import {
  localMobile,
  validateUserForm,
  type UserFormErrors,
  type UserFormValues,
} from './user-rules';

export type UserFormMode =
  { kind: 'create' } | { kind: 'edit'; user: User; roleLocked: boolean };

/** Add a user, or edit one's name, email, mobile, role and language. */
export function UserFormDialog({
  mode,
  roles,
  open,
  onOpenChange,
}: {
  mode: UserFormMode;
  roles: readonly Role[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet" size="md" closeLabel={t('dialog.close')}>
        {open && (
          <UserForm
            key={mode.kind === 'edit' ? mode.user.id : 'new'}
            mode={mode}
            roles={roles}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function initialValues(mode: UserFormMode): UserFormValues {
  if (mode.kind === 'create')
    return {
      name: '',
      email: '',
      phone: '',
      roleId: '',
      language: 'ar',
      password: '',
    };
  const { user } = mode;
  return {
    name: user.name,
    email: user.email,
    phone: localMobile(user.phone),
    roleId: user.role.id,
    language: user.language,
    password: '',
  };
}

const FIELD_ERRORS: Record<string, keyof UserFormValues> = {
  EMAIL_TAKEN: 'email',
  LAST_ADMIN: 'roleId',
  INVALID_ROLE: 'roleId',
};

function UserForm({
  mode,
  roles,
  onDone,
}: {
  mode: UserFormMode;
  roles: readonly Role[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const formId = useId();
  const [values, setValues] = useState<UserFormValues>(() =>
    initialValues(mode),
  );
  const [errors, setErrors] = useState<UserFormErrors & { form?: string }>({});
  const [saving, setSaving] = useState(false);
  const editing = mode.kind === 'edit' ? mode.user : null;
  const roleLocked = mode.kind === 'edit' && mode.roleLocked;

  const set = <K extends keyof UserFormValues>(
    key: K,
    value: UserFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const found = validateUserForm(values, mode.kind, t);
    if (Object.keys(found).length > 0) return setErrors(found);
    setSaving(true);
    const common = {
      name: values.name.trim(),
      email: values.email.trim(),
      language: values.language,
      ...(roleLocked ? {} : { roleId: values.roleId }),
    };
    try {
      const res = await callApi(
        editing
          ? UPDATE_USER(editing.id, {
              ...common,
              // Only a changed mobile is sent: a stored landline isn't shown, so '' isn't "cleared".
              ...(values.phone !== localMobile(editing.phone)
                ? { phone: values.phone || null }
                : {}),
            })
          : CREATE_USER({
              ...common,
              roleId: values.roleId,
              ...(values.phone ? { phone: values.phone } : {}),
              password: values.password,
            }),
        {
          showErrorToast: false,
          showSuccessToast: true,
          successMessage: editing
            ? t('admin.users.updated')
            : t('admin.users.created', { name: common.name }),
        },
      );
      if (res.success) {
        router.refresh();
        return onDone();
      }
      if (isUnauthorized(res)) return;
      const field = res.error ? FIELD_ERRORS[res.error] : undefined;
      const message = errorMessage(t, res);
      setErrors(field ? { [field]: message } : { form: message });
    } finally {
      setSaving(false);
    }
  }

  const roleReasonId = `${formId}-role-reason`;
  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex min-h-0 flex-1 flex-col"
      data-testid="user-form"
    >
      <DialogHeader>
        <DialogTitle>
          {editing
            ? t('admin.users.editTitle', { name: editing.name })
            : t('admin.users.createTitle')}
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="grid content-start gap-5 pb-4">
        <FormField label={t('admin.users.name')} required error={errors.name}>
          {(field) => (
            <Input
              {...field}
              autoComplete="off"
              value={values.name}
              disabled={saving}
              placeholder={t('admin.users.namePlaceholder')}
              data-testid="user-name"
              onChange={(event) => set('name', event.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('admin.users.email')} required error={errors.email}>
          {(field) => (
            <Input
              {...field}
              type="email"
              dir="ltr"
              autoComplete="off"
              className="rtl:text-end"
              value={values.email}
              disabled={saving}
              placeholder={t('admin.users.emailPlaceholder')}
              data-testid="user-email"
              onChange={(event) => set('email', event.target.value)}
            />
          )}
        </FormField>
        <FormField
          label={t('admin.users.phone')}
          hint={t('admin.users.phoneHint')}
          error={errors.phone}
        >
          {(field) => (
            <PhoneInput
              {...field}
              value={values.phone}
              disabled={saving}
              data-testid="user-phone"
              onChange={(next) => set('phone', next)}
            />
          )}
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label={t('admin.users.role')}
            required
            error={errors.roleId}
          >
            {(field) => (
              <div className="grid gap-2">
                <Select
                  value={values.roleId || undefined}
                  disabled={saving || roleLocked}
                  onValueChange={(next) => set('roleId', next)}
                >
                  <SelectTrigger
                    id={field.id}
                    aria-invalid={field['aria-invalid']}
                    aria-describedby={
                      roleLocked ? roleReasonId : field['aria-describedby']
                    }
                    data-testid="user-role"
                  >
                    <SelectValue
                      placeholder={t('admin.users.rolePlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {roleLocked && (
                  <DisabledReason id={roleReasonId}>
                    {t('admin.users.roleLockedReason')}
                  </DisabledReason>
                )}
              </div>
            )}
          </FormField>
          <div className="grid content-start gap-2">
            <span className="type-label">{t('admin.users.language')}</span>
            <SegmentedControl<Language>
              label={t('admin.users.language')}
              value={values.language}
              disabled={saving}
              onChange={(next) => set('language', next)}
              options={[
                { value: 'ar', label: t('admin.users.languageAr') },
                { value: 'en', label: t('admin.users.languageEn') },
              ]}
              className="w-fit"
            />
          </div>
        </div>
        {!editing && (
          <FormField
            label={t('admin.users.password')}
            required
            hint={t('admin.users.passwordHint')}
            error={errors.password}
          >
            {(field) => (
              <Input
                {...field}
                type="text"
                dir="ltr"
                autoComplete="new-password"
                spellCheck={false}
                className="rtl:text-end"
                value={values.password}
                disabled={saving}
                placeholder={t('admin.users.passwordPlaceholder')}
                data-testid="user-password"
                onChange={(event) => set('password', event.target.value)}
              />
            )}
          </FormField>
        )}
        <FormAlert message={errors.form} />
      </DialogBody>
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={onDone}
        >
          {t('action.cancel')}
        </Button>
        <Button type="submit" disabled={saving} data-testid="user-submit">
          {saving && <LoaderCircle aria-hidden className="animate-spin" />}
          {saving
            ? t('dialog.working')
            : editing
              ? t('admin.saveChanges')
              : t('admin.users.create')}
        </Button>
      </DialogFooter>
    </form>
  );
}
