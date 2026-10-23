'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import {
  OUTCOME_LABEL_MAX_LENGTH,
  OutcomeStatusSchema,
  type CallOutcome,
} from '@prime-crm/shared';
import { CREATE_CALL_OUTCOME, UPDATE_CALL_OUTCOME } from '@/apis';
import { FormAlert, Select } from '@/components/admin/admin-ui';
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

type OutcomeStatus = CallOutcome['setsStatus'];

/** Add an outcome or rename / remap one. The status list never offers Listed. */
export function OutcomeDialog({
  outcome,
  open,
  onOpenChange,
  onSaved,
}: {
  /** null = a new outcome. */
  outcome: CallOutcome | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (outcome: CallOutcome) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet" size="md" closeLabel={t('dialog.close')}>
        {open && (
          <OutcomeForm
            key={outcome?.id ?? 'new'}
            outcome={outcome}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onSaved(saved);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface Errors {
  labelEn?: string;
  labelAr?: string;
  setsStatus?: string;
  form?: string;
}

function OutcomeForm({
  outcome,
  onCancel,
  onSaved,
}: {
  outcome: CallOutcome | null;
  onCancel: () => void;
  onSaved: (outcome: CallOutcome) => void;
}) {
  const { t } = useTranslation();
  const [labelEn, setLabelEn] = useState(outcome?.labelEn ?? '');
  const [labelAr, setLabelAr] = useState(outcome?.labelAr ?? '');
  const [status, setStatus] = useState<OutcomeStatus | ''>(
    outcome?.setsStatus ?? '',
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const labelError = (value: string): string | undefined =>
    !value.trim()
      ? t('form.required')
      : value.trim().length > OUTCOME_LABEL_MAX_LENGTH
        ? t('admin.tooLong', { max: OUTCOME_LABEL_MAX_LENGTH })
        : undefined;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const found: Errors = {
      labelEn: labelError(labelEn),
      labelAr: labelError(labelAr),
      setsStatus: status ? undefined : t('form.required'),
    };
    if (found.labelEn || found.labelAr || found.setsStatus)
      return setErrors(found);
    setSaving(true);
    const body = {
      labelEn: labelEn.trim(),
      labelAr: labelAr.trim(),
      setsStatus: status,
    };
    try {
      const res = await callApi(
        outcome
          ? UPDATE_CALL_OUTCOME(outcome.id, body)
          : CREATE_CALL_OUTCOME(body),
        {
          showErrorToast: false,
          showSuccessToast: true,
          successMessage: outcome
            ? t('admin.settings.outcomeSaved')
            : t('admin.settings.outcomeCreated'),
        },
      );
      if (res.success) return onSaved(res.data);
      if (!isUnauthorized(res)) setErrors({ form: errorMessage(t, res) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex min-h-0 flex-1 flex-col"
      data-testid="outcome-form"
    >
      <DialogHeader>
        <DialogTitle>
          {outcome
            ? t('admin.settings.editTitle')
            : t('admin.settings.createTitle')}
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="grid content-start gap-5 pb-4">
        <FormField
          label={t('admin.settings.labelEn')}
          required
          error={errors.labelEn}
        >
          {(field) => (
            <Input
              {...field}
              lang="en"
              dir="ltr"
              className="rtl:text-end"
              value={labelEn}
              maxLength={OUTCOME_LABEL_MAX_LENGTH}
              disabled={saving}
              placeholder={t('admin.settings.labelEnPlaceholder')}
              data-testid="outcome-label-en"
              onChange={(event) => {
                setLabelEn(event.target.value);
                setErrors({});
              }}
            />
          )}
        </FormField>
        <FormField
          label={t('admin.settings.labelAr')}
          required
          error={errors.labelAr}
        >
          {(field) => (
            <Input
              {...field}
              lang="ar"
              dir="rtl"
              className="ltr:text-end"
              value={labelAr}
              maxLength={OUTCOME_LABEL_MAX_LENGTH}
              disabled={saving}
              placeholder={t('admin.settings.labelArPlaceholder')}
              data-testid="outcome-label-ar"
              onChange={(event) => {
                setLabelAr(event.target.value);
                setErrors({});
              }}
            />
          )}
        </FormField>
        <FormField
          label={t('admin.settings.setsStatus')}
          required
          error={errors.setsStatus}
        >
          {(field) => (
            <Select
              value={status || undefined}
              disabled={saving}
              onValueChange={(next) => {
                setStatus(next as OutcomeStatus);
                setErrors({});
              }}
            >
              <SelectTrigger
                id={field.id}
                aria-invalid={field['aria-invalid']}
                aria-describedby={field['aria-describedby']}
                data-testid="outcome-status"
              >
                <SelectValue
                  placeholder={t('admin.settings.statusPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {OutcomeStatusSchema.options.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`leadStatus.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormAlert message={errors.form} />
      </DialogBody>
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={onCancel}
        >
          {t('action.cancel')}
        </Button>
        <Button type="submit" disabled={saving} data-testid="outcome-submit">
          {saving && <LoaderCircle aria-hidden className="animate-spin" />}
          {saving ? t('dialog.working') : t('action.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
