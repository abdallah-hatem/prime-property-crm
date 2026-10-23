import { notFound } from 'next/navigation';
import { GET_LISTING } from '@/apis';
import { ListingDetail } from '@/components/listings/listing-detail';
import { ListingLoadError } from '@/components/listings/listing-load-error';

/** One listing. The API decides whether the owner phone is in it. */
export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await GET_LISTING(id);
  if (!res.success) {
    if (res.status === 404 || res.status === 400) notFound();
    return <ListingLoadError />;
  }
  return <ListingDetail key={res.data.updatedAt} listing={res.data} />;
}
