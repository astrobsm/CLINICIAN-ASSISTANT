import type { ReactNode } from 'react';
import { SEVERITY_LABEL, type Finding, type Severity } from '../clinical/types';
import { ROUTE_LABEL, type CorrectionPlan } from '../clinical/replacement';

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

/**
 * Correction and administration guidance.
 *
 * Given its own visual treatment rather than another bulleted block, because
 * it is the part a clinician acts on directly. The hard limits are placed
 * where they cannot be scrolled past: at the top, before any dose.
 */
export function CorrectionBlock({ plan }: { plan: CorrectionPlan }) {
  return (
    <div className="rx">
      <div className="rx-head">
        <h5>{plan.title}</h5>
        <span className="chip">{plan.measured}</span>
      </div>

      <div className="rx-target">
        <strong>Target — </strong>{plan.target}
      </div>

      {plan.deficit && (
        <div className="rx-deficit">
          <div className="k">{plan.deficit.label}</div>
          <div className="v">{plan.deficit.value}</div>
          <div className="n">{plan.deficit.note}</div>
        </div>
      )}

      {plan.hardLimits.length > 0 && (
        <div className="rx-limits">
          <h6>Do not exceed</h6>
          <ul>{plan.hardLimits.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}

      {plan.prerequisites && plan.prerequisites.length > 0 && (
        <div className="rx-pre">
          <h6>Before, or alongside</h6>
          <ul>{plan.prerequisites.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}

      {plan.steps.map((s, i) => (
        <div className="rx-step" key={i}>
          <div className="rx-step-head">
            <span className={`route route-${s.route}`}>{ROUTE_LABEL[s.route]}</span>
            <span className="when">{s.indication}</span>
          </div>
          <dl>
            <dt>Preparation</dt><dd>{s.preparation}</dd>
            <dt>Dose</dt><dd className="dose">{s.dose}</dd>
            <dt>Administration</dt><dd>{s.administration}</dd>
            {s.access && (<><dt>Access</dt><dd>{s.access}</dd></>)}
          </dl>
          {s.cautions && s.cautions.length > 0 && (
            <ul className="rx-caution">{s.cautions.map((c, j) => <li key={j}>{c}</li>)}</ul>
          )}
        </div>
      ))}

      <div className="rx-monitor">
        <h6>Monitoring during correction</h6>
        <ul>{plan.monitoring.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </div>

      <p className="rx-foot">
        Decision support only. Doses are computed from the values and weight entered here and must be checked against
        your local protocol, the patient's renal function and their allergy status before anything is prescribed.
      </p>
    </div>
  );
}

export function FindingCard({ finding, defaultOpen }: { finding: Finding; defaultOpen?: boolean }) {
  return (
    <details className={`finding s-${finding.severity}`} open={defaultOpen}>
      <summary>
        <span style={{ flex: 1 }}>{finding.title}</span>
        {finding.correction && <span className="chip rx-chip" title="Correction and administration guidance available">Rx</span>}
        <SeverityBadge severity={finding.severity} />
      </summary>
      <div className="detail">
        <p>{finding.interpretation}</p>
        <DetailBlock title="Possible differential diagnoses" items={finding.differentials} />
        <DetailBlock title="Suggested additional investigations" items={finding.investigations} />
        <DetailBlock title="Potential clinical implications" items={finding.implications} />
        <DetailBlock title="Monitoring recommendations" items={finding.monitoring} />
        <DetailBlock title="Practice guidance" items={finding.guidance} />
        {finding.correction && <CorrectionBlock plan={finding.correction} />}
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
