import { PageHeaderSkeleton } from '@/components/skeletons';
import { OwnerRowSkeleton } from '@/components/today/owner-row';
import { Skeleton } from '@/components/ui/skeleton';
import { getSession } from '@/lib/session';

const STATUS_PILLS = [16, 20, 24, 20, 28];

/**
 * Owners while they load, in the shape the page will have: whoever sees all owners or assigns
 * them gets the admin table (search, pills, five pickers, the selection bar, table rows); a
 * member gets their own list (search, pills, owner rows).
 */
export default async function Loading() {
  const session = await getSession();
  const permissions =
    session.status === 'signedIn' ? session.me.permissions : [];
  const canAssign = permissions.includes('owners.assign');
  const admin = canAssign || permissions.includes('owners.viewAll');

  return (
    <div className="grid grid-cols-1 gap-5" aria-busy>
      <PageHeaderSkeleton />
      <div className="grid gap-3">
        <Skeleton className="h-11 rounded-sm" />
        <div className="flex gap-2 overflow-hidden">
          {STATUS_PILLS.map((w, i) => (
            <Skeleton
              key={i}
              className="h-11 shrink-0 rounded-pill"
              style={{ width: `${w * 4}px` }}
            />
          ))}
        </div>
        {admin && (
          <>
            {/* Phones fold the pickers behind a "Filters" button. */}
            <Skeleton className="h-9 w-28 rounded-pill md:hidden" />
            <div className="hidden gap-3 md:grid md:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="grid gap-1.5">
                  <Skeleton className="h-3 w-16 rounded-pill" />
                  <Skeleton className="h-11 rounded-sm" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {admin && canAssign && <Skeleton className="h-16 rounded-lg" />}
      {admin ? (
        <>
          <div className="grid gap-2.5 md:hidden">
            {Array.from({ length: 6 }, (_, i) => (
              <OwnerRowSkeleton key={i} />
            ))}
          </div>
          <div className="hidden gap-4 rounded-lg bg-card p-5 shadow-raised md:grid">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-5 rounded-pill" />
            ))}
          </div>
        </>
      ) : (
        <div className="grid gap-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <OwnerRowSkeleton key={i} />
          ))}
        </div>
      )}
    </div>
  );
}
