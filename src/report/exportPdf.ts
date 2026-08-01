/**
 * A4 PDF export.
 *
 * Rendered with jsPDF as real vector text (not a screenshot), so the output is
 * searchable, selectable, small, and crisp at any zoom. Runs entirely locally.
 */
import { jsPDF } from 'jspdf';
import { alertingFindings } from '../clinical/analyse';
import { describeRange, ANALYTE_BY_KEY } from '../clinical/referenceRanges';
import { susceptibilityTable } from '../clinical/modules/microbiology';
import { fmt } from '../clinical/units';
import { CREDIT_LINE } from '../brand/NexoraLogo';
import type { InstitutionConfig } from '../config/institution';
import {
  MODULE_LABEL,
  SEVERITY_LABEL,
  severityRank,
  type AnalysisResult,
  type Finding,
  type MicrobiologyReport,
  type ModuleId,
  type ModuleResult,
  type Severity,
} from '../clinical/types';

const PAGE_W = 210;
const PAGE_H = 297;
const M_LEFT = 14;
const M_RIGHT = 14;
const M_TOP = 16;
const M_BOTTOM = 18;
const CONTENT_W = PAGE_W - M_LEFT - M_RIGHT;

const INK: Record<Severity, [number, number, number]> = {
  normal: [27, 127, 79],
  minor: [13, 110, 168],
  moderate: [154, 107, 0],
  significant: [180, 83, 9],
  critical: [185, 28, 28],
  'life-threatening': [127, 13, 58],
};

const BLUE: [number, number, number] = [11, 99, 168];
const GREY: [number, number, number] = [85, 99, 110];
const DARK: [number, number, number] = [20, 24, 29];

class Doc {
  readonly pdf: jsPDF;
  y = M_TOP;
  page = 1;

  constructor(private readonly title: string, private readonly inst: InstitutionConfig) {
    this.pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.pdf.setProperties({ title, creator: 'Clinician Assistant — NEXORA Innovations' });
  }

  private footer() {
    const p = this.pdf;
    p.setDrawColor(207, 217, 226);
    p.setLineWidth(0.2);
    p.line(M_LEFT, PAGE_H - M_BOTTOM + 4, PAGE_W - M_RIGHT, PAGE_H - M_BOTTOM + 4);
    p.setFontSize(6.8);
    p.setTextColor(...GREY);
    p.setFont('helvetica', 'normal');
    p.text(this.inst.footerNote.slice(0, 120), M_LEFT, PAGE_H - M_BOTTOM + 8);
    p.setTextColor(...BLUE);
    p.setFont('helvetica', 'bold');
    p.text(CREDIT_LINE, M_LEFT, PAGE_H - M_BOTTOM + 11.4);
    p.setFont('helvetica', 'normal');
    p.setTextColor(...GREY);
    p.text(`Page ${this.page}`, PAGE_W - M_RIGHT, PAGE_H - M_BOTTOM + 11.4, { align: 'right' });
  }

  newPage() {
    this.footer();
    this.pdf.addPage();
    this.page++;
    this.y = M_TOP;
  }

  need(mm: number) {
    if (this.y + mm > PAGE_H - M_BOTTOM) this.newPage();
  }

  gap(mm = 2) {
    this.y += mm;
  }

  text(
    body: string,
    opts: { size?: number; bold?: boolean; italic?: boolean; color?: [number, number, number]; indent?: number; lineGap?: number } = {},
  ) {
    const { size = 8.2, bold = false, italic = false, color = DARK, indent = 0, lineGap = 0.6 } = opts;
    const p = this.pdf;
    p.setFontSize(size);
    p.setFont('helvetica', bold ? (italic ? 'bolditalic' : 'bold') : italic ? 'italic' : 'normal');
    p.setTextColor(...color);
    const lines = p.splitTextToSize(body, CONTENT_W - indent) as string[];
    const lh = size * 0.3528 + lineGap;
    for (const line of lines) {
      this.need(lh + 1);
      p.text(line, M_LEFT + indent, this.y + lh * 0.75);
      this.y += lh;
    }
  }

  h1(t: string) {
    this.need(12);
    this.text(t, { size: 14, bold: true });
    this.gap(1.5);
  }

  h2(t: string, badge?: Severity) {
    this.need(14);
    this.gap(3);
    const p = this.pdf;
    p.setFontSize(10);
    p.setFont('helvetica', 'bold');
    p.setTextColor(...DARK);
    p.text(t, M_LEFT, this.y + 3.4);
    if (badge) {
      const label = SEVERITY_LABEL[badge].toUpperCase();
      p.setFontSize(6.2);
      p.setTextColor(...INK[badge]);
      p.text(label, PAGE_W - M_RIGHT, this.y + 3.2, { align: 'right' });
    }
    this.y += 5;
    p.setDrawColor(207, 217, 226);
    p.setLineWidth(0.25);
    p.line(M_LEFT, this.y, PAGE_W - M_RIGHT, this.y);
    this.y += 2.6;
  }

  h3(t: string, color: [number, number, number] = BLUE) {
    this.need(8);
    this.gap(1.4);
    this.text(t.toUpperCase(), { size: 6.6, bold: true, color });
    this.gap(0.6);
  }

  bullets(items: string[], indent = 3.5) {
    for (const item of items.filter(Boolean)) {
      const p = this.pdf;
      p.setFontSize(7.8);
      p.setFont('helvetica', 'normal');
      p.setTextColor(...DARK);
      const lines = p.splitTextToSize(item, CONTENT_W - indent - 3) as string[];
      const lh = 7.8 * 0.3528 + 0.55;
      this.need(lh * lines.length + 1);
      p.setTextColor(...BLUE);
      p.text('•', M_LEFT + indent, this.y + lh * 0.75);
      p.setTextColor(...DARK);
      lines.forEach((line, i) => {
        p.text(line, M_LEFT + indent + 3, this.y + lh * 0.75 + i * lh);
      });
      this.y += lh * lines.length + 0.4;
    }
  }

  kv(rows: [string, string][], keyWidth = 46) {
    const p = this.pdf;
    for (const [k, v] of rows) {
      p.setFontSize(7.6);
      p.setFont('helvetica', 'bold');
      p.setTextColor(...GREY);
      const vLines = p.splitTextToSize(v || '—', CONTENT_W - keyWidth - 2) as string[];
      const lh = 7.6 * 0.3528 + 0.75;
      this.need(lh * vLines.length + 1.2);
      p.text(k, M_LEFT, this.y + lh * 0.75);
      p.setFont('helvetica', 'normal');
      p.setTextColor(...DARK);
      vLines.forEach((line, i) => p.text(line, M_LEFT + keyWidth, this.y + lh * 0.75 + i * lh));
      this.y += lh * vLines.length + 0.5;
    }
    this.gap(1);
  }

  table(headers: string[], widths: number[], rows: string[][], aligns: ('l' | 'r')[] = []) {
    const p = this.pdf;
    const drawHead = () => {
      this.need(7);
      p.setFillColor(238, 243, 248);
      p.rect(M_LEFT, this.y, CONTENT_W, 5, 'F');
      p.setFontSize(6.4);
      p.setFont('helvetica', 'bold');
      p.setTextColor(...GREY);
      let x = M_LEFT;
      headers.forEach((h, i) => {
        const a = aligns[i] ?? 'l';
        p.text(h.toUpperCase(), a === 'r' ? x + widths[i] - 1.5 : x + 1.5, this.y + 3.4, { align: a === 'r' ? 'right' : 'left' });
        x += widths[i];
      });
      this.y += 5;
    };
    drawHead();

    p.setFont('helvetica', 'normal');
    for (const row of rows) {
      p.setFontSize(6.9);
      const cellLines = row.map((c, i) => p.splitTextToSize(c || '—', widths[i] - 3) as string[]);
      const maxLines = Math.max(...cellLines.map((c) => c.length), 1);
      const lh = 6.9 * 0.3528 + 0.5;
      const rowH = maxLines * lh + 1.4;
      if (this.y + rowH > PAGE_H - M_BOTTOM) {
        this.newPage();
        drawHead();
        p.setFont('helvetica', 'normal');
      }
      p.setDrawColor(221, 229, 236);
      p.setLineWidth(0.15);
      p.line(M_LEFT, this.y + rowH, PAGE_W - M_RIGHT, this.y + rowH);
      let x = M_LEFT;
      cellLines.forEach((lines, i) => {
        const a = aligns[i] ?? 'l';
        p.setTextColor(...DARK);
        lines.forEach((line, j) => {
          p.text(line, a === 'r' ? x + widths[i] - 1.5 : x + 1.5, this.y + 3.1 + j * lh, { align: a === 'r' ? 'right' : 'left' });
        });
        x += widths[i];
      });
      this.y += rowH;
    }
    this.gap(2);
  }

  rule(color: [number, number, number] = [207, 217, 226], width = 0.25) {
    this.need(2);
    this.pdf.setDrawColor(...color);
    this.pdf.setLineWidth(width);
    this.pdf.line(M_LEFT, this.y, PAGE_W - M_RIGHT, this.y);
    this.gap(2);
  }

  /** Left accent bar used for findings and correlations. */
  accentBlock(sev: Severity, render: () => void) {
    const start = this.y;
    const startPage = this.page;
    render();
    if (this.page === startPage) {
      this.pdf.setDrawColor(...INK[sev]);
      this.pdf.setLineWidth(0.9);
      this.pdf.line(M_LEFT - 2.2, start, M_LEFT - 2.2, this.y - 1);
    }
    this.gap(1.5);
  }

  finish(): Blob {
    this.footer();
    return this.pdf.output('blob');
  }
}

function drawHeader(d: Doc, a: AnalysisResult, inst: InstitutionConfig) {
  const p = d.pdf;

  // Institution block
  p.setFontSize(11.5);
  p.setFont('helvetica', 'bold');
  p.setTextColor(...DARK);
  p.text(inst.hospitalName || 'Hospital name not configured', M_LEFT, d.y + 4);
  let hy = d.y + 8;
  if (inst.departmentName) {
    p.setFontSize(7.4);
    p.setFont('helvetica', 'normal');
    p.setTextColor(...GREY);
    p.text(inst.departmentName, M_LEFT, hy);
    hy += 3.2;
  }
  if (inst.addressLine) {
    p.setFontSize(6.8);
    p.setTextColor(...GREY);
    p.text(inst.addressLine, M_LEFT, hy);
    hy += 3.2;
  }

  // NEXORA monogram + wordmark, drawn as vectors so no asset is needed.
  const ox = PAGE_W - M_RIGHT - 46;
  const oy = d.y + 1;
  const s = 0.1; // scale: 100x116 units -> 10x11.6 mm
  const poly = (pts: number[][], rgb: [number, number, number]) => {
    p.setFillColor(...rgb);
    const lines = pts.slice(1).map((pt, i) => [(pt[0] - pts[i][0]) * s, (pt[1] - pts[i][1]) * s]);
    p.lines(lines, ox + pts[0][0] * s, oy + pts[0][1] * s, [1, 1], 'F', true);
  };
  poly([[0, 0], [20, 0], [70, 48], [20, 48], [20, 86], [0, 100]], BLUE);
  poly([[100, 116], [80, 116], [30, 68], [80, 68], [80, 30], [100, 16]], DARK);

  p.setFontSize(11);
  p.setFont('helvetica', 'bold');
  p.setTextColor(...DARK);
  p.text('NEXORA', ox + 13, oy + 7.5);
  p.setFontSize(4.6);
  p.setFont('helvetica', 'bold');
  p.setTextColor(...BLUE);
  p.text('INNOVATIONS', ox + 13.4, oy + 10.6);
  p.setTextColor(...DARK);
  p.text(': BUILDING SOLUTIONS', ox + 28, oy + 10.6);

  d.y = Math.max(hy + 1, oy + 13.5);
  p.setDrawColor(...BLUE);
  p.setLineWidth(0.6);
  p.line(M_LEFT, d.y, PAGE_W - M_RIGHT, d.y);
  d.y += 4;

  d.h1('Comprehensive Clinical Diagnostic Report');
  const gen = new Date(a.generatedAt);
  p.setFontSize(7.2);
  p.setFont('helvetica', 'normal');
  p.setTextColor(...GREY);
  p.text(`Generated ${gen.toLocaleString()}`, M_LEFT, d.y + 2.4);
  p.setFont('helvetica', 'bold');
  p.setTextColor(...INK[a.overallSeverity]);
  p.text(`Overall priority: ${SEVERITY_LABEL[a.overallSeverity]}`, PAGE_W - M_RIGHT, d.y + 2.4, { align: 'right' });
  d.y += 6;
}

function findingPdf(d: Doc, f: Finding) {
  d.accentBlock(f.severity, () => {
    d.need(14);
    d.text(`${f.title}  [${SEVERITY_LABEL[f.severity]}]`, { size: 8.4, bold: true, color: INK[f.severity] });
    d.text(f.interpretation, { size: 7.8 });
    const sub = (t: string, items: string[]) => {
      if (!items.filter(Boolean).length) return;
      d.h3(t);
      d.bullets(items);
    };
    sub('Possible differential diagnoses', f.differentials);
    sub('Suggested additional investigations', f.investigations);
    sub('Potential clinical implications', f.implications);
    sub('Monitoring recommendations', f.monitoring);
    sub('Practice guidance', f.guidance);
  });
}

function modulePdf(d: Doc, m: ModuleResult, heading: string) {
  if (!m.present) {
    d.h2(heading);
    d.text('No data available for this module in the current session.', { size: 7.8, italic: true, color: GREY });
    return;
  }
  d.h2(heading, m.severity);
  d.text(m.summary, { size: 8 });
  d.gap(1);

  const derived = Object.values(m.derived);
  if (derived.length) {
    d.kv(derived.map((x) => [x.label, x.note ? `${x.value} — ${x.note}` : x.value]));
  }

  if (m.analytes.length) {
    d.table(
      ['Analyte', 'Value', 'Unit', 'Flag', 'Reference', 'OCR original', 'Provenance'],
      [44, 18, 20, 10, 24, 22, 44],
      m.analytes.map((a) => {
        const def = ANALYTE_BY_KEY[a.key];
        return [
          a.label,
          fmt(a.value, def?.decimals),
          a.unit,
          a.flag === 'high' ? 'H' : a.flag === 'low' ? 'L' : '',
          describeRange({ low: a.refLow, high: a.refHigh }, def?.decimals ?? 1),
          a.rawValue !== undefined && (a.rawValue !== a.value || a.rawUnit !== a.unit) ? `${fmt(a.rawValue)} ${a.rawUnit ?? ''}`.trim() : '—',
          a.manual ? 'Manual entry' : a.edited ? 'OCR, clinician corrected' : `OCR ${Math.round(a.confidence * 100)}%`,
        ];
      }),
      ['l', 'r', 'l', 'r', 'r', 'r', 'l'],
    );
  }

  if (m.observations.length) {
    d.table(
      ['Observation', 'Value', 'Source text'],
      [50, 34, 98],
      m.observations.map((o) => [o.label, o.value, o.rawText]),
    );
  }

  if (m.findings.length) {
    for (const f of m.findings) findingPdf(d, f);
  } else {
    d.text('No interpretive findings generated for this module.', { size: 7.6, italic: true, color: GREY });
  }
}

export interface PdfOptions {
  institution: InstitutionConfig;
  clinicianNotes?: string;
  includeRawText?: boolean;
  micro?: MicrobiologyReport[];
}

export function buildPdf(a: AnalysisResult, opts: PdfOptions): Blob {
  const inst = opts.institution;
  const p = a.patient;
  const title = `Clinical Report — ${p.name || 'Unidentified'}${p.hospitalNumber ? ` (${p.hospitalNumber})` : ''}`;
  const d = new Doc(title, inst);

  drawHeader(d, a, inst);

  const mod = (id: ModuleId): ModuleResult =>
    a.modules.find((m) => m.module === id) ?? {
      module: id, present: false, analytes: [], observations: [], findings: [], summary: '', severity: 'normal', derived: {},
    };

  // ── Patient overview ────────────────────────────────────────────
  d.h2('Patient Overview');
  d.kv([
    ['Patient name', p.name],
    ['Hospital number', p.hospitalNumber],
    ['Age / sex', `${p.age !== null ? `${p.age} years` : 'Age not recorded'} · ${p.sex === 'unspecified' ? 'Sex not recorded' : p.sex}`],
    ['Weight', p.weightKg !== null ? `${p.weightKg} kg` : ''],
    ['Clinical location', p.ward],
    ['Consultant', p.consultant],
    ['Working diagnosis', p.diagnosis],
    ['Sample / report date', p.collectedAt],
    ['Known drug allergies', p.allergies.length ? p.allergies.join(', ') : 'None recorded'],
    ['Clinical context', [
      p.fever ? 'Febrile' : '',
      p.plannedSurgery ? 'Surgery planned' : '',
      p.onAnticoagulant ? `Anticoagulated (${p.anticoagulantName || 'agent not specified'})` : '',
      p.pregnant ? 'Pregnant' : '',
      p.knownCKD ? 'Known CKD' : '',
      p.immunosuppressed ? 'Immunosuppressed' : '',
    ].filter(Boolean).join('; ') || 'None recorded'],
    ['Clinical details', p.clinicalDetails],
    ['Source documents', a.documents.length
      ? a.documents.map((x) => `${x.fileName} (${x.pageCount}p, ${Math.round(x.meanConfidence * 100)}%)`).join('; ')
      : 'None — values entered manually'],
  ]);

  // ── Priority alerts ─────────────────────────────────────────────
  const alerts = alertingFindings(a.modules, 'critical');
  const criticalCorr = a.correlations.filter((c) => severityRank(c.severity) >= severityRank('critical'));
  d.h2('Priority Alerts — Immediate Clinician Review Advised');
  if (!alerts.length && !criticalCorr.length) {
    d.text('No critical or life-threatening findings were identified in the results analysed. This does not exclude clinically significant illness — clinical assessment remains primary.', { size: 7.8, italic: true, color: GREY });
  } else {
    for (const c of criticalCorr) {
      d.accentBlock(c.severity, () => {
        d.text(`${c.title}  [${SEVERITY_LABEL[c.severity]}]`, { size: 8.4, bold: true, color: INK[c.severity] });
        d.text(c.narrative, { size: 7.8 });
        d.bullets(c.actions.slice(0, 5));
      });
    }
    for (const f of alerts) {
      d.accentBlock(f.severity, () => {
        d.text(`${f.title}  [${SEVERITY_LABEL[f.severity]}] · ${MODULE_LABEL[f.module]}`, { size: 8.2, bold: true, color: INK[f.severity] });
        d.text(f.interpretation, { size: 7.8 });
      });
    }
  }

  // ── Integrated impression ───────────────────────────────────────
  d.h2('Integrated Clinical Impression');
  for (const para of a.impression) {
    d.text(para, { size: 8 });
    d.gap(1);
  }

  // ── Modules ─────────────────────────────────────────────────────
  modulePdf(d, mod('renal'), 'Renal Summary');
  modulePdf(d, mod('electrolytes'), 'Electrolyte Summary');
  modulePdf(d, mod('fbc'), 'Full Blood Count Summary');
  modulePdf(d, mod('coagulation'), 'Coagulation Summary');
  modulePdf(d, mod('lft'), 'Liver Function Summary');
  modulePdf(d, mod('abg'), 'Arterial Blood Gas Summary');
  modulePdf(d, mod('inflammatory'), 'Inflammatory Marker Summary');
  modulePdf(d, mod('cardiac'), 'Cardiac Biomarker Summary');
  modulePdf(d, mod('urinalysis'), 'Urinalysis Summary');
  modulePdf(d, mod('ecg'), 'ECG Summary');
  modulePdf(d, mod('microbiology'), 'Microbiology Summary');

  // ── Susceptibility tables ───────────────────────────────────────
  const micro = opts.micro ?? [];
  if (micro.some((m) => m.organisms.length)) {
    d.h2('Antimicrobial Susceptibility Overview');
    for (const rep of micro) {
      for (const org of rep.organisms) {
        const t = susceptibilityTable(org);
        d.text(`${org.name} — ${rep.specimen}`, { size: 8.2, bold: true });
        d.kv([
          ['Sensitive', t.sensitive.map((s) => s.antibiotic).join(', ')],
          ['Intermediate', t.intermediate.map((s) => s.antibiotic).join(', ')],
          ['Resistant', t.resistant.map((s) => s.antibiotic).join(', ')],
          ['Resistance markers', org.resistanceMarkers.join(', ')],
        ], 32);
      }
    }
    d.text('Susceptibility results are reproduced as reported by the issuing laboratory. Suggested options elsewhere in this report are decision support only; the application does not prescribe. Confirm against local antimicrobial guidance, renal function and documented allergies before prescribing.', { size: 7, italic: true, color: GREY });
  }

  // ── Correlations ────────────────────────────────────────────────
  d.h2('Clinical Correlation Across Investigations');
  if (!a.correlations.length) {
    d.text('No cross-modality correlations were triggered by the current combination of results.', { size: 7.8, italic: true, color: GREY });
  } else {
    for (const c of a.correlations) {
      d.accentBlock(c.severity, () => {
        d.text(`${c.title}  [${SEVERITY_LABEL[c.severity]}]`, { size: 8.4, bold: true, color: INK[c.severity] });
        if (c.modules.length) {
          d.text(`${c.modules.map((m) => MODULE_LABEL[m]).join(' + ')}  ->  ${c.title.split(' — ')[0]}`, { size: 7, color: BLUE });
        }
        d.text(c.narrative, { size: 7.8 });
        d.h3('Suggested actions');
        d.bullets(c.actions);
      });
    }
  }

  // ── Next steps ──────────────────────────────────────────────────
  d.h2('Suggested Next Steps');
  d.text('The following are clinical decision support suggestions generated from the results analysed. They are not definitive treatment instructions and must be considered against the full clinical picture, local guidelines and specialist advice.', { size: 7.2, italic: true, color: GREY });
  d.gap(1);
  const grouped = new Map<string, string[]>();
  for (const s of a.nextSteps) {
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(s);
    const cat = m?.[1] ?? 'General';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(m?.[2] ?? s);
  }
  for (const [cat, items] of grouped) {
    d.h3(cat);
    d.bullets(items);
  }

  // ── Monitoring schedule ─────────────────────────────────────────
  const monitoring = [...new Set(a.modules.flatMap((m) => m.findings).flatMap((f) => f.monitoring))];
  d.h2('Consolidated Monitoring Schedule');
  if (monitoring.length) d.bullets(monitoring);
  else d.text('No specific monitoring recommendations generated.', { size: 7.8, italic: true, color: GREY });

  // ── Notes & signature ───────────────────────────────────────────
  d.newPage();
  d.h2('Clinician Notes');
  if (opts.clinicianNotes?.trim()) {
    d.text(opts.clinicianNotes, { size: 8 });
  } else {
    for (let i = 0; i < 6; i++) {
      d.need(7);
      d.pdf.setDrawColor(207, 217, 226);
      d.pdf.setLineWidth(0.2);
      d.pdf.line(M_LEFT, d.y + 5, PAGE_W - M_RIGHT, d.y + 5);
      d.y += 7;
    }
  }

  d.h2('Electronic Signature');
  for (const label of ['Reviewed by (name)', 'Grade / role', 'GMC / registration number', 'Signature', 'Date and time of review']) {
    const tall = label === 'Signature';
    d.need(tall ? 14 : 9);
    d.pdf.setFontSize(7.6);
    d.pdf.setFont('helvetica', 'bold');
    d.pdf.setTextColor(...GREY);
    d.pdf.text(label, M_LEFT, d.y + 4);
    d.pdf.setDrawColor(51, 51, 51);
    d.pdf.setLineWidth(0.25);
    const lineY = d.y + (tall ? 10 : 5);
    d.pdf.line(M_LEFT + 46, lineY, PAGE_W - M_RIGHT, lineY);
    d.y += tall ? 14 : 8;
  }
  d.gap(2);
  d.text('This report was generated automatically from scanned investigations. It requires review, verification and countersignature by a competent clinician before it is relied upon or filed in the medical record. All processing was performed offline on the local device; no patient information was transmitted.', { size: 7, italic: true, color: GREY });

  // ── Raw text appendix ───────────────────────────────────────────
  if (opts.includeRawText && a.documents.length) {
    d.newPage();
    d.h2('Appendix — Original Extracted Text');
    d.text('Verbatim text recognised from each source document, before interpretation. Provided for verification.', { size: 7.2, italic: true, color: GREY });
    for (const doc of a.documents) {
      d.gap(2);
      d.text(doc.fileName, { size: 8.2, bold: true });
      d.pdf.setFont('courier', 'normal');
      d.text(doc.rawText.slice(0, 12000), { size: 6.4, color: GREY });
      d.pdf.setFont('helvetica', 'normal');
    }
  }

  return d.finish();
}

export function pdfFilename(hospitalNumber: string, name: string): string {
  const id = (hospitalNumber || name || 'unidentified').replace(/[^A-Za-z0-9\-_]/g, '') || 'unidentified';
  const stamp = new Date().toISOString().slice(0, 10);
  return `clinical-report_${id}_${stamp}.pdf`;
}
