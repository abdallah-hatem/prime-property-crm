import { listingLabel, photoLabel, trashSummary } from './trash.pure';

describe('trash labels', () => {
  it('labels a listing type · bedrooms · area, skipping missing bedrooms', () => {
    expect(
      listingLabel({ type: 'TWIN_HOUSE', bedrooms: 4, area: 'الشيخ زايد' }),
    ).toBe('Twin house · 4 BR · الشيخ زايد');
    expect(listingLabel({ type: 'LAND', bedrooms: null, area: 'Obour' })).toBe(
      'Land · Obour',
    );
  });

  it('labels a photo by its 1-based position and its listing', () => {
    expect(
      photoLabel({
        order: 0,
        listing: { type: 'APARTMENT', bedrooms: 0, area: 'Zamalek' },
      }),
    ).toBe('Photo 1 · Apartment · 0 BR · Zamalek');
  });

  it('writes the activity summary', () => {
    expect(trashSummary('Restored', 'LISTING', 'Villa · Maadi')).toBe(
      'Restored listing Villa · Maadi',
    );
  });
});
