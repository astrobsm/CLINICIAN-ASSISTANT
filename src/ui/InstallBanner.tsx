import { useEffect, useState } from 'react';
import { canPromptInstall, isInstalled, promptInstall, subscribeOffline, type OfflineStatus } from '../pwa';

const DISMISS_KEY = 'nexora.clinician-assistant.install-dismissed.v1';

/** iOS never fires an install event, so Safari needs explicit instructions. */
function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

const isSafari = (): boolean =>
  /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

/**
 * Offers installation at the point it becomes possible.
 *
 * Installing matters here beyond convenience: an installed app is what
 * persuades the browser to keep the offline storage rather than evicting it,
 * and it is how the tool opens at a bedside with no signal. The banner is
 * dismissible and stays dismissed — the same offer remains in Settings.
 */
export function InstallBanner() {
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [installed, setInstalled] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    setInstalled(isInstalled());
    return subscribeOffline(setStatus);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
  };

  if (!status || installed || dismissed) return null;

  const iosCandidate = isIos() && isSafari() && status.secureContext;
  const showPrompt = status.installable || canPromptInstall();

  if (!showPrompt && !iosCandidate) return null;

  return (
    <div className="install-banner no-print" role="region" aria-label="Install this application">
      <div className="ib-icon" aria-hidden="true">⤓</div>
      <div className="ib-body">
        <strong>Install Clinician Assistant on this device</strong>
        <div className="small">
          {iosCandidate
            ? 'Safari does not offer an automatic prompt. Tap the Share button, then “Add to Home Screen”.'
            : 'Runs full screen, opens without a browser, and keeps working with no network. Installing also stops the browser evicting the stored recognition engine and case library.'}
        </div>
        {iosHelp && (
          <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>Tap the Share button at the bottom of Safari.</li>
            <li>Scroll and choose <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong>. Launch it from the home screen icon.</li>
          </ol>
        )}
      </div>
      <div className="btn-row">
        {showPrompt ? (
          <button
            className="btn primary"
            onClick={async () => {
              const outcome = await promptInstall();
              if (outcome === 'accepted') setInstalled(true);
              else if (outcome === 'dismissed') dismiss();
            }}
          >
            Install
          </button>
        ) : (
          <button className="btn" onClick={() => setIosHelp((v) => !v)}>
            {iosHelp ? 'Hide steps' : 'Show me how'}
          </button>
        )}
        <button className="btn" onClick={dismiss} aria-label="Dismiss install prompt">Not now</button>
      </div>
    </div>
  );
}
