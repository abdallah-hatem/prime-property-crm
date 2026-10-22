/**
 * "Install the app": Chrome / Edge / Samsung hand us a `beforeinstallprompt` event to replay later;
 * iOS has no prompt, so the card explains Share → Add to Home Screen instead. The event can fire
 * before any card is on screen, so it is caught here, at module load, and kept in a tiny store.
 */

/** Not in the DOM lib types yet. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const INSTALL_DISMISSED_KEY = 'prime.install-card.dismissed';

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own mini-infobar away; our card asks at a calmer moment.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export const installPromptStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** The saved event, or null when the browser hasn't offered one (or it was used). */
  getPrompt: (): BeforeInstallPromptEvent | null => deferred,
  getInstalled: (): boolean => installed,
  /** Shows the browser's install dialog; an event can be replayed only once. */
  async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = deferred;
    if (!event) return 'unavailable';
    deferred = null;
    emit();
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  },
};

/** Already running from the home screen (Android standalone, or iOS's own flag). */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean })
    .standalone;
  return (
    iosStandalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/**
 * iPhone / iPad Safari, where Add to Home Screen lives in the Share sheet. iPadOS reports itself as
 * a Mac, so a touch-capable "Mac" counts. Chrome, Firefox and Edge on iOS name themselves.
 */
export function isIosSafari(
  userAgent = navigator.userAgent,
  platform = navigator.platform,
  maxTouchPoints = navigator.maxTouchPoints,
): boolean {
  const ios =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
}

/** Storage can be blocked (private mode, site data off); the card then just shows again. */
export function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberDismissed(): void {
  try {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
  } catch {
    // Nothing to remember it in; it stays hidden for this visit only.
  }
}
