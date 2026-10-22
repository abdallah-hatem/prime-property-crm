import { LoginForm } from '@/components/auth/login-form';
import { LocaleSwitch } from '@/components/locale-switch';
import { ThemeToggle } from '@/components/theme-toggle';
import { getTranslator } from '@/i18n/server';
import { safeReturnPath } from '@/lib/routes';

/** Sign-in. Signed-in visitors never see it: the proxy sends them to their home. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [t, params] = await Promise.all([getTranslator(), searchParams]);
  const next = safeReturnPath(
    typeof params.next === 'string' ? params.next : null,
  );

  return (
    <main className="flex min-h-dvh flex-col items-center bg-today-glow px-4 py-10 md:justify-center">
      <div className="grid w-full max-w-md gap-8">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-sm bg-primary-gradient font-numeric text-lg font-extrabold text-primary-foreground shadow-glow"
          >
            P
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            {t('app.name')}
          </span>
        </div>
        <section className="grid gap-6 rounded-lg bg-card p-6 shadow-raised md:p-8">
          <div className="grid gap-1.5">
            <h1 className="type-h1">{t('auth.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('auth.subtitle')}
            </p>
          </div>
          <LoginForm next={next} />
          <p className="text-xs text-muted-foreground">{t('auth.noAccount')}</p>
        </section>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}
