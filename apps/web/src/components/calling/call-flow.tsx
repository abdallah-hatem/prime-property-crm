'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { Phone } from 'lucide-react';
import type { Call } from '@prime-crm/shared';
import { GET_OWNER, START_CALL } from '@/apis';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { formatPhone } from '@/lib/format';
import { openTel } from '@/lib/tel';
import { OutcomeSheet, type CallSummary } from './outcome-sheet';

/** Who to call. Without `phones` (a reminder row), the owner is fetched first. */
export interface CallTarget {
  id: string;
  name: string;
  phones?: readonly string[];
}

interface CallFlowValue {
  /** Tap Call: pick a number if there are several, create the call once, open the dialer. */
  startCall: (target: CallTarget, phone?: string) => void;
  /** The owner whose call is being started (its Call button shows it's working). */
  busyOwnerId: string | null;
  /** Open the outcome sheet for a call that has none (Today's "Outcome missing"). */
  openOutcome: (call: CallSummary) => void;
}

const CallFlowContext = createContext<CallFlowValue | null>(null);

/** If the page never leaves for the dialer (a desktop without one), the sheet opens anyway. */
export const NO_DIALER_FALLBACK_MS = 3000;

export const toSummary = (call: Call): CallSummary => ({
  id: call.id,
  ownerName: call.owner.name,
  phone: call.phone,
  startedAt: call.startedAt,
});

/**
 * The call flow, mounted once for every signed-in page. Tap Call → `POST /owners/:id/calls` with a
 * client request id (kept until the call is created, so a retry or a second tap is the same call)
 * → `tel:` → when the page comes back into view, the outcome sheet opens.
 */
export function CallFlowProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [busyOwnerId, setBusyOwnerId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<{
    target: CallTarget;
    phones: readonly string[];
  } | null>(null);
  const [sheetCall, setSheetCall] = useState<CallSummary | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const inFlight = useRef(false);
  /** One id per owner + number until that call exists. */
  const requestIds = useRef(new Map<string, string>());
  /** The call waiting for the member to come back from the dialer. */
  const awaiting = useRef<{ call: CallSummary; left: boolean } | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSheet = useCallback((call: CallSummary) => {
    awaiting.current = null;
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = null;
    setSheetCall(call);
    setSheetOpen(true);
  }, []);

  // Back from the dialer: the page was hidden (phones) or lost focus (desktop softphones).
  useEffect(() => {
    const onLeave = () => {
      if (!awaiting.current) return;
      awaiting.current.left = true;
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    };
    const onReturn = () => {
      const pending = awaiting.current;
      if (pending?.left && document.visibilityState === 'visible')
        showSheet(pending.call);
    };
    const onVisibility = () =>
      document.visibilityState === 'hidden' ? onLeave() : onReturn();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onLeave);
    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('pageshow', onReturn);
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, [showSheet]);

  const dial = useCallback(
    async (target: CallTarget, phone: string) => {
      const key = `${target.id}|${phone}`;
      const clientRequestId =
        requestIds.current.get(key) ?? crypto.randomUUID();
      requestIds.current.set(key, clientRequestId);

      const res = await callApi(
        START_CALL(target.id, { phone, clientRequestId }),
      );
      if (!res.success) {
        // A refusal (Do not call, listed…) is final; a network failure keeps the id for the retry.
        if (!isUnauthorized(res) && res.status !== 0)
          requestIds.current.delete(key);
        return;
      }
      requestIds.current.delete(key);
      const call = toSummary(res.data);
      awaiting.current = { call, left: false };
      fallbackTimer.current = setTimeout(() => {
        if (awaiting.current && !awaiting.current.left)
          showSheet(awaiting.current.call);
      }, NO_DIALER_FALLBACK_MS);
      openTel(res.data.phone);
    },
    [showSheet],
  );

  const run = useCallback(
    async (ownerId: string, work: () => Promise<void>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusyOwnerId(ownerId);
      try {
        await work();
      } catch {
        // The action itself didn't reach the server; the button frees up for another try.
      } finally {
        inFlight.current = false;
        setBusyOwnerId(null);
      }
    },
    [],
  );

  const startCall = useCallback(
    (target: CallTarget, phone?: string) => {
      void run(target.id, async () => {
        let phones = target.phones;
        if (!phones) {
          const res = await callApi(GET_OWNER(target.id));
          if (!res.success) return;
          phones = res.data.phones;
        }
        const chosen = phone ?? (phones.length === 1 ? phones[0] : undefined);
        if (chosen) await dial(target, chosen);
        else if (phones.length > 1) setChoosing({ target, phones });
      });
    },
    [dial, run],
  );

  const value = useMemo(
    () => ({ startCall, busyOwnerId, openOutcome: showSheet }),
    [startCall, busyOwnerId, showSheet],
  );

  return (
    <CallFlowContext.Provider value={value}>
      {children}
      <Dialog
        open={choosing !== null}
        onOpenChange={(open) => !open && setChoosing(null)}
      >
        <DialogContent
          variant="sheet"
          size="sm"
          closeLabel={t('dialog.close')}
          data-testid="phone-chooser"
        >
          <DialogHeader>
            <DialogTitle>{t('calling.choosePhoneTitle')}</DialogTitle>
            <DialogDescription>
              {t('calling.choosePhoneBody', {
                name: choosing?.target.name ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-2 pb-6">
            {choosing?.phones.map((phone) => (
              <button
                key={phone}
                type="button"
                onClick={() => {
                  const { target } = choosing;
                  setChoosing(null);
                  void run(target.id, () => dial(target, phone));
                }}
                className="flex h-14 cursor-pointer items-center gap-3 rounded-md bg-secondary px-4 text-start transition-colors duration-150 hover:bg-accent active:bg-accent"
              >
                <span
                  aria-hidden
                  className="grid size-9 place-items-center rounded-pill bg-primary-gradient text-primary-foreground shadow-glow"
                >
                  <Phone className="size-4 fill-current" />
                </span>
                <bdi
                  dir="ltr"
                  className="font-numeric text-base font-bold tabular-nums"
                >
                  {formatPhone(phone)}
                </bdi>
              </button>
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <OutcomeSheet
        call={sheetCall}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          // Saved or left for later: lists, counters and Outcome missing catch up.
          if (!open) router.refresh();
        }}
      />
    </CallFlowContext.Provider>
  );
}

export function useCallFlow(): CallFlowValue {
  const context = useContext(CallFlowContext);
  if (!context)
    throw new Error('useCallFlow must be used inside <CallFlowProvider>');
  return context;
}
