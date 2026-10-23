import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Check, MessageSquare, Phone, TriangleAlert } from 'lucide-react';
import { LocaleSwitch } from '@/components/locale-switch';
import { CounterBoard } from '@/components/today/counter-board';
import { OwnerRow } from '@/components/today/owner-row';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getLocale, getTranslator } from '@/i18n/server';
import { cn } from '@/lib/utils';
import { designSamples, PALETTE_ROLES, TYPE_CLASSES } from './samples';
import { SwatchValue } from './swatch-value';

export const metadata: Metadata = { robots: { index: false } };

function Section({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-5">
      <div className="grid max-w-[70ch] gap-1.5">
        <h2 className="type-h1">{title}</h2>
        {lead ? (
          <p className="type-body text-muted-foreground">{lead}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="type-h2">{children}</h3>;
}

/** Dev-only living style guide. Answers 404 in production builds. */
export default async function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const locale = await getLocale();
  const t = await getTranslator();
  const s = designSamples[locale];

  return (
    <main className="mx-auto grid max-w-6xl gap-16 px-4 pt-10 pb-24 md:px-8">
      <header className="grid gap-5">
        <h1 className="bg-linear-100 from-primary via-primary-end via-60% to-urgency bg-clip-text type-display text-transparent md:text-7xl">
          {s.title}
        </h1>
        <p className="max-w-[62ch] type-body text-muted-foreground">
          {s.intro}
        </p>
        <div className="flex flex-wrap gap-3">
          <ThemeToggle />
          <LocaleSwitch />
        </div>
      </header>

      <Section title={s.palette} lead={s.paletteLead}>
        <div className="grid gap-6 md:grid-cols-2">
          {(['light', 'dark'] as const).map((theme) => (
            <div
              key={theme}
              className={cn(
                theme,
                'rounded-lg bg-background p-5 text-foreground shadow-raised',
              )}
            >
              <h3 className="mb-3.5 type-h2">
                {theme === 'light' ? s.light : s.dark}
              </h3>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {PALETTE_ROLES.map((role) => (
                  <div
                    key={role}
                    className="grid grid-rows-[60px_auto_auto] overflow-hidden rounded-md bg-card shadow-soft"
                  >
                    <i
                      className="m-1.5 block rounded-sm"
                      style={{ background: `var(--${role})` }}
                    />
                    <b className="px-2.5 pt-0.5 text-xs font-bold">
                      {s.roles[role]}
                    </b>
                    <SwatchValue token={role} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={s.type} lead={s.typeLead}>
        <div className="grid gap-6 md:grid-cols-2">
          {(['en', 'ar'] as const).map((lang) => (
            <Card
              key={lang}
              lang={lang}
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              className="px-6 py-3"
            >
              {designSamples[lang].typeRows.map(([spec, sample], i) => (
                <div
                  key={spec}
                  className="grid gap-0.5 border-b border-border py-3 last:border-b-0"
                >
                  <small className="type-caption text-muted-foreground">
                    {spec}
                  </small>
                  <span className={TYPE_CLASSES[i]}>{sample}</span>
                </div>
              ))}
            </Card>
          ))}
        </div>
      </Section>

      <Section title={s.components}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <SubHeading>{s.buttons}</SubHeading>
            <div className="flex flex-wrap items-center gap-3">
              <Button>
                <Phone aria-hidden className="fill-current" />
                {s.buttonLabels.call}
              </Button>
              <Button variant="soft">{s.buttonLabels.soft}</Button>
              <Button variant="secondary">{s.buttonLabels.secondary}</Button>
              <Button variant="outline">{s.buttonLabels.outline}</Button>
              <Button variant="ghost">{s.buttonLabels.ghost}</Button>
              <Button variant="inverse" size="sm">
                {s.buttonLabels.inverse}
              </Button>
              <Button variant="destructive">
                {s.buttonLabels.destructive}
              </Button>
              <Button disabled>{s.buttonLabels.disabled}</Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label={s.buttonLabels.note}
              >
                <MessageSquare aria-hidden />
              </Button>
            </div>
            <div className="flex items-center gap-2 rounded-pill border border-border bg-card/80 p-2 shadow-raised backdrop-blur-lg">
              <Button size="lg" className="flex-1">
                <Phone aria-hidden className="fill-current" />
                {s.buttonLabels.dock}
              </Button>
              <Button
                variant="secondary"
                size="icon-lg"
                aria-label={s.buttonLabels.note}
              >
                <MessageSquare aria-hidden />
              </Button>
            </div>
          </div>

          <div className="grid content-start gap-4">
            <SubHeading>{s.chips}</SubHeading>
            <div className="flex flex-wrap gap-2">
              <Badge variant="primary">{s.chipLabels.new}</Badge>
              <Badge variant="warning">{s.chipLabels.callBack}</Badge>
              <Badge variant="success">{s.chipLabels.interested}</Badge>
              <Badge variant="success" dot="live">
                {s.chipLabels.live}
              </Badge>
              <Badge variant="destructive">{s.chipLabels.overdue}</Badge>
              <Badge variant="neutral">{s.chipLabels.contacted}</Badge>
              <Badge variant="solid" dot="none">
                <Check aria-hidden />
                {s.chipLabels.listed}
              </Badge>
            </div>

            <SubHeading>{s.inputs}</SubHeading>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="design-name">
                  {s.nameLabel}
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </Label>
                <Input
                  id="design-name"
                  required
                  placeholder={s.namePlaceholder}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="design-phone">{s.phoneLabel}</Label>
                <Input
                  id="design-phone"
                  inputMode="tel"
                  dir="ltr"
                  aria-invalid
                  aria-describedby="design-phone-error"
                  defaultValue="0131234567"
                  placeholder={s.phonePlaceholder}
                />
                <p
                  id="design-phone-error"
                  className="text-[13px] text-destructive"
                >
                  {s.phoneError}
                </p>
              </div>
            </div>
          </div>

          <div className="grid content-start gap-4 lg:col-span-2">
            <SubHeading>{s.cards}</SubHeading>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-urgency/35 bg-linear-135 from-urgency-soft to-card to-80% p-4 shadow-raised">
                <span className="row-span-3 grid size-10 place-items-center rounded-[14px] bg-urgency text-urgency-foreground">
                  <TriangleAlert aria-hidden className="size-5" />
                </span>
                <strong className="text-[15px] font-bold">{s.missTitle}</strong>
                <p className="text-[13px] text-muted-foreground">
                  {s.missBody}
                </p>
                <Button
                  variant="inverse"
                  size="sm"
                  className="mt-2 justify-self-start"
                >
                  {s.buttonLabels.inverse}
                </Button>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>{s.cardTitle}</CardTitle>
                  <CardDescription>{s.cardBody}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="success" dot="live">
                    {t('adStatus.LIVE')}
                  </Badge>
                </CardContent>
                <CardFooter>
                  <Button variant="soft" size="sm" className="flex-1">
                    {s.buttonLabels.soft}
                  </Button>
                  <Button variant="secondary" size="sm" className="flex-1">
                    {s.buttonLabels.secondary}
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </div>
      </Section>

      <Section title={s.today} lead={s.todayLead}>
        <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-xl border border-border bg-background shadow-float">
          <div className="bg-today-glow px-4.5 pt-4 pb-1">
            <div className="flex items-center justify-between text-[13px] font-semibold text-muted-foreground">
              <span>{s.date}</span>
              <span className="grid size-9.5 place-items-center rounded-full bg-primary-gradient text-sm font-bold text-primary-foreground shadow-glow">
                {s.initials}
              </span>
            </div>
            <h2 className="mt-1 mb-3.5 type-title">{t('today.title')}</h2>
            <CounterBoard
              counters={[
                {
                  tone: 'overdue',
                  value: s.counters.overdue,
                  label: t('today.overdue'),
                },
                {
                  tone: 'due',
                  value: s.counters.due,
                  label: t('today.dueToday'),
                },
                {
                  tone: 'missing',
                  value: s.counters.missing,
                  label: t('today.noOutcome'),
                },
              ]}
            />
          </div>
          <div className="flex items-center justify-between px-5 pt-5 pb-2.5">
            <h3 className="text-base font-bold">{s.overdueSection}</h3>
            <span className="rounded-pill bg-secondary px-2.5 text-xs font-bold text-muted-foreground">
              {(1).toLocaleString('en-US')}
            </span>
          </div>
          <div className="grid gap-2.5 px-4 pb-6">
            <OwnerRow
              urgency="overdue"
              name={s.row.name}
              detail={s.row.area}
              status={
                <Badge variant="warning">{t('leadStatus.CALL_BACK')}</Badge>
              }
              when={s.row.when}
              callLabel={t('action.call')}
            />
          </div>
        </div>
      </Section>
    </main>
  );
}
