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
import { isolate } from '@/lib/bidi';
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
  /**
   * The call waiting for the member to come back from the dialer. `call` is null until the API
   * answers; `back` is set when the member returned (or there was no dialer) before it did.
   */
  const awaiting = useRef<{
    call: CallSummary | null;
    left: boolean;
    back: boolean;
  } | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSheet = useCallback((call: CallSummary) => {
    awaiting.current = null;
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = null;
    setSheetCall(call);
    setSheetOpen(true);
  }, []);

  /** The member is back (or never left): the sheet opens now, or as soon as the call exists. */
  const arrive = useCallback(() => {
    const pending = awaiting.current;
    if (!pending) return;
    if (pending.call) showSheet(pending.call);
    else pending.back = true;
  }, [showSheet]);

  // Back from the dialer: the page was hidden (phones) or lost focus (desktop softphones).
  useEffect(() => {
    const onLeave = () => {
      if (!awaiting.current) return;
      awaiting.current.left = true;
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    };
    const onReturn = () => {
      if (awaiting.current?.left && document.visibilityState === 'visible')
        arrive();
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
  }, [arrive]);

  /**
   * Must run inside the member's tap. Phones open `tel:` only during a user gesture, so the
   * dialer opens right away while the call is created in the background; the outcome sheet
   * waits for that call.
   */
  const dial = useCallback(
    (target: CallTarget, phone: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusyOwnerId(target.id);

      const key = `${target.id}|${phone}`;
      const clientRequestId =
        requestIds.current.get(key) ?? crypto.randomUUID();
      requestIds.current.set(key, clientRequestId);

      const request = callApi(
        START_CALL(target.id, { phone, clientRequestId }),
      );
      awaiting.current = { call: null, left: false, back: false };
      fallbackTimer.current = setTimeout(() => {
        if (awaiting.current && !awaiting.current.left) arrive();
      }, NO_DIALER_FALLBACK_MS);
      openTel(phone);

      void request
        .then((res) => {
          if (!res.success) {
            // A refusal (Do not call, listed…) is final; a network failure keeps the id for the retry.
            if (!isUnauthorized(res) && res.status !== 0)
              requestIds.current.delete(key);
            awaiting.current = null;
            if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
            return;
          }
          requestIds.current.delete(key);
          const call = toSummary(res.data);
          if (!awaiting.current) return;
          awaiting.current.call = call;
          if (awaiting.current.back) showSheet(call);
        })
        .catch(() => {
          // The action itself didn't reach the server; the button frees up for another try.
          awaiting.current = null;
        })
        .finally(() => {
          inFlight.current = false;
          setBusyOwnerId(null);
        });
    },
    [arrive, showSheet],
  );

  const startCall = useCallback(
    (target: CallTarget, phone?: string) => {
      const known =
        phone ?? (target.phones?.length === 1 ? target.phones[0] : undefined);
      if (known) {
        dial(target, known);
        return;
      }
      if (target.phones) {
        setChoosing({ target, phones: target.phones });
        return;
      }
      // A reminder row has no numbers: load them, then ask for one more tap so the dialer
      // opens inside a gesture (a tel: link after a network wait is blocked on phones).
      if (inFlight.current) return;
      inFlight.current = true;
      setBusyOwnerId(target.id);
      void callApi(GET_OWNER(target.id))
        .then((res) => {
          if (res.success && res.data.phones.length > 0)
            setChoosing({ target, phones: res.data.phones });
        })
        .catch(() => {})
        .finally(() => {
          inFlight.current = false;
          setBusyOwnerId(null);
        });
    },
    [dial],
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
            <DialogTitle>
              {choosing && choosing.phones.length > 1
                ? t('calling.choosePhoneTitle')
                : t('calling.callName', {
                    name: isolate(choosing?.target.name ?? ''),
                  })}
            </DialogTitle>
            <DialogDescription
              className={
                choosing && choosing.phones.length > 1 ? undefined : 'sr-only'
              }
            >
              {t('calling.choosePhoneBody', {
                name: isolate(choosing?.target.name ?? ''),
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
                  dial(target, phone);
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
