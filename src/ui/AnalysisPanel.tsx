import { Card, Empty, FindingCard, SeverityBadge, Stat } from './common';
import { alertingFindings } from '../clinical/analyse';
import {
  MODULE_LABEL,
  SEVERITY_LABEL,
  severityRank,
  type AnalysisResult,
  type ModuleId,
} from '../clinical/types';

const MODULE_HEADINGS: { id: ModuleId; heading: string }[] = [
  { id: 'renal', heading: 'Renal Summary' },
  { id: 'electrolytes', heading: 'Electrolyte Summary' },
  { id: 'fbc', heading: 'Full Blood Count Summary' },
  { id: 'coagulation', heading: 'Coagulation Summary' },
  { id: 'lft', heading: 'Liver Function Summary' },
  { id: 'abg', heading: 'Arterial Blood Gas Summary' },
  { id: 'inflammatory', heading: 'Inflammatory Marker Summary' },
  { id: 'cardiac', heading: 'Cardiac Biomarker Summary' },
  { id: 'urinalysis', heading: 'Urinalysis Summary' },
  { id: 'ecg', heading: 'ECG Summary' },
  { id: 'microbiology', heading: 'Microbiology Summary' },
];

export function AnalysisPanel({ analysis }: { analysis: AnalysisResult }) {
  const anyData = analysis.modules.some((m) => m.present);
  const alerts = alertingFindings(analysis.modules, 'critical');
  const criticalCorr = analysis.correlations.filter((c) => severityRank(c.severity) >= severityRank('critical'));
  const lifeThreatening = alerts.some((f) => f.severity === 'life-threatening') || criticalCorr.some((c) => c.severity === 'life-threatening');

  if (!anyData) {
    return (
      <Card>
        <Empty
          icon="⌬"
          title="Nothing to analyse yet"
          hint="Scan a diagnostic report or enter values manually. The engine analyses whatever is present and states clearly what is missing."
        />
      </Card>
    );
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* ── Priority alert banner ─────────────────────────────────── */}
      {(alerts.length > 0 || criticalCorr.length > 0) ? (
        <div className={`alert-banner ${lifeThreatening ? 'life' : 'crit'}`}>
          <div className="alert-icon">{lifeThreatening ? '⚠' : '!'}</div>
          <div style={{ flex: 1 }}>
            <h3>
              {lifeThreatening
                ? 'Life-threatening finding — immediate clinician review required'
                : 'Critical result — urgent clinician review required'}
            </h3>
            <ul>
              {criticalCorr.map((c) => <li key={c.id}><strong>{c.title}</strong></li>)}
              {alerts.map((f) => <li key={f.id}><strong>{f.title}</strong> <span className="small faint">({MODULE_LABEL[f.module]})</span></li>)}
            </ul>
          </div>
        </div>
      ) : (
        <div className="alert-banner info">
          <div className="alert-icon" style={{ color: 'var(--normal)' }}>✓</div>
          <div>
            <h3>No critical or life-threatening findings identified</h3>
            <div className="small muted">
              Highest priority classification across all results: <SeverityBadge severity={analysis.overallSeverity} />.
              This does not exclude clinically significant illness — clinical assessment remains primary.
            </div>
          </div>
        </div>
      )}

      {/* ── Integrated clinical impression ────────────────────────── */}
      <Card title="Integrated Clinical Impression">
        {analysis.impression.map((para, i) => (
          <p key={i} style={{ marginTop: i === 0 ? 0 : undefined }}>{para}</p>
        ))}
      </Card>

      {/* ── Correlations ──────────────────────────────────────────── */}
      <h2 className="section-title">Clinical Correlation Across Investigations</h2>
      {analysis.correlations.length === 0 ? (
        <Card><p className="muted" style={{ margin: 0 }}>No cross-modality correlations were triggered by the current combination of results.</p></Card>
      ) : (
        analysis.correlations.map((c) => (
          <div key={c.id} className="correlation" style={{ borderLeft: `3px solid var(--${c.severity === 'life-threatening' ? 'lifethreat' : c.severity})` }}>
            <h4>{c.title} <SeverityBadge severity={c.severity} /></h4>
            {c.modules.length > 0 && (
              <div className="flow">{c.modules.map((m) => MODULE_LABEL[m]).join(' + ')} → {c.title.split(' — ')[0]}</div>
            )}
            <p style={{ marginTop: 0 }}>{c.narrative}</p>
            <div className="detail-block" style={{ marginBottom: 0 }}>
              <h5>Suggested actions</h5>
              <ol>{c.actions.map((a, i) => <li key={i}>{a}</li>)}</ol>
            </div>
          </div>
        ))
      )}

      {/* ── Module sections ───────────────────────────────────────── */}
      <h2 className="section-title">Module Analysis</h2>
      {MODULE_HEADINGS.map(({ id, heading }) => {
        const m = analysis.modules.find((x) => x.module === id);
        if (!m) return null;
        if (!m.present) {
          return (
            <Card key={id} title={<h2>{heading}</h2>}>
              <p className="faint" style={{ margin: 0, fontStyle: 'italic' }}>No data available for this module in the current session.</p>
            </Card>
          );
        }
        const derived = Object.values(m.derived);
        return (
          <Card
            key={id}
            title={<h2>{heading}</h2>}
            actions={<SeverityBadge severity={m.severity} />}
          >
            <p style={{ marginTop: 0 }}>{m.summary}</p>
            {derived.length > 0 && (
              <div className="stat-grid" style={{ marginBottom: 14 }}>
                {derived.map((d, i) => <Stat key={i} label={d.label} value={d.value} note={d.note} />)}
              </div>
            )}
            {m.analytes.length > 0 && (
              <div className="scroll-x" style={{ marginBottom: 14 }}>
                <table className="data">
                  <thead><tr><th>Analyte</th><th className="num">Value</th><th>Unit</th><th className="num">Reference</th><th className="num">Flag</th></tr></thead>
                  <tbody>
                    {m.analytes.map((a) => (
                      <tr key={a.key}>
                        <td>{a.label}</td>
                        <td className="num"><strong>{a.value}</strong></td>
                        <td className="small">{a.unit}</td>
                        <td className="num small">
                          {a.refLow !== undefined && a.refHigh !== undefined ? `${a.refLow}–${a.refHigh}`
                            : a.refHigh !== undefined ? `< ${a.refHigh}`
                            : a.refLow !== undefined ? `> ${a.refLow}` : '—'}
                        </td>
                        <td className={`num flag-${a.flag ?? 'normal'}`}>{a.flag === 'high' ? 'HIGH' : a.flag === 'low' ? 'LOW' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {m.findings.length > 0
              ? m.findings.map((f) => <FindingCard key={f.id} finding={f} defaultOpen={severityRank(f.severity) >= severityRank('critical')} />)
              : <p className="faint" style={{ fontStyle: 'italic', margin: 0 }}>No interpretive findings generated for this module.</p>}
          </Card>
        );
      })}

      {/* ── Next steps ────────────────────────────────────────────── */}
      <h2 className="section-title">Suggested Next Steps</h2>
      <Card>
        <div className="disclaimer" style={{ marginBottom: 14 }}>
          These are clinical decision support suggestions generated from the results analysed. They are not definitive
          treatment instructions and must be considered against the full clinical picture, local guidelines and
          specialist advice.
        </div>
        {groupSteps(analysis.nextSteps).map(([cat, items]) => (
          <div key={cat} className="detail-block">
            <h5>{cat}</h5>
            <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        ))}
      </Card>

      <div className="small faint" style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        Overall priority classification: {SEVERITY_LABEL[analysis.overallSeverity]} · generated {new Date(analysis.generatedAt).toLocaleString()}
      </div>
    </div>
  );
}

function groupSteps(steps: string[]): [string, string[]][] {
  const map = new Map<string, string[]>();
  for (const s of steps) {
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(s);
    const cat = m?.[1] ?? 'General';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(m?.[2] ?? s);
  }
  return [...map.entries()];
}
