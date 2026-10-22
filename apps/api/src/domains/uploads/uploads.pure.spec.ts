import { storeIdOf } from './blob.config';
import { uploadRefusal } from './uploads.pure';

const ID = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';

describe('uploads.pure', () => {
  it('a photo uploads only directly into its listing folder', () => {
    expect(uploadRefusal(`listings/${ID}/front.jpg`, ID)).toBeNull();
    for (const pathname of [
      `listings/${ID}/`,
      `listings/${ID}/a/b.jpg`,
      `listings/${ID}/..`,
      String.raw`listings/${ID}/a\b.jpg`,
      `listings/11111111-2222-4333-8444-555555555555/a.jpg`,
      'a.jpg',
    ]) {
      expect(uploadRefusal(pathname, ID)).not.toBeNull();
    }
  });

  it('reads the store id from a read-write token like @vercel/blob does', () => {
    expect(storeIdOf('vercel_blob_rw_AbC123_secretpart')).toBe('abc123');
    expect(storeIdOf('nonsense')).toBeNull();
  });
});
