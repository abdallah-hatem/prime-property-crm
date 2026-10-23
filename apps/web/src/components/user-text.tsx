import { cn } from '@/lib/utils';

type UserTextProps = {
  children: React.ReactNode;
  className?: string;
  title?: string;
  /**
   * `bdi` (default) isolates an inline run — a name or title inside a line of the page's own
   * language. A block element (`p`, `div`, `span`) gets `dir="auto"` instead, so a whole note or
   * description takes the direction of its first strong letter.
   */
  as?: 'bdi' | 'p' | 'div' | 'span';
};

/**
 * Text a person typed (names, titles, notes, addresses) rendered so its own direction wins: an
 * English note on the Arabic page keeps its full stop at the end and its words in order, and an
 * Arabic name in an English row doesn't drag the punctuation around it.
 */
export function UserText({
  children,
  className,
  title,
  as = 'bdi',
}: UserTextProps) {
  if (as === 'bdi')
    return (
      <bdi className={className} title={title}>
        {children}
      </bdi>
    );
  const Tag = as;
  return (
    <Tag dir="auto" className={cn('text-start', className)} title={title}>
      {children}
    </Tag>
  );
}
