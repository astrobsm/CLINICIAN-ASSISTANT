import { useEffect, useState } from 'react';
import { Card } from './common';
import {
  canPromptInstall,
  isInstalled,
  prepareOffline,
  promptInstall,
  subscribeOffline,
  type OfflineStatus,
} from '../pwa';

const STATE_COLOUR: Record<OfflineStatus['state'], string> = {
  unsupported: 'var(--text-faint)',
  insecure: 'var(--moderate)',
  registering: 'var(--text-dim)',
  'shell-ready': 'var(--moderate)',
  caching: 'var(--accent-bright)',
  ready: 'var(--normal)',
  error: 'var(--critical)',
};

/**
 * Offline readiness and installation.
 *
 * A clinical tool that claims to work without a network has to be able to
 * prove it, and the clinician needs to know before they are standing on a ward
 * with no signal. This states plainly what is stored on the device, what is
 * not, and what is preventing installation when something is.
 */
export function OfflinePanel() {
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installResult, setInstallResult] = useState<string | null>(null);

  useEffect(() => {
    setInstalled(isInstalled());
    return subscribeOffline(setStatus);
  }, []);

  if (!status) return null;

  const host = typeof location !== 'undefined' ? location.hostname : '';
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';

  return (
    <Card
      title="Offline use and installation"
      actions={
        <>
          {status.installable && (
            <button
              className="btn primary"
              onClick={async () => {
                const outcome = await promptInstall();
                setInstallResult(
                  outcome === 'accepted' ? 'Installed. Launch it from your home screen or app list.'
                    : outcome === 'dismissed' ? 'Installation dismissed. You can install later from the browser menu.'
                    : 'The browser did not offer an installation prompt.',
                );
                setInstalled(isInstalled());
              }}
            >
              Install app
            </button>
          )}
          {(status.state === 'shell-ready' || status.state === 'error') && (
            <button className="btn" onClick={prepareOffline}>Prepare for offline use</button>
          )}
        </>
      }
    >
      <div className="btn-row" style={{ marginBottom: 10 }}>
        <span className="chip" style={{ color: STATE_COLOUR[status.state], borderColor: STATE_COLOUR[status.state] }}>
          {status.state === 'ready' ? 'Fully offline capable'
            : status.state === 'shell-ready' ? 'App stored — recognition engine not yet cached'
            : status.state === 'caching' ? 'Caching…'
            : status.state === 'insecure' ? 'Not a secure context'
            : status.state === 'unsupported' ? 'Not supported by this browser'
            : status.state === 'error' ? 'Problem' : 'Checking…'}
        </span>
        {installed && <span className="chip accent">Running as an installed app</span>}
        <span className="chip">{status.secureContext ? 'Secure context ✓' : 'Insecure context ✗'}</span>
      </div>

      <p className="small" style={{ marginTop: 0 }}>{status.message}</p>

      {status.state === 'caching' && (
        <div className="progress" style={{ marginBottom: 10 }}>
          <span style={{ width: `${Math.round(status.progress * 100)}%` }} />
        </div>
      )}

      {installResult && <p className="small" style={{ color: 'var(--accent-bright)' }}>{installResult}</p>}

      {!status.secureContext && (
        <div className="disclaimer" style={{ marginTop: 10 }}>
          <strong>Two features are unavailable over plain HTTP.</strong> Browsers restrict them to secure contexts:
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>Installation as an app, and offline storage of the application.</li>
            <li>The encrypted archive — it needs the Web Crypto API, which is not exposed here.</li>
          </ul>
          <div style={{ marginTop: 6 }}>
            Open the app over <code>https://</code>, or on <code>localhost</code>, and both return.
          </div>
        </div>
      )}

      {!status.installable && status.secureContext && !installed && (
        <p className="small faint" style={{ marginBottom: 0 }}>
          No installation prompt is available yet. On desktop Chrome or Edge, use the install icon in the address bar
          or the browser menu. On iOS, open the Share menu in Safari and choose “Add to Home Screen” — Safari never
          fires an automatic prompt.
        </p>
      )}

      <div className="small faint" style={{ marginTop: 12 }}>
        Serving from <code>{host || 'unknown host'}</code>
        {isLocal ? ' — localhost is treated as secure, so everything works here.' : ''}
      </div>
    </Card>
  );
}
