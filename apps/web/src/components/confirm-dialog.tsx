'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogSize,
} from '@/components/ui/dialog';
import { useTranslation } from '@/i18n/i18n-provider';

/**
 * "Are you sure?" for anything irreversible or heavy. While `onConfirm` runs, both buttons lock
 * and the confirm button shows it's working; the dialog closes only when it resolves to anything
 * but `false` (return `false` to keep it open, e.g. after an error toast).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  size = 'sm',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Extra content (a choice, a summary); the only part that scrolls. */
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => Promise<boolean | void> | boolean | void;
  destructive?: boolean;
  size?: DialogSize;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (pending) return;
    setPending(true);
    try {
      if ((await onConfirm()) !== false) onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent size={size} aria-busy={pending || undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && <DialogBody>{children}</DialogBody>}
        <DialogFooter>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel ?? t('action.cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={() => void confirm()}
          >
            {pending && <LoaderCircle aria-hidden className="animate-spin" />}
            {pending
              ? t('dialog.working')
              : (confirmLabel ?? t('dialog.confirm'))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
