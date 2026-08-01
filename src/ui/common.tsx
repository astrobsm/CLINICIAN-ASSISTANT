import type { ReactNode } from 'react';
import { SEVERITY_LABEL, type Finding, type Severity } from '../clinical/types';

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`sev sev-${severity}`}>{SEVERITY_LABEL[severity]}</span>;
}

export function Card({ title, actions, children, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="card" id={id}>
      {(title || actions) && (
        <header>
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions && <div style={{ marginLeft: 'auto' }} className="btn-row">{actions}</div>}
        </header>
      )}
      <div className="body">{children}</div>
    </section>
  );
}

export function Empty({ icon = '○', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="icon">{icon}</div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {hint && <div className="small">{hint}</div>}
    </div>
  );
}

function DetailBlock({ title, items }: { title: string; items: string[] }) {
  const clean = items.filter(Boolean);
  if (!clean.length) return null;
  return (
    <div className="detail-block">
      <h5>{title}</h5>
      <ul>{clean.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

export function FindingCard({ finding, defaultOpen }: { finding: Finding; defaultOpen?: boolean }) {
  return (
    <details className={`finding s-${finding.severity}`} open={defaultOpen}>
      <summary>
        <span style={{ flex: 1 }}>{finding.title}</span>
        <SeverityBadge severity={finding.severity} />
      </summary>
      <div className="detail">
        <p>{finding.interpretation}</p>
        <DetailBlock title="Possible differential diagnoses" items={finding.differentials} />
        <DetailBlock title="Suggested additional investigations" items={finding.investigations} />
        <DetailBlock title="Potential clinical implications" items={finding.implications} />
        <DetailBlock title="Monitoring recommendations" items={finding.monitoring} />
        <DetailBlock title="Practice guidance" items={finding.guidance} />
      </div>
    </details>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {note && <div className="n">{note}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`check${checked ? ' on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const cls = value < 0.6 ? 'low' : value < 0.8 ? 'mid' : '';
  return (
    <span className={`conf-bar ${cls}`} title={`${Math.round(value * 100)}% recognition confidence`}>
      <span style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}
