import { cn } from '@/lib/utils';

export type CounterTone = 'overdue' | 'due' | 'missing';

export interface Counter {
  tone: CounterTone;
  value: number;
  label: string;
}

const TONE: Record<CounterTone, { card: string; value: string; dot: string }> =
  {
    overdue: {
      card: 'bg-linear-160 from-destructive-soft to-card to-70%',
      value: 'text-destructive',
      dot: 'bg-destructive',
    },
    due: { card: 'bg-card', value: '', dot: 'bg-primary' },
    missing: {
      card: 'bg-linear-160 from-urgency-soft to-card to-70%',
      value: '',
      dot: 'bg-urgency',
    },
  };

export function CounterCard({
  tone,
  value,
  label,
  index = 0,
}: Counter & { index?: number }) {
  const styles = TONE[tone];
  return (
    <div
      className={cn(
        'grid gap-1 rounded-md px-3 pt-3 pb-2.5 shadow-raised',
        styles.card,
      )}
    >
      <b
        className={cn('animate-rise type-counter', styles.value)}
        // Counters rise 50ms apart; only the first few are staggered.
        style={{ animationDelay: `${Math.min(index, 4) * 50}ms` }}
      >
        {value.toLocaleString('en-US')}
      </b>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <span
          aria-hidden
          className={cn('size-2 shrink-0 rounded-full', styles.dot)}
        />
        {label}
      </span>
    </div>
  );
}

/** The three Today counters: overdue, due today, calls without an outcome. */
export function CounterBoard({ counters }: { counters: readonly Counter[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {counters.map((counter, index) => (
        <CounterCard key={counter.tone} {...counter} index={index} />
      ))}
    </div>
  );
}
