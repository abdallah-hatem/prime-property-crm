'use client';

import { useFormStatus } from 'react-dom';
import { LoaderCircle, LogOut } from 'lucide-react';
import type { Language } from '@prime-crm/shared';
import { LOGOUT, UPDATE_MY_LANGUAGE } from '@/apis';
import { LocaleSwitch } from '@/components/locale-switch';
import { useSession } from '@/components/session-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { callApi } from '@/lib/callApi';
import { InstallCard } from './install-card';
import { UserAvatar } from './user-avatar';

/**
 * Who is signed in, their language and theme, and sign out. The same panel opens from the account
 * button (sidebar, phone top bar) and sits on the phone's More page.
 */
export function AccountPanel() {
  const me = useSession();
  const { t } = useTranslation();
  if (!me) return null;

  // The language is saved on the account too, so the next sign-in on another device opens in it.
  const saveLanguage = (language: Language) =>
    void callApi(UPDATE_MY_LANGUAGE(language), { showErrorToast: false });

  return (
    <div className="grid gap-5">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar name={me.name} />
        <div className="grid min-w-0">
          <p className="truncate font-bold" data-testid="account-name">
            {me.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <bdi>{me.email}</bdi>
          </p>
          <Badge variant="primary" dot="none" className="mt-1.5">
            {me.role.name}
          </Badge>
        </div>
      </div>
      <div className="grid gap-2">
        <p className="type-label">{t('language.label')}</p>
        <LocaleSwitch onSwitch={saveLanguage} className="w-full *:flex-1" />
      </div>
      <div className="grid gap-2">
        <p className="type-label">{t('theme.label')}</p>
        <ThemeToggle className="w-full *:flex-auto *:px-2" />
      </div>
      <InstallCard />
      <form action={LOGOUT}>
        <SignOutButton />
      </form>
    </div>
  );
}

function SignOutButton() {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <Button
      type="submit"
      variant="secondary"
      className="w-full"
      disabled={pending}
      data-testid="sign-out"
    >
      {pending ? (
        <LoaderCircle aria-hidden className="animate-spin" />
      ) : (
        <LogOut aria-hidden className="flip-rtl" />
      )}
      {pending ? t('account.signingOut') : t('account.signOut')}
    </Button>
  );
}
