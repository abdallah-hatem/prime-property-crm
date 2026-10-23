'use client';

import {
  IMPORT_REQUIRED_FIELDS,
  importFieldsOf,
  type ImportKind,
} from '@prime-crm/shared';
import { FormField } from '@/components/form-field';
import { fieldLabel } from '@/components/imports/import-bits';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/i18n/i18n-provider';

/** Radix Select can't hold '' — this is "no column for this field". */
export const NOT_MAPPED = '__none__';

/** Required fields of the kind that have no column yet. */
export function missingRequired(
  kind: ImportKind,
  mapping: Record<string, string>,
): string[] {
  return IMPORT_REQUIRED_FIELDS[kind].filter((field) => !mapping[field]);
}

/** The mapping the API takes: only fields with a column. */
export function mappingBody(
  mapping: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mapping).filter(([, header]) => !!header),
  );
}

/**
 * One picker per field of the kind, listing the file's columns. Required fields carry the
 * asterisk; after a failed Continue each unmapped required field says so.
 */
export function ColumnMapping({
  kind,
  headers,
  mapping,
  onChange,
  showErrors,
  disabled,
}: {
  kind: ImportKind;
  headers: readonly string[];
  mapping: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
  showErrors: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const required = new Set<string>(IMPORT_REQUIRED_FIELDS[kind]);
  const fields = [...importFieldsOf(kind)].sort(
    (a, b) => Number(required.has(b)) - Number(required.has(a)),
  );

  return (
    <div
      className="grid gap-x-4 gap-y-4 sm:grid-cols-2"
      data-testid="column-mapping"
    >
      {fields.map((field) => {
        const isRequired = required.has(field);
        const missing = showErrors && isRequired && !mapping[field];
        return (
          <FormField
            key={field}
            label={fieldLabel(t, field)}
            required={isRequired}
            error={missing ? t('imports.fieldRequired') : undefined}
          >
            {(control) => (
              <Select
                value={mapping[field] || NOT_MAPPED}
                disabled={disabled}
                onValueChange={(header) =>
                  onChange({
                    ...mapping,
                    [field]: header === NOT_MAPPED ? '' : header,
                  })
                }
              >
                <SelectTrigger
                  id={control.id}
                  aria-invalid={control['aria-invalid']}
                  aria-describedby={control['aria-describedby']}
                  aria-required={isRequired || undefined}
                  data-testid={`map-${field}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_MAPPED}>
                    <span className="text-muted-foreground">
                      {t('imports.notMapped')}
                    </span>
                  </SelectItem>
                  {headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      <bdi>{header}</bdi>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        );
      })}
    </div>
  );
}
