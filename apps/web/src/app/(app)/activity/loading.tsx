import { AdminListSkeleton } from '@/components/admin/admin-skeletons';

/** The activity log while it loads. */
export default function Loading() {
  return <AdminListSkeleton filters={3} />;
}
