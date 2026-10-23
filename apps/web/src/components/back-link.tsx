import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** "← All imports": the way back to a parent list, above the page header; the arrow mirrors in Arabic. */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('justify-self-start', className)}
      asChild
    >
      <Link href={href}>
        <ArrowLeft aria-hidden className="flip-rtl" />
        {children}
      </Link>
    </Button>
  );
}
