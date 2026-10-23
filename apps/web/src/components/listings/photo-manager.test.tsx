import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Photo } from '@prime-crm/shared';
import { PhotoManager } from './photo-manager';
import { LISTING_ID, renderWith } from './test-fixtures';

const apis = vi.hoisted(() => ({
  REORDER_LISTING_PHOTOS: vi.fn(),
  DELETE_LISTING_PHOTO: vi.fn(),
  REQUEST_LISTING_PHOTO_TOKEN: vi.fn(),
  REGISTER_LISTING_PHOTO: vi.fn(),
}));
vi.mock('@/apis', () => apis);
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const upload = vi.hoisted(() => vi.fn());
vi.mock('./photo-upload', () => ({ uploadListingPhoto: upload }));

const heic2any = vi.hoisted(() => vi.fn());
vi.mock('heic2any', () => ({ default: heic2any }));

const photo = (n: number): Photo => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  url: `https://store.public.blob.vercel-storage.com/listings/x/${n}.jpg`,
  order: n - 1,
});

function pick(...files: File[]) {
  fireEvent.change(screen.getByTestId('photo-input'), { target: { files } });
}

const png = (name = 'living.png', size?: number) => {
  const file = new File(['x'], name, { type: 'image/png' });
  if (size) Object.defineProperty(file, 'size', { value: size });
  return file;
};

beforeEach(() => {
  upload.mockReset();
  heic2any.mockReset();
  apis.REORDER_LISTING_PHOTOS.mockReset();
});

describe('Photo manager', () => {
  it('shows each upload with its progress', async () => {
    upload.mockImplementation(
      (_id: string, _file: File, onProgress: (p: number) => void) => {
        onProgress(40);
        return new Promise(() => {});
      },
    );
    renderWith(
      <PhotoManager
        listingId={LISTING_ID}
        photos={[]}
        onPhotosChange={vi.fn()}
      />,
    );

    pick(png());

    const bar = await screen.findByRole('progressbar', { name: 'living.png' });
    await vi.waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '40'));
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByTestId('add-photos')).toBeDisabled();
  });

  it('refuses a file that is not a photo, and one over 10 MB', async () => {
    renderWith(
      <PhotoManager
        listingId={LISTING_ID}
        photos={[]}
        onPhotosChange={vi.fn()}
      />,
    );

    pick(
      new File(['%PDF'], 'contract.pdf', { type: 'application/pdf' }),
      png('huge.png', 11 * 1024 * 1024),
    );

    const alert = await screen.findByRole('alert');
    await vi.waitFor(() =>
      expect(alert).toHaveTextContent('huge.png is over 10 MB.'),
    );
    expect(alert).toHaveTextContent("contract.pdf isn't a photo we can use");
    expect(upload).not.toHaveBeenCalled();
  });

  it('converts an iPhone HEIC photo to JPEG before uploading', async () => {
    heic2any.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const onPhotosChange = vi.fn();
    upload.mockResolvedValue({ ok: true, photo: photo(1) });
    renderWith(
      <PhotoManager
        listingId={LISTING_ID}
        photos={[]}
        onPhotosChange={onPhotosChange}
      />,
    );

    pick(new File(['heic'], 'IMG_0042.HEIC', { type: 'image/heic' }));

    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(heic2any).toHaveBeenCalledWith(
      expect.objectContaining({ toType: 'image/jpeg' }),
    );
    const sent = upload.mock.calls[0][1] as File;
    expect(sent.type).toBe('image/jpeg');
    expect(sent.name).toBe('IMG_0042.jpg');
    await vi.waitFor(() =>
      expect(onPhotosChange).toHaveBeenCalledWith([photo(1)]),
    );
  });

  it('says so when uploads are not set up on the server', async () => {
    upload.mockResolvedValue({
      ok: false,
      failure: {
        success: false,
        status: 503,
        error: 'UPLOADS_NOT_CONFIGURED',
        message: 'x',
      },
    });
    renderWith(
      <PhotoManager
        listingId={LISTING_ID}
        photos={[]}
        onPhotosChange={vi.fn()}
      />,
    );
    pick(png('a.png'), png('b.png'));
    expect(
      await screen.findByText(
        "Photo uploads aren't set up on this server yet.",
      ),
    ).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('refuses photos past the 30th', async () => {
    const thirty = Array.from({ length: 29 }, (_, i) => ({
      ...photo(1),
      id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
      order: i,
    }));
    upload.mockReturnValue(new Promise(() => {}));
    renderWith(
      <PhotoManager
        listingId={LISTING_ID}
        photos={thirty}
        onPhotosChange={vi.fn()}
      />,
    );
    pick(png('a.png'), png('b.png'), png('c.png'));
    expect(
      await screen.findByText("A listing holds 30 photos. 2 weren't added."),
    ).toBeInTheDocument();
  });

  it('reorders with the move buttons', async () => {
    const user = userEvent.setup();
    const onPhotosChange = vi.fn();
    const photos = [photo(1), photo(2), photo(3)];
    apis.REORDER_LISTING_PHOTOS.mockResolvedValue({
      success: true,
      status: 200,
      data: [photo(2), photo(1), photo(3)],
    });
    renderWith(
      <PhotoManager
        listingId={LISTING_ID}
        photos={photos}
        onPhotosChange={onPhotosChange}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Move earlier 1' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move later 1' }));

    expect(apis.REORDER_LISTING_PHOTOS).toHaveBeenCalledWith(LISTING_ID, {
      photoIds: [photo(2).id, photo(1).id, photo(3).id],
    });
    // Optimistic first, then what the API saved.
    expect(onPhotosChange.mock.calls[0][0].map((p: Photo) => p.id)).toEqual([
      photo(2).id,
      photo(1).id,
      photo(3).id,
    ]);
  });

  it('puts the order back when the API refuses it', async () => {
    const user = userEvent.setup();
    const onPhotosChange = vi.fn();
    const photos = [photo(1), photo(2)];
    apis.REORDER_LISTING_PHOTOS.mockResolvedValue({
      success: false,
      status: 400,
      error: 'PHOTO_SET_MISMATCH',
      message: 'x',
    });
    renderWith(
      <PhotoManager
        listingId={LISTING_ID}
        photos={photos}
        onPhotosChange={onPhotosChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Move later 1' }));
    await vi.waitFor(() =>
      expect(onPhotosChange).toHaveBeenLastCalledWith(photos),
    );
    expect(
      screen.getByText('The photos changed meanwhile. Reload and try again.'),
    ).toBeInTheDocument();
  });
});
