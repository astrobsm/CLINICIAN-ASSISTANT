/**
 * Progressive web app registration and offline readiness.
 *
 * Installation and genuine offline operation both depend on a service worker,
 * and the browser only offers to install a site served from a secure context —
 * HTTPS, or localhost. Those constraints are surfaced to the clinician rather
 * than left to be discovered when the app fails at the bedside.
 */

export type OfflineState = 'unsupported' | 'insecure' | 'registering' | 'shell-ready' | 'caching' | 'ready' | 'error';

export interface OfflineStatus {
  state: OfflineState;
  message: string;
  /** 0–1 while the OCR engine is being cached. */
  progress: number;
  /** Whether the browser will consider this page installable. */
  installable: boolean;
  secureContext: boolean;
}

type Listener = (s: OfflineStatus) => void;

let status: OfflineStatus = {
  state: 'registering',
  message: 'Checking offline readiness…',
  progress: 0,
  installable: false,
  secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
};

const listeners = new Set<Listener>();
let installPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;

function set(patch: Partial<OfflineStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

export function subscribeOffline(l: Listener): () => void {
  listeners.add(l);
  l(status);
  return () => { listeners.delete(l); };
}

export function getOfflineStatus(): OfflineStatus {
  return status;
}

export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    set({ state: 'unsupported', message: 'This browser does not support offline installation.' });
    return;
  }
  if (!window.isSecureContext) {
    set({
      state: 'insecure',
      secureContext: false,
      message:
        'The app is being served over plain HTTP from a network address. Browsers only allow offline installation — and only permit the encrypted archive, which needs the Web Crypto API — from a secure context. Open the app on https://, or on localhost.',
    });
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(
      new URL('sw.js', document.baseURI).href,
      { scope: new URL('./', document.baseURI).pathname },
    );
    await navigator.serviceWorker.ready;

    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { type?: string; done?: number; total?: number; message?: string };
      if (data?.type === 'CACHE_OCR_PROGRESS') {
        set({ state: 'caching', progress: (data.done ?? 0) / Math.max(1, data.total ?? 1), message: `Caching the recognition engine… ${data.done} of ${data.total}` });
      } else if (data?.type === 'CACHE_OCR_DONE') {
        set({ state: 'ready', progress: 1, message: 'The full application, including the recognition engine, is stored on this device and will run with no network at all.' });
      } else if (data?.type === 'CACHE_OCR_ERROR') {
        set({ state: 'error', message: `Could not cache the recognition engine: ${data.message}` });
      }
    });

    const ocrCached = await isOcrCached();
    set({
      state: ocrCached ? 'ready' : 'shell-ready',
      secureContext: true,
      progress: ocrCached ? 1 : 0,
      message: ocrCached
        ? 'The full application, including the recognition engine, is stored on this device and will run with no network at all.'
        : 'The application itself is stored on this device. The recognition engine (about 13 MB) has not been cached yet — do that before you rely on scanning without a network.',
    });

    void registration.update();
  } catch (err) {
    set({ state: 'error', message: `Offline installation failed: ${err instanceof Error ? err.message : String(err)}` });
  }
}

async function isOcrCached(): Promise<boolean> {
  if (!('caches' in window)) return false;
  try {
    for (const key of await caches.keys()) {
      if (!key.includes('ocr')) continue;
      const cache = await caches.open(key);
      const hit = await cache.match('./ocr/eng.traineddata');
      if (hit) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Download and store the recognition engine for use with no network. */
export function prepareOffline(): void {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) {
    set({ state: 'error', message: 'The offline worker is not active yet. Reload the page and try again.' });
    return;
  }
  set({ state: 'caching', progress: 0, message: 'Caching the recognition engine…' });
  sw.postMessage({ type: 'CACHE_OCR' });
}

// The browser fires this when the page meets its installation criteria.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e as typeof installPrompt;
    set({ installable: true });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    set({ installable: false });
  });
}

export function canPromptInstall(): boolean {
  return installPrompt !== null;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!installPrompt) return 'unavailable';
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  installPrompt = null;
  set({ installable: false });
  return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
}

/** True when running as an installed app rather than in a browser tab. */
export function isInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
