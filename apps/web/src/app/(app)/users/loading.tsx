import { AdminListSkeleton } from '@/components/admin/admin-skeletons';

/** Users while they load. */
export default function Loading() {
  return <AdminListSkeleton filters={2} chips={3} />;
}
