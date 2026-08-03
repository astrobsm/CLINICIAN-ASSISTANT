/**
 * Comprehensive clinical report generator.
 *
 * Produces the report body as HTML. The same markup is used for the on-screen
 * preview, the browser print pipeline (A4) and the standalone HTML export, so
 * what the clinician sees is exactly what is printed and exported.
 */
import { nexoraLogoSvgString, CREDIT_LINE } from '../brand/NexoraLogo';
import type { InstitutionConfig } from '../config/institution';
import { alertingFindings } from '../clinical/analyse';
import { describeRange, ANALYTE_BY_KEY } from '../clinical/referenceRanges';
import { susceptibilityTable } from '../clinical/modules/microbiology';
import { ROUTE_LABEL } from '../clinical/replacement';
import { fmt } from '../clinical/units';
import {
  MODULE_LABEL,
  SEVERITY_LABEL,
  severityRank,
  type AnalysisResult,
  type CorrectionPlan,
  type Finding,
  type MicrobiologyReport,
  type ModuleId,
  type ModuleResult,
  type Severity,
} from '../clinical/types';

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const SEV_INK: Record<Severity, string> = {
  normal: '#1b7f4f',
  minor: '#0d6ea8',
  moderate: '#9a6b00',
  significant: '#b45309',
  critical: '#b91c1c',
  'life-threatening': '#7f0d3a',
};

const sevBadge = (s: Severity): string =>
  `<span class="sev" style="color:${SEV_INK[s]};border-color:${SEV_INK[s]}">${esc(SEVERITY_LABEL[s])}</span>`;

const list = (items: string[]): string =>
  items.length ? `<ul>${items.filter(Boolean).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '';

function findingHtml(f: Finding): string {
  const block = (title: string, items: string[]) =>
    items.filter(Boolean).length ? `<div class="blk"><h5>${title}</h5>${list(items)}</div>` : '';
  return `
  <div class="finding" style="border-left-color:${SEV_INK[f.severity]}">
    <div class="fhead"><strong>${esc(f.title)}</strong> ${sevBadge(f.severity)}</div>
    <p>${esc(f.interpretation)}</p>
    ${block('Possible differential diagnoses', f.differentials)}
    ${block('Suggested additional investigations', f.investigations)}
    ${block('Potential clinical implications', f.implications)}
    ${block('Monitoring recommendations', f.monitoring)}
    ${block('Practice guidance', f.guidance)}
    ${f.correction ? correctionHtml(f.correction) : ''}
  </div>`;
}

/**
 * Correction and administration guidance, rendered for print.
 *
 * The report is carried to the bedside and written on, so this is laid out as
 * a table a clinician can read at arm's length, with the limits above the
 * doses rather than in a footnote.
 */
function correctionHtml(plan: CorrectionPlan): string {
  const rows = plan.steps
    .map(
      (s) => `
      <div class="rxstep">
        <div class="rxwhen"><span class="rxroute">${esc(ROUTE_LABEL[s.route])}</span> ${esc(s.indication)}</div>
        <table class="rxtab">
          <tr><th>Preparation</th><td>${esc(s.preparation)}</td></tr>
          <tr><th>Dose</th><td class="dose">${esc(s.dose)}</td></tr>
          <tr><th>Administration</th><td>${esc(s.administration)}</td></tr>
          ${s.access ? `<tr><th>Access</th><td>${esc(s.access)}</td></tr>` : ''}
          ${s.cautions?.length ? `<tr><th>Cautions</th><td>${list(s.cautions)}</td></tr>` : ''}
        </table>
      </div>`,
    )
    .join('');

  return `
  <div class="rxplan">
    <div class="rxhead"><strong>${esc(plan.title)}</strong> — ${esc(plan.measured)}</div>
    <p class="rxtarget"><strong>Target.</strong> ${esc(plan.target)}</p>
    ${plan.deficit ? `<p class="rxdef"><strong>${esc(plan.deficit.label)}:</strong> ${esc(plan.deficit.value)}<br><span class="note">${esc(plan.deficit.note)}</span></p>` : ''}
    ${plan.hardLimits.length ? `<div class="rxlimit"><h5>Do not exceed</h5>${list(plan.hardLimits)}</div>` : ''}
    ${plan.prerequisites?.length ? `<div class="blk"><h5>Before, or alongside</h5>${list(plan.prerequisites)}</div>` : ''}
    ${rows}
    <div class="blk"><h5>Monitoring during correction</h5>${list(plan.monitoring)}</div>
    <p class="note">Decision support only. Doses are computed from the values and weight recorded in this report and
    must be checked against local protocol, renal function and allergy status before prescribing.</p>
  </div>`;
}

function derivedHtml(m: ModuleResult): string {
  const entries = Object.values(m.derived);
  if (!entries.length) return '';
  return `<table class="kv">${entries
    .map(
      (d) =>
        `<tr><th>${esc(d.label)}</th><td><strong>${esc(d.value)}</strong>${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}</td></tr>`,
    )
    .join('')}</table>`;
}

function analyteTable(m: ModuleResult): string {
  if (!m.analytes.length) return '';
  const rows = m.analytes
    .map((a) => {
      const def = ANALYTE_BY_KEY[a.key];
      const flagText = a.flag === 'high' ? 'H' : a.flag === 'low' ? 'L' : '';
      const ref = describeRange({ low: a.refLow, high: a.refHigh }, def?.decimals ?? 1);
      const provenance = a.manual
        ? 'Manual entry'
        : a.edited
          ? 'OCR value, corrected by clinician'
          : `OCR (${Math.round(a.confidence * 100)}% confidence)`;
      const original = a.rawValue !== undefined && (a.rawValue !== a.value || a.rawUnit !== a.unit)
        ? `${fmt(a.rawValue)}${a.rawUnit ? ` ${a.rawUnit}` : ''}`
        : '—';
      return `<tr>
        <td>${esc(a.label)}</td>
        <td class="num"><strong>${esc(fmt(a.value, def?.decimals))}</strong></td>
        <td>${esc(a.unit)}</td>
        <td class="num" style="color:${flagText === 'H' ? '#b45309' : flagText === 'L' ? '#0d6ea8' : '#666'}">${flagText || '—'}</td>
        <td class="num">${esc(ref)}</td>
        <td class="num">${esc(original)}</td>
        <td class="small">${esc(provenance)}</td>
      </tr>`;
    })
    .join('');
  return `<table class="data">
    <thead><tr>
      <th>Analyte</th><th class="num">Validated value</th><th>Unit</th><th class="num">Flag</th>
      <th class="num">Reference</th><th class="num">Original OCR</th><th>Provenance</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function observationTable(m: ModuleResult): string {
  if (!m.observations.length) return '';
  return `<table class="data">
    <thead><tr><th>Observation</th><th>Value</th><th>Source text</th></tr></thead>
    <tbody>${m.observations
      .map((o) => `<tr><td>${esc(o.label)}</td><td><strong>${esc(o.value)}</strong></td><td class="small">${esc(o.rawText)}</td></tr>`)
      .join('')}</tbody>
  </table>`;
}

function moduleSection(m: ModuleResult, heading: string): string {
  if (!m.present) {
    return `<section class="mod">
      <h3>${esc(heading)}</h3>
      <p class="none">No data available for this module in the current session.</p>
    </section>`;
  }
  return `<section class="mod">
    <h3>${esc(heading)} ${sevBadge(m.severity)}</h3>
    <p class="summary">${esc(m.summary)}</p>
    ${derivedHtml(m)}
    ${analyteTable(m)}
    ${observationTable(m)}
    ${m.findings.length ? m.findings.map(findingHtml).join('') : '<p class="none">No interpretive findings generated for this module.</p>'}
  </section>`;
}

function microbiologySection(micro: ModuleResult): string {
  if (!micro.present) {
    return `<section class="mod"><h3>Microbiology Summary</h3><p class="none">No microbiology data available in the current session.</p></section>`;
  }
  return `<section class="mod">
    <h3>Microbiology Summary ${sevBadge(micro.severity)}</h3>
    <p class="summary">${esc(micro.summary)}</p>
    ${derivedHtml(micro)}
    ${micro.findings.map(findingHtml).join('')}
  </section>`;
}

/** Full antimicrobial susceptibility tables, drawn from the raw extraction. */
function susceptibilityTablesHtml(micro: MicrobiologyReport[]): string {
  if (!micro.length || !micro.some((m) => m.organisms.length)) return '';
  const blocks = micro
    .flatMap((rep) =>
      rep.organisms.map((org) => {
        const t = susceptibilityTable(org);
        const row = (label: string, items: typeof t.sensitive, ink: string) =>
          items.length
            ? `<tr><th style="color:${ink}">${label}</th><td>${items.map((s) => esc(s.antibiotic)).join(', ')}</td></tr>`
            : '';
        if (!org.susceptibilities.length) {
          return `<div class="susc"><h4>${esc(org.name)} — ${esc(rep.specimen)}</h4><p class="none">No susceptibility results were reported for this isolate.</p></div>`;
        }
        return `<div class="susc">
          <h4>${esc(org.name)} — ${esc(rep.specimen)}</h4>
          <table class="kv">
            ${row('Sensitive', t.sensitive, '#1b7f4f')}
            ${row('Intermediate', t.intermediate, '#9a6b00')}
            ${row('Resistant', t.resistant, '#b91c1c')}
            ${org.resistanceMarkers.length ? `<tr><th>Resistance markers</th><td><strong>${esc(org.resistanceMarkers.join(', '))}</strong></td></tr>` : ''}
          </table>
        </div>`;
      }),
    )
    .join('');
  return `<section class="mod"><h3>Antimicrobial Susceptibility Overview</h3>${blocks}
    <p class="note">Susceptibility results are reproduced as reported by the issuing laboratory. Suggested options presented elsewhere in this report are decision support only; the application does not prescribe. Confirm against local antimicrobial guidance, renal function and documented allergies before prescribing.</p>
  </section>`;
}

export interface ReportOptions {
  institution: InstitutionConfig;
  /** Include the full raw OCR text of each source document. */
  includeRawText?: boolean;
  clinicianNotes?: string;
  /** Raw microbiology reports, used to render the full susceptibility tables. */
  micro?: MicrobiologyReport[];
}

export function buildReportBody(a: AnalysisResult, opts: ReportOptions): string {
  const inst = opts.institution;
  const p = a.patient;
  const generated = new Date(a.generatedAt);

  const module = (id: ModuleId): ModuleResult =>
    a.modules.find((m) => m.module === id) ?? {
      module: id, present: false, analytes: [], observations: [], findings: [],
      summary: '', severity: 'normal', derived: {},
    };

  const alerts = alertingFindings(a.modules, 'critical');
  const criticalCorr = a.correlations.filter((c) => severityRank(c.severity) >= severityRank('critical'));

  // ── Header ────────────────────────────────────────────────────────
  const header = `
  <header class="rpt-head">
    <div class="rpt-head-left">
      ${inst.logoDataUrl ? `<img class="crest" src="${esc(inst.logoDataUrl)}" alt="Institution crest">` : ''}
      <div>
        <div class="hosp">${esc(inst.hospitalName || 'Hospital name not configured')}</div>
        ${inst.departmentName ? `<div class="dept">${esc(inst.departmentName)}</div>` : ''}
        ${inst.addressLine ? `<div class="addr">${esc(inst.addressLine)}</div>` : ''}
      </div>
    </div>
    <div class="rpt-head-right">${nexoraLogoSvgString(true)}</div>
  </header>
  <div class="rpt-title">
    <h1>Comprehensive Clinical Diagnostic Report</h1>
    <div class="rpt-meta">
      Generated ${esc(generated.toLocaleString())} · Overall priority classification: <strong style="color:${SEV_INK[a.overallSeverity]}">${esc(SEVERITY_LABEL[a.overallSeverity])}</strong>
    </div>
  </div>`;

  // ── Patient overview ──────────────────────────────────────────────
  const kv = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${esc(v || '—')}</td></tr>`;
  const overview = `
  <section class="mod">
    <h3>Patient Overview</h3>
    <table class="kv two-col">
      ${kv('Patient name', p.name)}
      ${kv('Hospital number', p.hospitalNumber)}
      ${kv('Age', p.age !== null ? `${p.age} years` : '')}
      ${kv('Sex', p.sex === 'unspecified' ? 'Not recorded' : p.sex.replace(/^./, (c) => c.toUpperCase()))}
      ${kv('Weight', p.weightKg !== null ? `${p.weightKg} kg` : '')}
      ${kv('Clinical location / ward', p.ward)}
      ${kv('Consultant', p.consultant)}
      ${kv('Working diagnosis', p.diagnosis)}
      ${kv('Sample / report date', p.collectedAt)}
      ${kv('Report generated', generated.toLocaleString())}
      ${kv('Known drug allergies', p.allergies.length ? p.allergies.join(', ') : 'None recorded')}
      ${kv('Clinical context', [
        p.fever ? 'Febrile' : '',
        p.plannedSurgery ? 'Surgery planned' : '',
        p.onAnticoagulant ? `Anticoagulated (${p.anticoagulantName || 'agent not specified'})` : '',
        p.pregnant ? 'Pregnant' : '',
        p.knownCKD ? 'Known chronic kidney disease' : '',
        p.immunosuppressed ? 'Immunosuppressed' : '',
      ].filter(Boolean).join('; ') || 'None recorded')}
    </table>
    ${p.clinicalDetails ? `<p class="summary"><strong>Clinical details:</strong> ${esc(p.clinicalDetails)}</p>` : ''}
    <table class="kv">
      <tr><th>Source documents analysed</th><td>${a.documents.length
        ? a.documents.map((d) => `${esc(d.fileName)} (${d.pageCount} page${d.pageCount === 1 ? '' : 's'}, ${Math.round(d.meanConfidence * 100)}% recognition confidence)`).join('<br>')
        : 'None — values entered manually'}</td></tr>
    </table>
  </section>`;

  // ── Priority alerts ───────────────────────────────────────────────
  const alertSection = (alerts.length || criticalCorr.length)
    ? `<section class="mod alerts">
        <h3>Priority Alerts — Immediate Clinician Review Advised</h3>
        ${criticalCorr.map((c) => `<div class="alert" style="border-color:${SEV_INK[c.severity]}">
          <strong>${esc(c.title)}</strong> ${sevBadge(c.severity)}
          <p>${esc(c.narrative)}</p>
          ${list(c.actions.slice(0, 5))}
        </div>`).join('')}
        ${alerts.map((f) => `<div class="alert" style="border-color:${SEV_INK[f.severity]}">
          <strong>${esc(f.title)}</strong> ${sevBadge(f.severity)} <span class="modtag">${esc(MODULE_LABEL[f.module])}</span>
          <p>${esc(f.interpretation)}</p>
        </div>`).join('')}
      </section>`
    : `<section class="mod alerts">
        <h3>Priority Alerts</h3>
        <p class="none">No critical or life-threatening findings were identified in the results analysed. This does not exclude clinically significant illness — clinical assessment remains primary.</p>
      </section>`;

  // ── Integrated impression ─────────────────────────────────────────
  const impression = `
  <section class="mod impression">
    <h3>Integrated Clinical Impression</h3>
    ${a.impression.map((para) => `<p>${esc(para)}</p>`).join('')}
  </section>`;

  // ── Correlations ──────────────────────────────────────────────────
  const correlations = `
  <section class="mod">
    <h3>Clinical Correlation Across Investigations</h3>
    ${a.correlations.length
      ? a.correlations.map((c) => `<div class="corr" style="border-left-color:${SEV_INK[c.severity]}">
          <h4>${esc(c.title)} ${sevBadge(c.severity)}</h4>
          <div class="flow">${c.modules.map((m) => esc(MODULE_LABEL[m])).join(' + ')} &rarr; ${esc(c.title.split(' — ')[0])}</div>
          <p>${esc(c.narrative)}</p>
          <h5>Suggested actions</h5>
          <ol>${c.actions.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        </div>`).join('')
      : '<p class="none">No cross-modality correlations were triggered by the current combination of results.</p>'}
  </section>`;

  // ── Next steps ────────────────────────────────────────────────────
  const grouped = new Map<string, string[]>();
  for (const s of a.nextSteps) {
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(s);
    const cat = m?.[1] ?? 'General';
    const text = m?.[2] ?? s;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(text);
  }
  const nextSteps = `
  <section class="mod">
    <h3>Suggested Next Steps</h3>
    <p class="note">The following are clinical decision support suggestions generated from the results analysed. They are not definitive treatment instructions and must be considered against the full clinical picture, local guidelines and specialist advice.</p>
    ${[...grouped.entries()].map(([cat, items]) => `<div class="blk"><h5>${esc(cat)}</h5>${list(items)}</div>`).join('')}
  </section>`;

  // ── Monitoring schedule ───────────────────────────────────────────
  const monitoring = [...new Set(a.modules.flatMap((m) => m.findings).flatMap((f) => f.monitoring))];
  const monitoringSection = `
  <section class="mod">
    <h3>Consolidated Monitoring Schedule</h3>
    ${monitoring.length ? list(monitoring) : '<p class="none">No specific monitoring recommendations generated.</p>'}
  </section>`;

  // ── Clinician notes + signature ───────────────────────────────────
  const signature = `
  <section class="mod sign">
    <h3>Clinician Notes</h3>
    <div class="notes-box">${opts.clinicianNotes ? esc(opts.clinicianNotes).replace(/\n/g, '<br>') : '&nbsp;'}</div>

    <h3 style="margin-top:16px">Electronic Signature</h3>
    <table class="kv sig">
      <tr><th>Reviewed by (name)</th><td class="line"></td></tr>
      <tr><th>Grade / role</th><td class="line"></td></tr>
      <tr><th>GMC / registration number</th><td class="line"></td></tr>
      <tr><th>Signature</th><td class="line tall"></td></tr>
      <tr><th>Date and time of review</th><td class="line"></td></tr>
    </table>
    <p class="note">This report was generated automatically from scanned investigations. It requires review, verification and countersignature by a competent clinician before it is relied upon or filed in the medical record.</p>
  </section>`;

  // ── Raw OCR appendix ──────────────────────────────────────────────
  const rawAppendix = opts.includeRawText && a.documents.length
    ? `<section class="mod page-break">
        <h3>Appendix — Original Extracted Text</h3>
        <p class="note">Verbatim text recognised from each source document, before interpretation. Provided for verification.</p>
        ${a.documents.map((d) => `<h4>${esc(d.fileName)}</h4><pre class="raw">${esc(d.rawText)}</pre>`).join('')}
      </section>`
    : '';

  return `
  ${header}
  ${overview}
  ${alertSection}
  ${impression}
  ${moduleSection(module('renal'), 'Renal Summary')}
  ${moduleSection(module('electrolytes'), 'Electrolyte Summary')}
  ${moduleSection(module('fbc'), 'Full Blood Count Summary')}
  ${moduleSection(module('coagulation'), 'Coagulation Summary')}
  ${moduleSection(module('lft'), 'Liver Function Summary')}
  ${moduleSection(module('abg'), 'Arterial Blood Gas Summary')}
  ${moduleSection(module('inflammatory'), 'Inflammatory Marker Summary')}
  ${moduleSection(module('cardiac'), 'Cardiac Biomarker Summary')}
  ${moduleSection(module('urinalysis'), 'Urinalysis Summary')}
  ${moduleSection(module('ecg'), 'ECG Summary')}
  ${microbiologySection(module('microbiology'))}
  ${susceptibilityTablesHtml(opts.micro ?? [])}
  ${correlations}
  ${nextSteps}
  ${monitoringSection}
  ${signature}
  ${rawAppendix}
  <footer class="rpt-foot">
    <div>${esc(inst.footerNote)}</div>
    <div class="credit">${esc(CREDIT_LINE)}</div>
    <div class="small">All processing performed offline on the local device. No patient information was transmitted.</div>
  </footer>`;
}

export const REPORT_CSS = `
  .rpt-head { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; border-bottom:2px solid #0b63a8; padding-bottom:12px; margin-bottom:14px; }
  .rpt-head-left { display:flex; gap:14px; align-items:center; }
  .rpt-head .crest { height:56px; width:auto; }
  .rpt-head .hosp { font-size:16px; font-weight:700; }
  .rpt-head .dept { font-size:12px; color:#41525f; }
  .rpt-head .addr { font-size:11px; color:#65757f; }
  .rpt-head-right svg { height:44px; width:auto; }
  .rpt-title h1 { font-size:19px; margin:0 0 3px; }
  .rpt-meta { font-size:11.5px; color:#41525f; margin-bottom:16px; }
  .mod { margin-bottom:20px; }
  .mod h3 { font-size:14px; margin:0 0 8px; padding-bottom:5px; border-bottom:1px solid #cfd9e2; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .mod h4 { font-size:12.5px; margin:12px 0 5px; }
  .summary { margin:0 0 10px; }
  .none { color:#7a8894; font-style:italic; margin:4px 0; }
  .note { font-size:11px; color:#55636e; margin:6px 0; }
  .sev { display:inline-block; padding:1px 8px; border:1px solid; border-radius:9px; font-size:9.5px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; }
  table.data { width:100%; border-collapse:collapse; font-size:10.5px; margin:8px 0 12px; }
  table.data th { text-align:left; background:#eef3f8; border:1px solid #cfd9e2; padding:4px 6px; font-size:9.5px; text-transform:uppercase; letter-spacing:.3px; }
  table.data td { border:1px solid #dde5ec; padding:4px 6px; vertical-align:top; }
  table.data td.num, table.data th.num { text-align:right; font-family:Consolas,monospace; }
  table.kv { width:100%; border-collapse:collapse; font-size:11px; margin:6px 0 10px; }
  table.kv th { text-align:left; width:220px; padding:4px 8px 4px 0; vertical-align:top; color:#41525f; font-weight:600; border-bottom:1px solid #e8eef4; }
  table.kv td { padding:4px 0; vertical-align:top; border-bottom:1px solid #e8eef4; }
  table.kv .note { font-size:10px; color:#65757f; margin:2px 0 0; }
  table.kv.sig th { width:210px; }
  table.kv.sig td.line { border-bottom:1px solid #333; height:20px; }
  table.kv.sig td.line.tall { height:40px; }
  .finding { border:1px solid #dde5ec; border-left:4px solid #999; border-radius:4px; padding:9px 12px; margin:8px 0; }
  .finding .fhead { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:5px; font-size:12px; }
  .finding p { margin:0 0 8px; }
  .blk { margin-bottom:8px; }
  .blk h5 { margin:0 0 3px; font-size:9.5px; text-transform:uppercase; letter-spacing:.5px; color:#0b63a8; }
  .blk ul, .corr ul, .mod > ul { margin:0; padding-left:17px; }
  .blk li, .corr li { margin-bottom:2px; }
  .rxplan { border:1px solid #b9d6ea; background:#f5fbff; border-radius:4px; padding:9px 11px; margin:9px 0 4px; }
  .rxhead { font-size:11.5px; color:#0b63a8; margin-bottom:5px; }
  .rxtarget { margin:0 0 6px !important; }
  .rxdef { margin:0 0 7px !important; padding:6px 9px; background:#fff; border:1px solid #dde5ec; border-radius:3px; }
  .rxlimit { border-left:3px solid #b91c1c; background:#fdf2f2; padding:6px 9px 2px; margin-bottom:8px; }
  .rxlimit h5 { margin:0 0 3px; font-size:9.5px; text-transform:uppercase; letter-spacing:.5px; color:#b91c1c; }
  .rxlimit ul { margin:0; padding-left:17px; }
  .rxstep { border:1px solid #dde5ec; background:#fff; border-radius:3px; padding:7px 9px; margin-bottom:7px; break-inside:avoid; }
  .rxwhen { font-size:10.5px; color:#4a5a6a; margin-bottom:5px; }
  .rxroute { display:inline-block; border:1px solid #0b63a8; color:#0b63a8; border-radius:9px; padding:0 6px; font-size:8.5px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; margin-right:5px; }
  .rxtab { width:100%; border-collapse:collapse; }
  .rxtab th { text-align:left; width:92px; vertical-align:top; font-size:9px; text-transform:uppercase; letter-spacing:.4px; color:#6b7a89; font-weight:600; padding:2px 8px 2px 0; }
  .rxtab td { vertical-align:top; padding:2px 0; }
  .rxtab td.dose { font-weight:700; }
  .rxtab ul { margin:0; padding-left:15px; }
  .alerts { border:2px solid #b91c1c; border-radius:5px; padding:12px 14px; background:#fff5f5; }
  .alerts h3 { border-bottom-color:#e7b7b7; color:#7f1d1d; }
  .alert { border-left:4px solid #b91c1c; padding:7px 11px; margin:7px 0; background:#fff; border-radius:3px; }
  .alert p { margin:4px 0 0; }
  .modtag { font-size:9.5px; color:#65757f; }
  .impression p { margin:0 0 8px; }
  .corr { border-left:4px solid #999; padding:9px 12px; margin:9px 0; background:#f8fafc; border-radius:4px; }
  .corr h4 { margin:0 0 5px; display:flex; gap:9px; align-items:center; flex-wrap:wrap; }
  .corr h5 { margin:8px 0 3px; font-size:9.5px; text-transform:uppercase; letter-spacing:.5px; color:#0b63a8; }
  .corr .flow { font-family:Consolas,monospace; font-size:10px; color:#0b63a8; margin-bottom:5px; }
  .corr ol { margin:0; padding-left:18px; }
  .susc { margin-bottom:12px; }
  .notes-box { border:1px solid #cfd9e2; border-radius:4px; min-height:70px; padding:8px 10px; background:#fcfdfe; }
  pre.raw { font-family:Consolas,monospace; font-size:9px; white-space:pre-wrap; background:#f6f8fa; border:1px solid #dde5ec; padding:8px; border-radius:3px; }
  .rpt-foot { border-top:1px solid #cfd9e2; margin-top:22px; padding-top:9px; font-size:10px; color:#55636e; }
  .rpt-foot .credit { font-weight:600; color:#0b63a8; margin-top:2px; }
  .rpt-foot .small { font-size:9.5px; margin-top:2px; }
  .page-break { break-before:page; }
  h3, h4 { break-after:avoid; }
  .finding, .corr, .alert, table { break-inside:avoid; }
  .rxplan { break-inside:auto; }
  .rxstep, .rxlimit { break-inside:avoid; }
`;

/** Self-contained HTML file for the HTML export. */
export function buildStandaloneHtml(a: AnalysisResult, opts: ReportOptions): string {
  const title = `Clinical Report — ${a.patient.name || 'Unidentified patient'}${a.patient.hospitalNumber ? ` (${a.patient.hospitalNumber})` : ''}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 13mm 16mm; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; font-size: 11.5px; line-height: 1.5; color: #14181d; background:#fff; margin:0; padding:22px; max-width: 210mm; margin-inline:auto; }
  @media print { body { padding: 0; max-width: none; } }
  ${REPORT_CSS}
</style>
</head>
<body>
${buildReportBody(a, opts)}
</body>
</html>`;
}
