import { changedFields } from './call-outcomes.pure';

const current = {
  labelEn: 'Busy',
  labelAr: 'مشغول',
  setsStatus: 'CONTACTED' as const,
  hidden: false,
  order: 2,
};

describe('call-outcomes.pure', () => {
  it('changedFields lists only what really changes, with from/to', () => {
    expect(changedFields(current, {})).toEqual({});
    expect(changedFields(current, { labelEn: 'Busy', order: 2 })).toEqual({});
    expect(
      changedFields(current, { labelAr: 'الخط مشغول', hidden: true, order: 0 }),
    ).toEqual({
      labelAr: { from: 'مشغول', to: 'الخط مشغول' },
      hidden: { from: false, to: true },
      order: { from: 2, to: 0 },
    });
  });
});
