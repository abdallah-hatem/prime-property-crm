import { AdminListSkeleton } from '@/components/admin/admin-skeletons';

/** The trash while it loads. */
export default function Loading() {
  return <AdminListSkeleton filters={0} chips={4} />;
}
