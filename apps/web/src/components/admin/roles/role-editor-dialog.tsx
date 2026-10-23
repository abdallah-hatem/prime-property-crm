'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Trash2 } from 'lucide-react';
import {
  PERMISSION_KEYS,
  ROLE_NAME_MAX_LENGTH,
  type Permission,
  type Role,
} from '@prime-crm/shared';
import { CREATE_ROLE, UPDATE_ROLE } from '@/apis';
import { DisabledReason, FormAlert } from '@/components/admin/admin-ui';
import { CheckboxRow } from '@/components/ui/checkbox';
import { FormField } from '@/components/form-field';
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
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { errorMessage } from '@/lib/error-message';
import { PERMISSION_GROUPS, permissionLabel } from './permission-groups';

/** Why a role can't be deleted, or null when it can. */
export function roleDeleteBlock(role: Role): 'builtIn' | 'inUse' | null {
  if (role.builtIn) return 'builtIn';
  if (role.userCount > 0) return 'inUse';
  return null;
}

/**
 * Create or edit a role: its name and its permissions from the fixed list, grouped. Admin's list
 * is shown fully ticked and locked (it always holds everything); built-in roles can be renamed but
 * not deleted, and a role someone holds can't be deleted.
 */
export function RoleEditorDialog({
  role,
  open,
  onOpenChange,
  onDelete,
}: {
  /** null = a new role. */
  role: Role | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (role: Role) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet" size="lg" closeLabel={t('dialog.close')}>
        {open && (
          <RoleForm
            key={role?.id ?? 'new'}
            role={role}
            onDone={() => onOpenChange(false)}
            onDelete={onDelete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoleForm({
  role,
  onDone,
  onDelete,
}: {
  role: Role | null;
  onDone: () => void;
  onDelete: (role: Role) => void;
}) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const reasonId = useId();
  const isAdmin = role?.builtIn === 'ADMIN';
  const [name, setName] = useState(role?.name ?? '');
  const [granted, setGranted] = useState<Set<Permission>>(
    () =>
      new Set(
        isAdmin ? PERMISSION_KEYS : ((role?.permissions ?? []) as Permission[]),
      ),
  );
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  const toggle = (key: Permission, on: boolean) => {
    if (isAdmin) return;
    setGranted((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    setErrors({});
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) return setErrors({ name: t('form.required') });
    if (trimmed.length > ROLE_NAME_MAX_LENGTH)
      return setErrors({
        name: t('admin.tooLong', { max: ROLE_NAME_MAX_LENGTH }),
      });
    setSaving(true);
    // In the fixed list's order; Admin's list is never sent (it can't change).
    const permissions = PERMISSION_KEYS.filter((key) => granted.has(key));
    try {
      const res = await callApi(
        role
          ? UPDATE_ROLE(role.id, {
              name: trimmed,
              ...(isAdmin ? {} : { permissions }),
            })
          : CREATE_ROLE({ name: trimmed, permissions }),
        {
          showErrorToast: false,
          showSuccessToast: true,
          successMessage: role
            ? t('admin.roles.updated')
            : t('admin.roles.created'),
        },
      );
      if (res.success) {
        router.refresh();
        return onDone();
      }
      if (isUnauthorized(res)) return;
      const message = errorMessage(t, res);
      setErrors(
        res.error === 'ROLE_NAME_TAKEN' ? { name: message } : { form: message },
      );
    } finally {
      setSaving(false);
    }
  }

  const block = role ? roleDeleteBlock(role) : null;
  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex min-h-0 flex-1 flex-col"
      data-testid="role-form"
    >
      <DialogHeader>
        <DialogTitle>
          {role
            ? t('admin.roles.editTitle', { name: role.name })
            : t('admin.roles.createTitle')}
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="grid content-start gap-5 pb-4">
        <FormField
          label={t('admin.roles.name')}
          required
          error={errors.name}
          className="max-w-md"
        >
          {(field) => (
            <Input
              {...field}
              value={name}
              maxLength={ROLE_NAME_MAX_LENGTH}
              disabled={saving}
              placeholder={t('admin.roles.namePlaceholder')}
              data-testid="role-name"
              onChange={(event) => {
                setName(event.target.value);
                setErrors({});
              }}
            />
          )}
        </FormField>
        <fieldset
          className="grid gap-3"
          aria-describedby={isAdmin ? reasonId : undefined}
        >
          <legend className="mb-2 type-label">
            {t('admin.roles.permissions')}
          </legend>
          {isAdmin && (
            <DisabledReason id={reasonId} className="mb-1">
              {t('admin.roles.adminNote')}
            </DisabledReason>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {PERMISSION_GROUPS.map((group) => (
              <div
                key={group.key}
                role="group"
                aria-labelledby={`${reasonId}-${group.key}`}
                className="grid content-start gap-1 rounded-md bg-secondary/60 p-2"
              >
                <h3
                  id={`${reasonId}-${group.key}`}
                  className="px-3 pt-2 pb-1 text-xs font-bold text-muted-foreground"
                >
                  {t(`admin.roles.groups.${group.key}`)}
                </h3>
                {group.permissions.map((key) => (
                  <CheckboxRow
                    key={key}
                    label={permissionLabel(key, locale)}
                    checked={granted.has(key)}
                    disabled={isAdmin || saving}
                    testId={`permission-${key}`}
                    onCheckedChange={(on) => toggle(key, on)}
                  />
                ))}
              </div>
            ))}
          </div>
        </fieldset>
        <FormAlert message={errors.form} />
        {role && (
          <div className="grid justify-items-start gap-1.5 pt-2">
            <Button
              type="button"
              variant="ghost"
              className="justify-self-start text-destructive hover:text-destructive"
              disabled={saving || block !== null}
              aria-describedby={block ? `${reasonId}-delete` : undefined}
              onClick={() => onDelete(role)}
              data-testid="role-delete"
            >
              <Trash2 aria-hidden />
              {t('admin.roles.delete')}
            </Button>
            {block && (
              <DisabledReason id={`${reasonId}-delete`} className="max-w-xs">
                {block === 'builtIn'
                  ? t('admin.roles.builtInReason')
                  : t('admin.roles.inUseReason')}
              </DisabledReason>
            )}
          </div>
        )}
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
        <Button type="submit" disabled={saving} data-testid="role-submit">
          {saving && <LoaderCircle aria-hidden className="animate-spin" />}
          {saving
            ? t('dialog.working')
            : role
              ? t('admin.saveChanges')
              : t('admin.roles.createTitle')}
        </Button>
      </DialogFooter>
    </form>
  );
}
