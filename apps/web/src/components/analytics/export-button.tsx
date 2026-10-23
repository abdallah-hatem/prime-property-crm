'use client';

import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { EXPORT_CONTENT_TYPE, type ExportKind } from '@prime-crm/shared';
import { parseFilters, toQuery } from '@/components/listings/filters-url';
import {
  ownerQueryOf,
  parseOwnerFilters,
} from '@/components/owners-admin/owner-filters';
import { useCan } from '@/components/session-provider';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { callApi } from '@/lib/callApi';
import { cn } from '@/lib/utils';
import { DOWNLOAD_EXPORT } from './export-actions';

/** The export query for the list on screen: its URL filters, without paging. */
function currentQuery(kind: ExportKind, params: URLSearchParams): unknown {
  if (kind === 'owners')
    return ownerQueryOf(parseOwnerFilters(Object.fromEntries(params)));
  return toQuery(parseFilters(params), 1);
}

/** Hand the browser a file it saves under `fileName`. */
function saveFile(base64: string, fileName: string, type: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * "Export to Excel" for the owners table and the listings search (data.export only): the list's
 * current filters, one download at a time, busy while the file is prepared. Refusals
 * (EXPORT_TOO_LARGE: narrow the filters) are toasted by `handleResponse`.
 */
export function ExportButton({
  kind,
  showLabel = false,
  className,
}: {
  kind: ExportKind;
  /** Keep the label on phones too (a standalone button); otherwise phones get the icon. */
  showLabel?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const allowed = useCan('data.export');
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  if (!allowed) return null;

  const run = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const res = await callApi(
        DOWNLOAD_EXPORT(kind, currentQuery(kind, searchParams)),
      );
      if (res.success)
        saveFile(res.data.base64, res.data.fileName, EXPORT_CONTENT_TYPE);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={showLabel ? 'sm' : 'default'}
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() => void run()}
      data-testid={`export-${kind}`}
      className={cn('shrink-0', className)}
    >
      {busy ? (
        <LoaderCircle aria-hidden className="animate-spin" />
      ) : (
        <FileSpreadsheet aria-hidden />
      )}
      <span className={showLabel ? undefined : 'max-sm:sr-only'}>
        {busy ? t('analytics.export.preparing') : t('analytics.export.label')}
      </span>
    </Button>
  );
}
