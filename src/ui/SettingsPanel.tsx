import { useRef, useState } from 'react';
import { Card, Field } from './common';
import { ANALYTES, ANALYTE_BY_KEY, describeRange } from '../clinical/referenceRanges';
import { DEFAULT_INSTITUTION, saveInstitution, type InstitutionConfig } from '../config/institution';
import { MODULE_LABEL, type ModuleId } from '../clinical/types';
import { NexoraLogo, getBrandLogo, setBrandLogo } from '../brand/NexoraLogo';
import { OfflinePanel } from './OfflinePanel';

const MODULES: ModuleId[] = ['renal', 'electrolytes', 'fbc', 'coagulation', 'lft', 'abg', 'inflammatory', 'cardiac', 'urinalysis', 'ecg'];

export function SettingsPanel({
  institution,
  setInstitution,
  onClearSession,
}: {
  institution: InstitutionConfig;
  setInstitution: (c: InstitutionConfig) => void;
  onClearSession: () => void;
}) {
  const [overrideKey, setOverrideKey] = useState('');
  const [, setBrandTick] = useState(0);
  const brandRef = useRef<HTMLInputElement>(null);
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<InstitutionConfig>) => {
    const next = { ...institution, ...patch };
    setInstitution(next);
    saveInstitution(next);
  };

  const loadLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => update({ logoDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const addOverride = () => {
    if (!overrideKey) return;
    const range: { low?: number; high?: number } = {};
    if (low !== '') range.low = parseFloat(low);
    if (high !== '') range.high = parseFloat(high);
    if (range.low === undefined && range.high === undefined) return;
    update({ rangeOverrides: { ...institution.rangeOverrides, [overrideKey]: range } });
    setLow(''); setHigh('');
  };

  const removeOverride = (key: string) => {
    const next = { ...institution.rangeOverrides };
    delete next[key];
    update({ rangeOverrides: next });
    // The in-memory definition keeps the override until reload; state this plainly.
  };

  return (
    <div className="grid two">
      <Card title="Hospital branding">
        <p className="small muted" style={{ marginTop: 0 }}>
          Appears on the printed report, the PDF and the HTML export. Stored locally on this device only — it contains
          no patient data.
        </p>
        <div className="grid" style={{ gap: 12 }}>
          <Field label="Hospital / trust name">
            <input type="text" value={institution.hospitalName} onChange={(e) => update({ hospitalName: e.target.value })} placeholder="e.g. St Andrew's University Teaching Hospital" />
          </Field>
          <Field label="Department">
            <input type="text" value={institution.departmentName} onChange={(e) => update({ departmentName: e.target.value })} placeholder="e.g. Department of Acute Medicine" />
          </Field>
          <Field label="Address line">
            <input type="text" value={institution.addressLine} onChange={(e) => update({ addressLine: e.target.value })} />
          </Field>
          <Field label="Report footer note">
            <input type="text" value={institution.footerNote} onChange={(e) => update({ footerNote: e.target.value })} />
          </Field>
          <Field label="Institution crest / logo" hint="Embedded in the report; PNG, JPG or SVG">
            <div className="btn-row">
              <button className="btn" onClick={() => logoRef.current?.click()}>Choose image…</button>
              {institution.logoDataUrl && (
                <>
                  <img src={institution.logoDataUrl} alt="Institution crest" style={{ height: 38, borderRadius: 4, background: '#fff', padding: 3 }} />
                  <button className="btn small danger" onClick={() => update({ logoDataUrl: '' })}>Remove</button>
                </>
              )}
            </div>
            <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadLogo(f); e.target.value = ''; }} />
          </Field>
        </div>
      </Card>

      <div className="grid" style={{ gap: 16 }}>
        <Card title="Local reference intervals">
          <p className="small muted" style={{ marginTop: 0 }}>
            Override the built-in adult reference intervals with your own laboratory's. An override replaces the
            sex-specific defaults for that analyte and applies to grading, flags and the report.
          </p>
          <div className="btn-row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: 190 }}>
              <Field label="Analyte">
                <select value={overrideKey} onChange={(e) => setOverrideKey(e.target.value)}>
                  <option value="">Select…</option>
                  {MODULES.map((m) => (
                    <optgroup key={m} label={MODULE_LABEL[m]}>
                      {ANALYTES.filter((a) => a.module === m).map((a) => (
                        <option key={a.key} value={a.key}>{a.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ width: 90 }}>
              <Field label="Lower"><input type="number" step="any" value={low} onChange={(e) => setLow(e.target.value)} /></Field>
            </div>
            <div style={{ width: 90 }}>
              <Field label="Upper"><input type="number" step="any" value={high} onChange={(e) => setHigh(e.target.value)} /></Field>
            </div>
            <button className="btn" onClick={addOverride} disabled={!overrideKey || (low === '' && high === '')}>Apply</button>
          </div>

          <div style={{ marginTop: 12 }}>
            {Object.keys(institution.rangeOverrides).length === 0 ? (
              <p className="small faint" style={{ margin: 0 }}>No local overrides — built-in adult intervals are in use.</p>
            ) : (
              <table className="data">
                <thead><tr><th>Analyte</th><th className="num">Interval</th><th /></tr></thead>
                <tbody>
                  {Object.entries(institution.rangeOverrides).map(([k, r]) => (
                    <tr key={k}>
                      <td>{ANALYTE_BY_KEY[k]?.label ?? k}</td>
                      <td className="num">{describeRange(r, ANALYTE_BY_KEY[k]?.decimals ?? 1)} {ANALYTE_BY_KEY[k]?.unit}</td>
                      <td><button className="btn small danger" onClick={() => removeOverride(k)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="hint">Removing an override restores the built-in interval after the application is reloaded.</p>
          </div>
        </Card>

        <OfflinePanel />

        <Card title="Session and privacy">
          <ul style={{ margin: '0 0 12px', paddingLeft: 18 }} className="small">
            <li>All OCR and analysis run in this browser tab; no network request is made at any point.</li>
            <li>Patient data is held in memory only and is discarded when the tab closes or the session is cleared.</li>
            <li>Persistence is an explicit action: the encrypted archive on the Report tab.</li>
            <li>Only non-patient configuration (branding, reference intervals) is stored on this device.</li>
          </ul>
          <div className="btn-row">
            <button className="btn danger" onClick={() => { if (confirm('Clear all patient data, scanned documents and extracted values from this session? This cannot be undone unless you have saved an encrypted archive.')) onClearSession(); }}>
              Clear session data
            </button>
            <button className="btn" onClick={() => { if (confirm('Reset hospital branding and all local reference intervals to defaults?')) { const d = { ...DEFAULT_INSTITUTION }; setInstitution(d); saveInstitution(d); } }}>
              Reset configuration
            </button>
          </div>
        </Card>

        <Card title="About">
          <div style={{ background: '#05070d', border: '1px solid var(--line)', borderRadius: 8, padding: '18px 16px', display: 'flex', justifyContent: 'center' }}>
            <NexoraLogo size={54} />
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn small" onClick={() => brandRef.current?.click()}>Use original logo artwork…</button>
            {getBrandLogo() && (
              <button className="btn small danger" onClick={() => { setBrandLogo(null); setBrandTick((n) => n + 1); }}>
                Revert to the built-in mark
              </button>
            )}
          </div>
          <input
            ref={brandRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                const r = new FileReader();
                r.onload = () => { setBrandLogo(String(r.result)); setBrandTick((n) => n + 1); };
                r.readAsDataURL(f);
              }
              e.target.value = '';
            }}
          />
          <p className="hint" style={{ marginTop: 4 }}>
            The mark above is a vector rendition. Supplying the original artwork replaces it everywhere, including in
            the printed report. Stored on this device only.
          </p>
          <p className="small muted" style={{ marginBottom: 4 }}>
            <strong>Clinician Assistant</strong> — offline multi-modal clinical diagnostic analysis.
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            Developed by <strong>NEXORA Innovations : Building Solutions</strong>.
          </p>
          <div className="disclaimer" style={{ marginTop: 12 }}>
            This application provides clinical decision support only. It does not diagnose, does not prescribe, and does
            not replace clinical assessment, local guidelines or specialist advice. All outputs require verification
            against source documents and review by a competent clinician.
          </div>
        </Card>
      </div>
    </div>
  );
}
