'use client';

import { useState, useSyncExternalStore } from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import {
  installPromptStore,
  isIosSafari,
  isStandalone,
  rememberDismissed,
  wasDismissed,
} from '@/lib/install-prompt';

type Device = 'hidden' | 'ios' | 'other';

const noSubscribe = () => () => {};
/** Read once on the client; the server (and the first hydration pass) renders no card. */
const readDevice = (): Device => {
  if (isStandalone() || wasDismissed()) return 'hidden';
  return isIosSafari() ? 'ios' : 'other';
};
const serverDevice = (): Device => 'hidden';

/**
 * A small, dismissible "Install the app" card for the account menu and the More page. Browsers
 * with an install prompt get an Install button; iOS Safari gets the Share → Add to Home Screen
 * steps. Hidden once installed, when already running from the home screen, or once dismissed.
 */
export function InstallCard() {
  const { t } = useTranslation();
  const device = useSyncExternalStore(noSubscribe, readDevice, serverDevice);
  const prompt = useSyncExternalStore(
    installPromptStore.subscribe,
    installPromptStore.getPrompt,
    () => null,
  );
  const installed = useSyncExternalStore(
    installPromptStore.subscribe,
    installPromptStore.getInstalled,
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  const dismiss = () => {
    rememberDismissed();
    setDismissed(true);
  };
  const install = async () => {
    setInstalling(true);
    try {
      const outcome = await installPromptStore.install();
      if (outcome === 'accepted') setDismissed(true);
    } finally {
      setInstalling(false);
    }
  };

  if (device === 'hidden' || dismissed || installed) return null;
  const ios = device === 'ios';
  if (!ios && !prompt && !installing) return null;

  return (
    <section
      aria-labelledby="install-card-title"
      data-testid="install-card"
      className="grid gap-3 rounded-md bg-secondary p-4"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 40px static SVG; next/image adds nothing */}
        <img
          src="/icons/icon.svg"
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-sm shadow-soft"
        />
        <div className="grid min-w-0 gap-0.5">
          <h3 id="install-card-title" className="type-label">
            {ios ? t('install.iosTitle') : t('install.title')}
          </h3>
          {!ios && (
            <p className="text-[13px] text-muted-foreground">
              {t('install.body')}
            </p>
          )}
        </div>
      </div>
      {ios && (
        <ol className="grid gap-2 text-[13px]">
          <li className="flex items-center gap-2.5">
            <Share
              aria-hidden
              className="size-[18px] shrink-0 text-primary-soft-foreground"
            />
            <span>{t('install.iosStep1')}</span>
          </li>
          <li className="flex items-center gap-2.5">
            <SquarePlus
              aria-hidden
              className="size-[18px] shrink-0 text-primary-soft-foreground"
            />
            <span>{t('install.iosStep2')}</span>
          </li>
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        {!ios && (
          <Button
            size="sm"
            variant="soft"
            onClick={() => void install()}
            disabled={installing}
            data-testid="install-app"
          >
            <Download aria-hidden />
            {installing ? t('install.installing') : t('install.action')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={dismiss}
          data-testid="install-dismiss"
        >
          {ios ? t('install.gotIt') : t('install.dismiss')}
        </Button>
      </div>
    </section>
  );
}
