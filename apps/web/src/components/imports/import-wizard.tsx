'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Check, CircleCheck, LoaderCircle } from 'lucide-react';
import {
  IMPORT_REQUIRED_FIELDS,
  importFieldsOf,
  type ImportJob,
  type ImportKind,
  type ImportPreview as Preview,
} from '@prime-crm/shared';
import { CONFIRM_IMPORT, PREVIEW_IMPORT, UPLOAD_IMPORT } from '@/apis';
import {
  ColumnMapping,
  mappingBody,
  missingRequired,
} from '@/components/imports/column-mapping';
import { FileDrop, fileProblem } from '@/components/imports/file-drop';
import {
  fieldLabel,
  ImportCountTiles,
  kindLabel,
} from '@/components/imports/import-bits';
import { ImportPreview } from '@/components/imports/import-preview';
import {
  AssigneeSelect,
  UNASSIGNED,
  useAssigneeOptions,
} from '@/components/owners-admin/assignee-select';
import { BackLink } from '@/components/back-link';
import { PageHeader } from '@/components/page-header';
import { UserText } from '@/components/user-text';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { errorMessage } from '@/lib/error-message';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const STEPS = ['file', 'columns', 'preview', 'report'] as const;
type Step = (typeof STEPS)[number];

/** The job's suggested (or chosen) mapping, keeping only fields of the kind and real headers. */
function initialMapping(job: ImportJob): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of importFieldsOf(job.kind)) {
    const header = job.mapping?.[field];
    out[field] = header && job.headers.includes(header) ? header : '';
  }
  return out;
}

function Stepper({ step }: { step: Step }) {
  const { t } = useTranslation();
  const current = STEPS.indexOf(step);
  return (
    <ol
      aria-label={t('imports.stepsLabel')}
      className="flex items-center gap-2"
      data-testid="wizard-steps"
    >
      {STEPS.map((name, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={name}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2',
              active ? 'shrink-0' : 'min-w-0',
              index < STEPS.length - 1 && 'flex-1',
            )}
          >
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-pill font-numeric text-sm font-bold',
                active && 'bg-primary text-primary-foreground shadow-glow',
                done && 'bg-primary-soft text-primary-soft-foreground',
                !active && !done && 'bg-secondary text-muted-foreground',
              )}
            >
              {done ? <Check aria-hidden className="size-4" /> : index + 1}
            </span>
            <span
              className={cn(
                'truncate text-sm font-semibold',
                active
                  ? 'text-foreground'
                  : 'hidden text-muted-foreground sm:inline',
              )}
            >
              {t(`imports.steps.${name}`)}
            </span>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'h-0.5 min-w-4 flex-1 rounded-pill',
                  done ? 'bg-primary/50' : 'bg-border',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The step's actions, pinned under its content: back on the start edge, go on the end edge. */
function StepActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      {children}
    </div>
  );
}

/**
 * Import owners or listings from a spreadsheet: pick the kind (by permission) and the file, match
 * its columns to fields (suggested from the headers; required fields first and marked), optionally
 * give the rows to a member, preview (counts, first rows, issues), confirm once, read the report.
 * Every request locks the step's buttons and says what it's doing.
 */
export function ImportWizard({
  kinds,
  canAssign,
  resume,
}: {
  /** Kinds the user may import, in display order (at least one). */
  kinds: readonly ImportKind[];
  canAssign: boolean;
  /** An unfinished job to continue at the columns step. */
  resume?: ImportJob;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(resume ? 'columns' : 'file');
  const [kind, setKind] = useState<ImportKind>(resume?.kind ?? kinds[0]!);
  const [job, setJob] = useState<ImportJob | null>(resume ?? null);
  const [mapping, setMapping] = useState<Record<string, string>>(
    resume ? initialMapping(resume) : {},
  );
  const [assignTo, setAssignTo] = useState(resume?.assignTo?.id ?? UNASSIGNED);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportJob | null>(null);
  const [busy, setBusy] = useState<'upload' | 'preview' | 'confirm' | null>(
    null,
  );
  const inFlight = useRef(false);
  const [fileError, setFileError] = useState<string>();
  const [showMappingErrors, setShowMappingErrors] = useState(false);
  const assignees = useAssigneeOptions(canAssign && step === 'columns');

  /** One request at a time across the whole wizard. */
  async function run<T>(
    what: 'upload' | 'preview' | 'confirm',
    work: () => Promise<T>,
  ): Promise<T | undefined> {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(what);
    try {
      return await work();
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function upload(file: File) {
    const problem = fileProblem(file);
    if (problem) {
      setFileError(t(`error.${problem}`));
      return;
    }
    setFileError(undefined);
    void run('upload', async () => {
      const form = new FormData();
      form.set('kind', kind);
      form.set('file', file);
      const res = await callApi(UPLOAD_IMPORT(form), { showErrorToast: false });
      if (isUnauthorized(res)) return;
      if (!res.success) {
        setFileError(errorMessage(t, res));
        return;
      }
      setJob(res.data);
      setMapping(initialMapping(res.data));
      setShowMappingErrors(false);
      setPreview(null);
      setStep('columns');
    });
  }

  const missing = job ? missingRequired(job.kind, mapping) : [];

  function runPreview() {
    if (!job) return;
    if (missing.length > 0) {
      setShowMappingErrors(true);
      return;
    }
    void run('preview', async () => {
      const body = {
        mapping: mappingBody(mapping),
        ...(canAssign && assignTo !== UNASSIGNED ? { assignTo } : {}),
      };
      const res = await callApi(PREVIEW_IMPORT(job.id, body));
      if (isUnauthorized(res) || !res.success) return;
      setPreview(res.data);
      setJob(res.data.job);
      setStep('preview');
    });
  }

  function confirm() {
    if (!job) return;
    void run('confirm', async () => {
      const res = await callApi(CONFIRM_IMPORT(job.id));
      if (isUnauthorized(res) || !res.success) return;
      setResult(res.data);
      setStep('report');
    });
  }

  function restart() {
    setJob(null);
    setPreview(null);
    setResult(null);
    setMapping({});
    setFileError(undefined);
    setStep('file');
  }

  const toBeAdded = preview?.job.counts?.added ?? 0;
  const requiredNames = (job ? IMPORT_REQUIRED_FIELDS[job.kind] : [])
    .filter((field) => missing.includes(field))
    .map((field) => fieldLabel(t, field))
    .join(', ');

  return (
    <div className="grid grid-cols-1 gap-6">
      <BackLink href="/imports">{t('imports.allImports')}</BackLink>
      <PageHeader
        title={t('imports.newTitle')}
        description={job ? <UserText>{job.fileName}</UserText> : undefined}
      />
      <Stepper step={step} />

      {step === 'file' && (
        <section className="grid grid-cols-1 gap-5" data-testid="step-file">
          {kinds.length > 1 && (
            <div className="grid gap-2">
              <p className="type-label">{t('imports.kindQuestion')}</p>
              <SegmentedControl
                label={t('imports.kindQuestion')}
                value={kind}
                onChange={setKind}
                disabled={busy !== null}
                className="justify-self-start"
                options={kinds.map((value) => ({
                  value,
                  label: kindLabel(t, value),
                }))}
              />
            </div>
          )}
          <FileDrop
            onFile={upload}
            busy={busy === 'upload'}
            error={fileError}
          />
        </section>
      )}

      {step === 'columns' && job && (
        <section className="grid grid-cols-1 gap-6" data-testid="step-columns">
          <div className="grid gap-1">
            <h2 className="type-h2">{t('imports.mappingTitle')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('imports.mappingBody', {
                rows: formatNumber(job.totalRows),
                columns: formatNumber(job.headers.length),
              })}
            </p>
          </div>
          <div className="rounded-lg bg-card p-4 shadow-raised sm:p-6">
            <ColumnMapping
              kind={job.kind}
              headers={job.headers}
              mapping={mapping}
              onChange={(next) => setMapping(next)}
              showErrors={showMappingErrors}
              disabled={busy !== null}
            />
          </div>
          {canAssign && (
            <div className="rounded-lg bg-card p-4 shadow-raised sm:p-6">
              <AssigneeSelect
                label={
                  job.kind === 'OWNERS'
                    ? t('imports.assignOwners')
                    : t('imports.assignListings')
                }
                hint={
                  job.kind === 'OWNERS'
                    ? t('imports.assignOwnersHint')
                    : t('imports.assignListingsHint')
                }
                value={assignTo}
                onChange={setAssignTo}
                state={assignees.state}
                onRetry={assignees.retry}
                noneLabel={
                  job.kind === 'OWNERS'
                    ? t('ownersAdmin.nobody')
                    : t('imports.assignMe')
                }
                placeholder={t('ownersAdmin.assignPlaceholder')}
                disabled={busy !== null}
              />
            </div>
          )}
          {showMappingErrors && missing.length > 0 && (
            <p
              role="alert"
              data-testid="mapping-error"
              className="rounded-md bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive"
            >
              {t('imports.mapRequired', { fields: requiredNames })}
            </p>
          )}
          {busy === 'preview' && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('imports.previewing')}
            </p>
          )}
          <StepActions>
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={restart}
            >
              {t('imports.otherFile')}
            </Button>
            <Button
              disabled={busy !== null}
              onClick={runPreview}
              data-testid="run-preview"
            >
              {busy === 'preview' && (
                <LoaderCircle aria-hidden className="animate-spin" />
              )}
              {t('imports.previewAction')}
            </Button>
          </StepActions>
        </section>
      )}

      {step === 'preview' && preview && job && (
        <section className="grid grid-cols-1 gap-6" data-testid="step-preview">
          <ImportPreview preview={preview} />
          {busy === 'confirm' && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('imports.confirming')}
            </p>
          )}
          <StepActions>
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => setStep('columns')}
            >
              {t('imports.backToColumns')}
            </Button>
            <Button
              disabled={busy !== null || toBeAdded === 0}
              onClick={confirm}
              data-testid="confirm-import"
            >
              {busy === 'confirm' && (
                <LoaderCircle aria-hidden className="animate-spin" />
              )}
              {busy === 'confirm'
                ? t('imports.importing')
                : toBeAdded === 0
                  ? t('imports.nothingToImport')
                  : t('imports.confirmAction', {
                      count: formatNumber(toBeAdded),
                    })}
            </Button>
          </StepActions>
        </section>
      )}

      {step === 'report' && result && (
        <section className="grid grid-cols-1 gap-6" data-testid="step-report">
          <div className="flex items-center gap-4 rounded-lg bg-card p-5 shadow-raised">
            <span
              aria-hidden
              className="grid size-12 shrink-0 place-items-center rounded-pill bg-success-soft text-success"
            >
              <CircleCheck className="size-6" />
            </span>
            <div className="grid min-w-0 gap-0.5">
              <h2 className="type-h2">{t('imports.reportTitle')}</h2>
              <p className="truncate text-sm text-muted-foreground">
                <bdi>{result.fileName}</bdi>
              </p>
            </div>
          </div>
          {result.counts && <ImportCountTiles counts={result.counts} done />}
          <StepActions>
            <Button variant="secondary" onClick={restart}>
              {t('imports.another')}
            </Button>
            {result.counts &&
              result.counts.duplicates + result.counts.rejected > 0 && (
                <Button variant="soft" asChild>
                  <Link href={`/imports/${result.id}`}>
                    {t('imports.seeIssues')}
                  </Link>
                </Button>
              )}
            <Button asChild>
              <Link
                href={
                  result.kind === 'OWNERS'
                    ? `/owners?importId=${result.id}`
                    : '/listings'
                }
              >
                {result.kind === 'OWNERS'
                  ? t('imports.seeOwners')
                  : t('imports.seeListings')}
              </Link>
            </Button>
          </StepActions>
        </section>
      )}
    </div>
  );
}
