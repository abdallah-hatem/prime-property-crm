import { SettingsService } from './settings.service';

const tx = { tx: true };

function makeService(current = 7) {
  const db = {
    transaction: jest.fn((work: (t: unknown) => unknown) => work(tx)),
  };
  const settings = {
    adCheckInDays: jest.fn().mockResolvedValue(current),
    lockAdCheckInDays: jest.fn().mockResolvedValue(current),
    setAdCheckInDays: jest.fn((_t: unknown, days: number) =>
      Promise.resolve(days),
    ),
  };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new SettingsService(
    db as never,
    settings as never,
    activity as never,
  );
  return { svc, settings, activity };
}

describe('SettingsService', () => {
  it('get returns the interval', async () => {
    expect(await makeService(5).svc.get()).toEqual({ adCheckInDays: 5 });
  });

  it('update saves under the row lock and logs SETTINGS_UPDATE with from/to', async () => {
    const m = makeService(7);
    expect(await m.svc.update({ adCheckInDays: 3 }, 'admin')).toEqual({
      adCheckInDays: 3,
    });
    expect(m.settings.lockAdCheckInDays).toHaveBeenCalledWith(tx);
    expect(m.settings.setAdCheckInDays).toHaveBeenCalledWith(tx, 3, 'admin');
    expect(m.activity.record).toHaveBeenCalledWith(tx, {
      type: 'SETTINGS_UPDATE',
      actorId: 'admin',
      summary: 'Changed the ad check-in interval from 7 to 3 days',
      details: { adCheckInDays: { from: 7, to: 3 } },
    });
  });

  it('the same value again changes and logs nothing', async () => {
    const m = makeService(7);
    await m.svc.update({ adCheckInDays: 7 }, 'admin');
    expect(m.settings.setAdCheckInDays).not.toHaveBeenCalled();
    expect(m.activity.record).not.toHaveBeenCalled();
  });
});
