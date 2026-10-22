'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useSession } from '@/components/session-provider';
import { useTranslation } from '@/i18n/i18n-provider';
import { adminRoutesFor } from '@/lib/routes';
import { AccountPanel } from './account-panel';
import { NAV_ICONS } from './nav-icons';

export function MorePanel() {
  const me = useSession();
  const { t } = useTranslation();
  const admin = adminRoutesFor(me?.permissions ?? []);

  return (
    <div className="grid gap-6">
      {admin.length > 0 && (
        <section aria-labelledby="more-admin" className="grid gap-2">
          <h2
            id="more-admin"
            className="px-1 text-xs font-semibold text-muted-foreground"
          >
            {t('nav.admin')}
          </h2>
          <ul className="grid rounded-lg bg-card p-1.5 shadow-raised">
            {admin.map((route) => {
              const Icon = NAV_ICONS[route.icon];
              return (
                <li key={route.href}>
                  <Link
                    href={route.href}
                    className="flex h-13 items-center gap-3 rounded-md px-3 font-semibold transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
                  >
                    <span
                      aria-hidden
                      className="grid size-9 place-items-center rounded-sm bg-primary-soft text-primary-soft-foreground"
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="flex-1 truncate">
                      {t(`nav.${route.labelKey}`)}
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="size-4 flip-rtl text-muted-foreground"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section aria-labelledby="more-account" className="grid gap-2">
        <h2
          id="more-account"
          className="px-1 text-xs font-semibold text-muted-foreground"
        >
          {t('account.menu')}
        </h2>
        <div className="rounded-lg bg-card p-5 shadow-raised">
          <AccountPanel />
        </div>
      </section>
    </div>
  );
}
