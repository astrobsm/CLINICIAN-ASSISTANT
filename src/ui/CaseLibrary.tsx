import { useCallback, useEffect, useState } from 'react';
import { Card, Field, SeverityBadge } from './common';
import {
  bindFolder,
  boundFolderName,
  deleteCase,
  destroyVault,
  folderPickerSupported,
  isUnlocked,
  listCases,
  loadCase,
  lockVault,
  reconnectBoundFolder,
  requestPersistence,
  restoreBoundFolder,
  saveCase,
  unbindFolder,
  unlockVault,
  vaultStatus,
  vaultSupported,
  type CaseSummary,
  type VaultStatus,
} from '../store/vault';
import type { SessionApi } from '../store/session';

const fmtBytes = (n: number | null): string => {
  if (n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};

/**
 * The case library — saved cases held in a dedicated, encrypted folder on this
 * device.
 *
 * This is a deliberate departure from the rest of the application, which keeps
 * patient data in memory and discards it when the tab closes. Because it
 * writes patient data to the device, everything is encrypted before it is
 * written, the passphrase is never stored, and the consequences are stated
 * plainly on screen rather than buried in documentation.
 */
export function CaseLibrary({ session }: { session: SessionApi }) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [folderLabel, setFolderLabel] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus(await vaultStatus());
    setCases(isUnlocked() ? listCases() : []);
  }, []);

  useEffect(() => {
    void (async () => {
      setFolderLabel(await restoreBoundFolder());
      await refresh();
    })();
  }, [refresh]);

  const say = (kind: 'ok' | 'err', text: string) => {
    setNote({ kind, text });
    setTimeout(() => setNote(null), 9000);
  };

  /**
   * Run an action, refresh the listing, and only then report the outcome.
   *
   * The order matters: announcing "case saved" while the list still shows the
   * previous state reads as though nothing happened.
   */
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    let outcome: { kind: 'ok' | 'err'; text: string } | null = null;
    try {
      const message = await fn();
      if (message) outcome = { kind: 'ok', text: message };
    } catch (err) {
      outcome = { kind: 'err', text: err instanceof Error ? err.message : String(err) };
    }
    await refresh();
    setBusy(false);
    if (outcome) say(outcome.kind, outcome.text);
  };

  if (!status) return null;

  if (!status.supported) {
    return (
      <Card title="Case library on this device">
        <p className="muted" style={{ margin: 0 }}>
          This browser does not provide the device storage the case library needs. Saving an encrypted archive file
          from the section above still works and is the portable equivalent.
        </p>
      </Card>
    );
  }

  const unlocked = status.unlocked;

  return (
    <Card
      title="Case library on this device"
      actions={
        unlocked ? (
          <>
            <button
              className="btn primary"
              disabled={busy || !session.analysis.modules.some((m) => m.present)}
              onClick={() => run(async () => {
                const result = await saveCase(session.snapshot(), session.analysis.overallSeverity);
                return `Case saved to this device (${fmtBytes(result.bytes)}, encrypted).${
                  result.mirroredToFolder ? ' Also written to the bound folder.' : ''
                }${result.folderError ? ` The bound folder could not be written to: ${result.folderError}` : ''}`;
              })}
            >
              Save current case
            </button>
            <button className="btn" disabled={busy} onClick={() => { lockVault(); void refresh(); say('ok', 'Library locked.'); }}>
              Lock
            </button>
          </>
        ) : null
      }
    >
      {!unlocked && (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            Cases are kept in a dedicated folder belonging to this application on this device, each one encrypted with
            AES-256-GCM under a key derived from your passphrase. Neither the cases nor the list of them can be read
            without it, and the passphrase is never stored — if it is lost, the library cannot be opened by anyone.
            {status.exists
              ? ' A library already exists on this device; enter its passphrase to open it.'
              : ' No library exists yet on this device; the passphrase you set now will create one.'}
          </p>
          <div className="btn-row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Field label={status.exists ? 'Library passphrase' : 'Choose a library passphrase'} hint="Minimum 8 characters">
                <input
                  type="password"
                  value={passphrase}
                  autoComplete="new-password"
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && passphrase.length >= 8) {
                      const existed = status.exists;
                      void run(async () => {
                        await unlockVault(passphrase);
                        setPassphrase('');
                        return existed ? 'Library opened.' : 'Library created on this device.';
                      });
                    }
                  }}
                  style={{ fontFamily: 'var(--mono)' }}
                />
              </Field>
            </div>
            <button
              className="btn primary"
              disabled={busy || passphrase.length < 8}
              onClick={() => run(async () => {
                const existed = status.exists;
                await unlockVault(passphrase);
                setPassphrase('');
                return existed ? 'Library opened.' : 'Library created on this device.';
              })}
            >
              {status.exists ? 'Open library' : 'Create library'}
            </button>
          </div>
        </>
      )}

      {note && (
        <div
          className="disclaimer"
          style={{
            marginTop: 12,
            borderColor: note.kind === 'ok' ? 'rgba(61,220,151,.4)' : 'rgba(255,91,91,.45)',
            background: note.kind === 'ok' ? 'rgba(61,220,151,.07)' : 'rgba(255,91,91,.07)',
            color: note.kind === 'ok' ? 'var(--normal)' : 'var(--critical)',
          }}
        >
          {note.text}
        </div>
      )}

      {unlocked && (
        <>
          <div className="btn-row" style={{ marginBottom: 12 }}>
            <span className="chip accent">{cases.length} case{cases.length === 1 ? '' : 's'} stored</span>
            <span className="chip">{fmtBytes(status.usageBytes)} used of {fmtBytes(status.quotaBytes)}</span>
            <span className="chip" style={status.persisted ? { borderColor: 'var(--normal)', color: 'var(--normal)' } : undefined}>
              {status.persisted ? 'Storage marked persistent' : 'Storage may be evicted'}
            </span>
            {!status.persisted && (
              <button className="btn small" disabled={busy} onClick={() => run(async () => {
                const ok = await requestPersistence();
                if (!ok) throw new Error('The browser declined to mark the storage persistent. Installing the app usually makes it grant this.');
                return 'The browser will now keep this library rather than evicting it under storage pressure.';
              })}>
                Request persistent storage
              </button>
            )}
          </div>

          {cases.length === 0 ? (
            <p className="faint small" style={{ fontStyle: 'italic' }}>
              No cases saved yet. Analyse a patient, then press “Save current case”.
            </p>
          ) : (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>Patient</th><th>Hospital number</th><th>Location</th>
                    <th>Priority</th><th className="num">Documents</th><th className="num">Values</th>
                    <th>Saved</th><th className="num">Size</th><th />
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id}>
                      <td>{c.patientName || <span className="faint">Unnamed</span>}</td>
                      <td className="mono small">{c.hospitalNumber || '—'}</td>
                      <td className="small">{c.ward || '—'}</td>
                      <td><SeverityBadge severity={c.severity} /></td>
                      <td className="num">{c.documentCount}</td>
                      <td className="num">{c.valueCount}</td>
                      <td className="small">{new Date(c.savedAt).toLocaleString()}</td>
                      <td className="num small">{fmtBytes(c.bytes)}</td>
                      <td>
                        <div className="btn-row">
                          <button className="btn small" disabled={busy} onClick={() => run(async () => {
                            session.restore(await loadCase(c.id));
                            return `Opened ${c.patientName || c.hospitalNumber || 'case'}.`;
                          })}>Open</button>
                          <button className="btn small danger" disabled={busy} onClick={() => {
                            if (!confirm(`Delete this case from this device permanently?\n\n${c.patientName || c.hospitalNumber || c.id}`)) return;
                            void run(async () => { await deleteCase(c.id); return 'Case deleted from this device.'; });
                          }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div className="small" style={{ color: 'var(--accent-bright)', textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 10.5, fontWeight: 700, marginBottom: 6 }}>
              Visible folder
            </div>
            {folderPickerSupported() ? (
              <>
                <p className="small muted" style={{ marginTop: 0 }}>
                  Optionally bind a folder you can see in your file manager. Saved cases are mirrored there as
                  encrypted <code>.enc</code> files, so they can be backed up or carried to another machine. The
                  private device store above remains the primary copy.
                </p>
                <div className="btn-row">
                  {boundFolderName() ? (
                    <>
                      <span className="chip accent">Bound to “{boundFolderName()}”</span>
                      <button className="btn small danger" disabled={busy} onClick={() => run(async () => {
                        await unbindFolder(); setFolderLabel(null); return 'Folder unbound. Files already written there are untouched.';
                      })}>Unbind</button>
                    </>
                  ) : folderLabel?.includes('permission needed') ? (
                    <>
                      <span className="chip" style={{ borderColor: 'var(--moderate)', color: 'var(--moderate)' }}>{folderLabel}</span>
                      <button className="btn small" disabled={busy} onClick={() => run(async () => {
                        const name = await reconnectBoundFolder();
                        setFolderLabel(name);
                        if (!name) throw new Error('Permission was not granted.');
                        return `Reconnected to “${name}”.`;
                      })}>Reconnect</button>
                    </>
                  ) : (
                    <button className="btn small" disabled={busy} onClick={() => run(async () => {
                      const name = await bindFolder(); setFolderLabel(name); return `Bound to “${name}”. Cases saved from now on are mirrored there.`;
                    })}>Choose a folder…</button>
                  )}
                </div>
              </>
            ) : (
              <p className="small faint" style={{ margin: 0 }}>
                Binding a visible folder needs the File System Access API, which this browser does not provide — it is
                unavailable on mobile browsers and in Firefox and Safari. The encrypted library above still works
                here; use “Save encrypted archive” to produce a portable file.
              </p>
            )}
          </div>

          <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <button className="btn small danger" disabled={busy} onClick={() => {
              if (!confirm('Delete the entire case library from this device, including every saved case? This cannot be undone.')) return;
              void run(async () => { await destroyVault(); return 'The case library has been removed from this device.'; });
            }}>
              Delete the whole library from this device
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
