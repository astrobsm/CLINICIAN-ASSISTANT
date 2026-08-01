import { useMemo, useState } from 'react';
import { Card, ConfidenceBar, Empty, Field } from './common';
import { ANALYTES, ANALYTE_BY_KEY, describeRange } from '../clinical/referenceRanges';
import { ECG_CHECKLIST } from '../clinical/modules/ecg';
import { ANTIBIOTICS } from '../clinical/modules/microbiologyData';
import { fmt } from '../clinical/units';
import { MODULE_LABEL, type ModuleId, type SusceptibilityResult } from '../clinical/types';
import type { SessionApi } from '../store/session';
import { EcgViewer } from './EcgViewer';

const MODULE_TABS: ModuleId[] = ['renal', 'electrolytes', 'fbc', 'coagulation', 'lft', 'abg', 'inflammatory', 'cardiac', 'urinalysis', 'ecg'];

export function ReviewPanel({ session }: { session: SessionApi }) {
  const { extraction, patient, updateAnalyte, removeAnalyte, addManualAnalyte, updateObservation } = session;
  const [addKey, setAddKey] = useState('');
  const [addValue, setAddValue] = useState('');

  const byModule = useMemo(() => {
    const map = new Map<ModuleId, typeof extraction.analytes>();
    for (const a of extraction.analytes) {
      const m = ANALYTE_BY_KEY[a.key]?.module ?? 'other';
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(a);
    }
    return map;
  }, [extraction.analytes]);

  const lowConfidence = extraction.analytes.filter((a) => a.confidence < 0.7 && !a.edited);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="disclaimer">
        <strong>Verify before acting.</strong> Every value below was read by OCR from the source document. Check each
        one against the original — particularly any flagged with low confidence — and correct it here. Corrections are
        preserved and are never overwritten by a later scan.
        {lowConfidence.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <strong>{lowConfidence.length}</strong> value{lowConfidence.length === 1 ? '' : 's'} recognised with low
            confidence: {lowConfidence.map((a) => a.label).join(', ')}.
          </div>
        )}
      </div>

      <Card title="Add or override a value manually">
        <div className="btn-row">
          <div style={{ flex: 2, minWidth: 220 }}>
            <Field label="Analyte">
              <select value={addKey} onChange={(e) => setAddKey(e.target.value)}>
                <option value="">Select…</option>
                {MODULE_TABS.map((m) => (
                  <optgroup key={m} label={MODULE_LABEL[m]}>
                    {ANALYTES.filter((a) => a.module === m).map((a) => (
                      <option key={a.key} value={a.key}>{a.label} ({a.unit || 'ratio'})</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <Field label={`Value${addKey ? ` (${ANALYTE_BY_KEY[addKey]?.unit || 'ratio'})` : ''}`}>
              <input
                type="number"
                step="any"
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && addKey && addValue !== '') {
                    addManualAnalyte(addKey, parseFloat(addValue));
                    setAddValue('');
                  }
                }}
              />
            </Field>
          </div>
          <button
            className="btn primary"
            style={{ alignSelf: 'flex-end' }}
            disabled={!addKey || addValue === ''}
            onClick={() => { addManualAnalyte(addKey, parseFloat(addValue)); setAddValue(''); }}
          >
            Add value
          </button>
        </div>
        {addKey && (
          <p className="small muted" style={{ marginBottom: 0, marginTop: 8 }}>
            Reference interval for this patient: {describeRange(
              { low: ANALYTE_BY_KEY[addKey]?.refMale?.low ?? ANALYTE_BY_KEY[addKey]?.ref?.low, high: ANALYTE_BY_KEY[addKey]?.refMale?.high ?? ANALYTE_BY_KEY[addKey]?.ref?.high },
              ANALYTE_BY_KEY[addKey]?.decimals ?? 1,
            )} {ANALYTE_BY_KEY[addKey]?.unit}
          </p>
        )}
      </Card>

      {extraction.analytes.length === 0 && extraction.observations.length === 0 && extraction.micro.length === 0 && extraction.ecg.length === 0 && (
        <Card><Empty icon="⌗" title="No values extracted yet" hint="Scan a report on the Scan tab, or add values manually above." /></Card>
      )}

      {MODULE_TABS.map((m) => {
        const rows = byModule.get(m);
        if (!rows?.length) return null;
        return (
          <Card key={m} title={`${MODULE_LABEL[m]} — ${rows.length} value${rows.length === 1 ? '' : 's'}`}>
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>Analyte</th>
                    <th className="num">Value</th>
                    <th>Unit</th>
                    <th className="num">Reference</th>
                    <th className="num">Flag</th>
                    <th>OCR source text</th>
                    <th className="num">Confidence</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const def = ANALYTE_BY_KEY[a.key];
                    return (
                      <tr key={a.key}>
                        <td>{a.label}</td>
                        <td className="num">
                          <input
                            type="number"
                            step="any"
                            value={a.value}
                            onChange={(e) => updateAnalyte(a.key, parseFloat(e.target.value))}
                            style={{ width: 92, textAlign: 'right', padding: '4px 6px' }}
                          />
                        </td>
                        <td className="small">{a.unit}</td>
                        <td className="num small">{describeRange({ low: a.refLow, high: a.refHigh }, def?.decimals ?? 1)}</td>
                        <td className={`num flag-${a.flag ?? 'normal'}`}>
                          {a.flag === 'high' ? 'HIGH' : a.flag === 'low' ? 'LOW' : '—'}
                        </td>
                        <td className="small faint" style={{ maxWidth: 260 }}>
                          {a.manual ? <em>Entered manually</em> : a.rawText}
                          {a.rawValue !== undefined && a.rawValue !== a.value && !a.edited && (
                            <div style={{ color: 'var(--accent-bright)' }}>read as {fmt(a.rawValue)} {a.rawUnit ?? ''} → converted</div>
                          )}
                        </td>
                        <td className="num">
                          {a.edited ? <span className="chip accent">corrected</span> : <ConfidenceBar value={a.confidence} />}
                        </td>
                        <td><button className="btn small danger" onClick={() => removeAnalyte(a.key)}>Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      {extraction.observations.length > 0 && (
        <Card title="Qualitative findings (urinalysis / dipstick)">
          <div className="scroll-x">
            <table className="data">
              <thead><tr><th>Field</th><th>Value</th><th>Source text</th></tr></thead>
              <tbody>
                {extraction.observations.map((o) => (
                  <tr key={o.key}>
                    <td>{o.label}</td>
                    <td>
                      <input type="text" value={o.value} onChange={(e) => updateObservation(o.key, e.target.value)} style={{ width: 170, padding: '4px 6px' }} />
                    </td>
                    <td className="small faint">{o.rawText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <EcgReview session={session} />
      <MicroReview session={session} />
    </div>
  );
}

function EcgReview({ session }: { session: SessionApi }) {
  const { extraction, setEcgFeature, updateEcgField, addBlankEcg } = session;

  return (
    <Card
      title={`ECG review (${extraction.ecg.length})`}
      actions={<button className="btn small" onClick={addBlankEcg}>Add ECG manually</button>}
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        Where the trace could be digitised from the image, the waveform is analysed as a signal and the recovered trace
        is shown below with the points each measurement was taken from — check it against the paper. Printed intervals
        and reporting statements captured by OCR are used alongside it, and any disagreement is flagged. Tick anything
        you can see on the ECG that was not picked up automatically.
      </p>

      {extraction.ecg.length === 0 ? (
        <Empty icon="∿" title="No ECG loaded" hint="Scan an ECG report, or add one manually to use the feature checklist." />
      ) : (
        extraction.ecg.map((e, idx) => (
          <div key={idx} style={{ borderTop: idx ? '1px solid var(--line)' : 'none', paddingTop: idx ? 16 : 0, marginTop: idx ? 16 : 0 }}>
            {e.waveform && (
              <div style={{ marginBottom: 16 }}>
                <div className="small" style={{ color: 'var(--accent-bright)', textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 10.5, fontWeight: 700, marginBottom: 6 }}>
                  Digitised waveform
                </div>
                <EcgViewer waveform={e.waveform} />
              </div>
            )}
            {e.waveformError && (
              <div className="disclaimer" style={{ marginBottom: 14 }}>
                <strong>Waveform analysis unavailable.</strong> {e.waveformError} Interpretation rests on the printed
                measurements and statements below, plus anything you confirm.
              </div>
            )}
            {!!e.discrepancies?.filter((x) => x.significant).length && (
              <div className="disclaimer" style={{ marginBottom: 14 }}>
                <strong>Computed and printed measurements disagree.</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {e.discrepancies.filter((x) => x.significant).map((x) => (
                    <li key={x.field}>
                      {x.field}: computed <strong>{Math.round(x.computed ?? 0)}{x.unit}</strong>, printed{' '}
                      <strong>{Math.round(x.printed ?? 0)}{x.unit}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid three" style={{ marginBottom: 12 }}>
              <Field label="Rate (bpm)">
                <input type="number" value={e.rateBpm ?? ''} onChange={(ev) => updateEcgField(idx, 'rateBpm', ev.target.value === '' ? null : parseFloat(ev.target.value))} />
              </Field>
              <Field label="PR interval (ms)">
                <input type="number" value={e.prMs ?? ''} onChange={(ev) => updateEcgField(idx, 'prMs', ev.target.value === '' ? null : parseFloat(ev.target.value))} />
              </Field>
              <Field label="QRS duration (ms)">
                <input type="number" value={e.qrsMs ?? ''} onChange={(ev) => updateEcgField(idx, 'qrsMs', ev.target.value === '' ? null : parseFloat(ev.target.value))} />
              </Field>
              <Field label="QT (ms)">
                <input type="number" value={e.qtMs ?? ''} onChange={(ev) => updateEcgField(idx, 'qtMs', ev.target.value === '' ? null : parseFloat(ev.target.value))} />
              </Field>
              <Field label="QTc (ms)" hint="Derived from QT and rate if left blank">
                <input type="number" value={e.qtcMs ?? ''} onChange={(ev) => updateEcgField(idx, 'qtcMs', ev.target.value === '' ? null : parseFloat(ev.target.value))} />
              </Field>
              <Field label="QRS axis (degrees)">
                <input type="number" value={e.axisDegrees ?? ''} onChange={(ev) => updateEcgField(idx, 'axisDegrees', ev.target.value === '' ? null : parseFloat(ev.target.value))} />
              </Field>
            </div>
            <Field label="Rhythm">
              <input type="text" value={e.rhythm} onChange={(ev) => updateEcgField(idx, 'rhythm', ev.target.value)} placeholder="e.g. Sinus rhythm" />
            </Field>

            {e.statements.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="small faint" style={{ marginBottom: 4 }}>Statements captured from the report:</div>
                <div className="chips">{e.statements.map((s, i) => <span key={i} className="chip">{s}</span>)}</div>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <div className="small faint" style={{ marginBottom: 6 }}>Confirm ECG features present:</div>
              {(['rhythm', 'conduction', 'ischaemia', 'chamber', 'repolarisation', 'electrolyte', 'device', 'other'] as const).map((group) => {
                const items = ECG_CHECKLIST.filter((c) => c.group === group);
                if (!items.length) return null;
                return (
                  <div key={group} style={{ marginBottom: 10 }}>
                    <div className="small" style={{ color: 'var(--accent-bright)', textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 10.5, fontWeight: 700, marginBottom: 4 }}>{group}</div>
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6 }}>
                      {items.map((c) => (
                        <label key={c.key} className={`check${e.features[c.key] ? ' on' : ''}`}>
                          <input type="checkbox" checked={!!e.features[c.key]} onChange={(ev) => setEcgFeature(idx, c.key, ev.target.checked)} />
                          <span>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function MicroReview({ session }: { session: SessionApi }) {
  const { extraction, updateMicroSusceptibility } = session;
  if (!extraction.micro.length) return null;

  return (
    <Card title={`Microbiology review (${extraction.micro.length} report${extraction.micro.length === 1 ? '' : 's'})`}>
      <p className="small muted" style={{ marginTop: 0 }}>
        Confirm the susceptibility results read from the report. Correcting a result here changes the antimicrobial
        options presented in the analysis.
      </p>
      {extraction.micro.map((rep, ri) => (
        <div key={ri} style={{ borderTop: ri ? '1px solid var(--line)' : 'none', paddingTop: ri ? 14 : 0, marginTop: ri ? 14 : 0 }}>
          <div className="btn-row" style={{ marginBottom: 8 }}>
            <strong>{rep.specimen}</strong>
            <span className="chip">{rep.specimenType}</span>
            {rep.noGrowth && <span className="chip">No growth</span>}
            {rep.mixedGrowth && <span className="chip">Mixed growth</span>}
          </div>
          {rep.gramStain && <div className="small muted">Gram stain: {rep.gramStain}</div>}
          {rep.microscopy && <div className="small muted">Microscopy: {rep.microscopy}</div>}

          {rep.organisms.map((org, oi) => (
            <div key={oi} style={{ marginTop: 12 }}>
              <div className="btn-row" style={{ marginBottom: 6 }}>
                <strong>{org.name}</strong>
                <span className="chip">{org.gram.replace('-', ' ')}</span>
                {org.growthQuantity && <span className="chip">{org.growthQuantity}</span>}
                {org.resistanceMarkers.map((m) => <span key={m} className="chip" style={{ borderColor: 'var(--critical)', color: 'var(--critical)' }}>{m}</span>)}
              </div>
              {org.susceptibilities.length === 0 ? (
                <div className="small faint">No susceptibility results were read for this isolate.</div>
              ) : (
                <div className="scroll-x">
                  <table className="data">
                    <thead><tr><th>Antibiotic</th><th>Class</th><th>Result</th><th>Source text</th></tr></thead>
                    <tbody>
                      {org.susceptibilities.map((s) => (
                        <tr key={s.key}>
                          <td>{s.antibiotic}</td>
                          <td className="small faint">{ANTIBIOTICS.find((x) => x.key === s.key)?.className ?? '—'}</td>
                          <td>
                            <select
                              value={s.result}
                              onChange={(ev) => updateMicroSusceptibility(ri, oi, s.key, ev.target.value as Exclude<SusceptibilityResult, 'unknown'>)}
                              style={{ width: 130, padding: '3px 6px' }}
                            >
                              <option value="S">Sensitive</option>
                              <option value="I">Intermediate</option>
                              <option value="R">Resistant</option>
                            </select>
                          </td>
                          <td className="small faint">{s.rawText}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}
