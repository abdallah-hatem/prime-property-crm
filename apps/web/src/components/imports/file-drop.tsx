'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import {
  IMPORT_FILE_EXTENSIONS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
} from '@prime-crm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Why a picked file can't be sent, checked before any upload; null when it may go. */
export function fileProblem(file: File): 'FILE_TYPE' | 'FILE_TOO_LARGE' | null {
  const name = file.name.toLowerCase();
  if (!IMPORT_FILE_EXTENSIONS.some((ext) => name.endsWith(ext)))
    return 'FILE_TYPE';
  if (file.size > IMPORT_MAX_BYTES) return 'FILE_TOO_LARGE';
  return null;
}

const MAX_MB = IMPORT_MAX_BYTES / (1024 * 1024);

/**
 * Drop a spreadsheet here or pick one: the limits are written under it, a wrong type or a file
 * over 4 MB is refused here with the reason, and while the file uploads the zone says so.
 */
export function FileDrop({
  onFile,
  busy,
  error,
}: {
  onFile: (file: File) => void;
  busy: boolean;
  /** Translated reason the last file was refused. */
  error?: string;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file && !busy) onFile(file);
  };

  return (
    <div className="grid gap-3">
      <div
        data-testid="file-drop"
        data-over={over || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer.files);
        }}
        aria-busy={busy || undefined}
        className={cn(
          'relative grid justify-items-center gap-4 rounded-lg bg-card px-6 py-10 text-center shadow-raised',
          'outline-2 -outline-offset-8 outline-transparent transition-[outline-color,background-color] duration-200 ease-snappy outline-dashed',
          over && 'bg-primary-soft/40 outline-primary',
          error && !over && 'outline-destructive/60',
        )}
      >
        <span
          aria-hidden
          className="grid size-16 place-items-center rounded-pill bg-primary-soft text-primary-soft-foreground"
        >
          {busy ? (
            <LoaderCircle className="size-7 animate-spin" />
          ) : (
            <FileSpreadsheet className="size-7" />
          )}
        </span>
        <div className="grid gap-1">
          <p className="type-h2">
            {busy ? t('imports.uploading') : t('imports.dropTitle')}
          </p>
          <p className="text-sm text-muted-foreground">
            {busy ? t('imports.uploadingHint') : t('imports.dropOr')}
          </p>
        </div>
        <Button
          variant="soft"
          disabled={busy}
          onClick={() => input.current?.click()}
          data-testid="choose-file"
        >
          <Upload aria-hidden />
          {t('imports.chooseFile')}
        </Button>
        <Input
          ref={input}
          type="file"
          accept={IMPORT_FILE_EXTENSIONS.join(',')}
          className="hidden"
          tabIndex={-1}
          aria-hidden
          data-testid="file-input"
          onChange={(event) => {
            take(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {t('imports.limits', {
          types: IMPORT_FILE_EXTENSIONS.join(', '),
          size: MAX_MB,
          rows: formatNumber(IMPORT_MAX_ROWS),
        })}
      </p>
      {error && (
        <p
          role="alert"
          data-testid="file-error"
          className="rounded-md bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
