import { isSameSet, photoUrlProblem } from './photos.pure';

const ID = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';
const OTHER = '11111111-2222-4333-8444-555555555555';
const HOST = 'store1.private.blob.vercel-storage.com';
const PATH = `listings/${ID}/front-abc123.jpg`;
const URL_OK = `https://${HOST}/${PATH}`;

describe('photos.pure', () => {
  it('Photo registration with a URL not on our Blob store → 400 (checklist: input trust)', () => {
    expect(photoUrlProblem(URL_OK, PATH, ID, [HOST])).toBeNull();
    // Case-insensitive host; encoded path characters are compared decoded.
    expect(
      photoUrlProblem(URL_OK.replace(HOST, HOST.toUpperCase()), PATH, ID, [
        HOST,
      ]),
    ).toBeNull();
    const spaced = `listings/${ID}/a b.jpg`;
    expect(
      photoUrlProblem(`https://${HOST}/listings/${ID}/a%20b.jpg`, spaced, ID, [
        HOST,
      ]),
    ).toBeNull();

    const refused: [string, string][] = [
      [`https://evil.example/${PATH}`, PATH],
      [`https://${HOST}.evil.example/${PATH}`, PATH],
      [`http://${HOST}/${PATH}`, PATH],
      [`https://u:p@${HOST}/${PATH}`, PATH],
      [`https://${HOST}:444/${PATH}`, PATH],
      [URL_OK, `listings/${ID}/other.jpg`],
      [`https://${HOST}/listings/${OTHER}/a.jpg`, `listings/${OTHER}/a.jpg`],
      [`https://${HOST}/listings/${ID}/x/a.jpg`, `listings/${ID}/x/a.jpg`],
      [`https://${HOST}/listings/${ID}/`, `listings/${ID}/`],
      [`https://${HOST}/listings/${ID}/%E0%A4%A`, `listings/${ID}/x`],
      ['not a url', PATH],
    ];
    for (const [url, pathname] of refused) {
      expect(photoUrlProblem(url, pathname, ID, [HOST])).not.toBeNull();
    }
    expect(photoUrlProblem(URL_OK, PATH, ID, [])).not.toBeNull();
  });

  it('Reorder with a missing or foreign photo id → 400 (contract)', () => {
    expect(isSameSet(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
    expect(isSameSet(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
    expect(isSameSet(['a', 'b', 'x'], ['a', 'b', 'c'])).toBe(false);
    expect(isSameSet(['a', 'a', 'b'], ['a', 'b', 'c'])).toBe(false);
    expect(isSameSet(['a', 'b', 'c', 'x'], ['a', 'b', 'c'])).toBe(false);
  });
});
