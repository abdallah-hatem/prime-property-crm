import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/i18n-provider';
import { INSTALL_DISMISSED_KEY, isIosSafari } from '@/lib/install-prompt';
import { InstallCard } from './install-card';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

function setUserAgent(ua: string) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua);
}

/** What Chrome fires when the app is installable; the card replays it on Install. */
function fireInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, prompt };
}

function renderCard(locale: 'en' | 'ar' = 'en') {
  return render(
    <I18nProvider locale={locale}>
      <InstallCard />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InstallCard', () => {
  it('stays hidden when the browser has not offered an install', () => {
    setUserAgent(ANDROID_CHROME);
    renderCard();
    expect(screen.queryByTestId('install-card')).not.toBeInTheDocument();
  });

  it('replays the browser install prompt from the Install button', async () => {
    setUserAgent(ANDROID_CHROME);
    const user = userEvent.setup();
    renderCard();
    const { event, prompt } = fireInstallPrompt('accepted');
    expect(event.defaultPrevented).toBe(true);

    await user.click(await screen.findByTestId('install-app'));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('install-card')).not.toBeInTheDocument();
  });

  it('remembers "Not now" for the next visit', async () => {
    setUserAgent(ANDROID_CHROME);
    const user = userEvent.setup();
    const { unmount } = renderCard();
    fireInstallPrompt();

    await user.click(await screen.findByTestId('install-dismiss'));
    expect(screen.queryByTestId('install-card')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('1');

    unmount();
    renderCard();
    fireInstallPrompt();
    expect(screen.queryByTestId('install-card')).not.toBeInTheDocument();
  });

  it('still dismisses when storage is blocked', async () => {
    setUserAgent(ANDROID_CHROME);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const user = userEvent.setup();
    renderCard();
    fireInstallPrompt();

    await user.click(await screen.findByTestId('install-dismiss'));
    expect(screen.queryByTestId('install-card')).not.toBeInTheDocument();
  });

  it('shows the Share → Add to Home Screen steps on iOS Safari, in Arabic too', () => {
    setUserAgent(IPHONE_SAFARI);
    renderCard('ar');
    expect(screen.getByTestId('install-card')).toHaveTextContent(
      'أضف برايم CRM إلى الشاشة الرئيسية',
    );
    expect(screen.queryByTestId('install-app')).not.toBeInTheDocument();
  });

  it('is hidden when already running from the home screen', () => {
    setUserAgent(IPHONE_SAFARI);
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      configurable: true,
    });
    try {
      renderCard();
      expect(screen.queryByTestId('install-card')).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window.navigator, 'standalone', {
        value: undefined,
        configurable: true,
      });
    }
  });
});

describe('isIosSafari', () => {
  it('tells Safari from other iOS browsers and counts iPadOS as iOS', () => {
    expect(isIosSafari(IPHONE_SAFARI, 'iPhone', 5)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME, 'iPhone', 5)).toBe(false);
    expect(isIosSafari(ANDROID_CHROME, 'Linux armv8l', 5)).toBe(false);
    const ipadDesktopUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    expect(isIosSafari(ipadDesktopUa, 'MacIntel', 5)).toBe(true);
    expect(isIosSafari(ipadDesktopUa, 'MacIntel', 0)).toBe(false);
  });
});
