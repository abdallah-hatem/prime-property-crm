import { LocaleSwitch } from '@/components/locale-switch';
import { ThemeToggle } from '@/components/theme-toggle';
import { getTranslator } from '@/i18n/server';

/** Placeholder home until the Today screen lands. */
export default async function HomePage() {
  const t = await getTranslator();

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <h1 className="type-title">{t('app.name')}</h1>
      <p className="type-body text-muted-foreground">{t('app.tagline')}</p>
      <div className="flex flex-wrap gap-3">
        <ThemeToggle />
        <LocaleSwitch />
      </div>
    </main>
  );
}
