/**
 * Report classifier.
 *
 * Determines which diagnostic modules a scanned document contains, so the
 * appropriate parsers run and the document is filed under the right heading.
 * A single document frequently contains several panels (U&E + LFT + FBC on one
 * page), so this returns all modules that score above threshold.
 */
import type { ModuleId } from '../clinical/types';

interface ClassifierRule {
  module: ModuleId;
  /** Strong indicators — a single hit is close to conclusive. */
  strong: RegExp[];
  /** Weak indicators — several are needed. */
  weak: RegExp[];
}

const RULES: ClassifierRule[] = [
  {
    module: 'fbc',
    strong: [/full blood count/i, /complete blood count/i, /\bfbc\b/i, /\bcbc\b/i, /haemogram/i, /differential count/i],
    weak: [/haemoglobin/i, /hemoglobin/i, /\bhb\b/i, /platelet/i, /\bmcv\b/i, /\bmch\b/i, /neutrophil/i, /lymphocyte/i, /packed cell volume/i, /\bpcv\b/i, /white cell/i, /\brdw\b/i, /eosinophil/i],
  },
  {
    module: 'coagulation',
    strong: [/coagulation (?:screen|profile|studies)/i, /clotting screen/i, /\bcoag screen\b/i],
    weak: [/prothrombin time/i, /\binr\b/i, /\baptt\b/i, /\bpt\b\s*[:\-]/i, /fibrinogen/i, /d-?\s?dimer/i, /thrombin time/i, /anti-?xa/i],
  },
  {
    module: 'renal',
    strong: [/renal (?:function|profile)/i, /urea and electrolytes/i, /\bu&e\b/i, /\bues\b/i, /kidney function/i],
    weak: [/creatinine/i, /\burea\b/i, /\begfr\b/i, /\bgfr\b/i, /cystatin/i, /uric acid/i],
  },
  {
    module: 'electrolytes',
    strong: [/electrolytes/i, /urea and electrolytes/i, /\bu&e\b/i, /bone profile/i],
    weak: [/sodium/i, /potassium/i, /chloride/i, /bicarbonate/i, /magnesium/i, /phosphate/i, /\bcalcium\b/i, /osmolality/i],
  },
  {
    module: 'lft',
    strong: [/liver (?:function|profile)/i, /\blft'?s?\b/i, /hepatic panel/i],
    weak: [/bilirubin/i, /\balt\b/i, /\bast\b/i, /alkaline phosphatase/i, /\balp\b/i, /\bggt\b/i, /albumin/i, /sgot/i, /sgpt/i, /total protein/i],
  },
  {
    module: 'abg',
    strong: [/arterial blood gas/i, /\babg\b/i, /blood gas (?:analysis|report)/i, /venous blood gas/i, /\bvbg\b/i],
    weak: [/\bpo2\b/i, /\bpco2\b/i, /\bpao2\b/i, /\bpaco2\b/i, /base excess/i, /\bhco3\b/i, /\bfio2\b/i, /lactate/i, /\bph\b\s*[:\s]\s*7/i, /carboxyhaemoglobin/i],
  },
  {
    module: 'urinalysis',
    strong: [/urinalysis/i, /urine (?:analysis|dipstick|routine)/i, /\bdipstick\b/i, /urine microscopy/i],
    weak: [/specific gravity/i, /leucocyte esterase/i, /\bnitrite\b/i, /urobilinogen/i, /\bketones?\b/i, /albumin[: ]?creatinine ratio/i, /\bcasts?\b/i],
  },
  {
    module: 'inflammatory',
    strong: [/inflammatory markers/i, /acute phase/i],
    weak: [/c-?reactive protein/i, /\bcrp\b/i, /\besr\b/i, /erythrocyte sedimentation/i, /procalcitonin/i, /ferritin/i, /transferrin saturation/i, /vitamin b12/i, /\bfolate\b/i],
  },
  {
    module: 'cardiac',
    strong: [/cardiac (?:markers|enzymes|biomarkers)/i, /troponin/i],
    weak: [/\bck-?mb\b/i, /creatine kinase/i, /\bbnp\b/i, /nt-?probnp/i, /natriuretic/i],
  },
  {
    module: 'ecg',
    strong: [/electrocardiogram/i, /\becg\b/i, /\bekg\b/i, /12[\s-]?lead/i, /rhythm strip/i, /\bsinus rhythm\b/i, /vent(?:ricular)?\.? rate/i],
    weak: [/\bqrs\b/i, /\bqtc?\b/i, /\bpr interval\b/i, /\bp-?r-?t axes\b/i, /\bbpm\b/i, /\batrial fibrillation\b/i, /\bst (?:elevation|depression)\b/i, /bundle branch block/i],
  },
  {
    module: 'microbiology',
    strong: [
      /microbiology/i, /culture (?:and|&) sensitivit/i, /\bm,?\s?c\s?(?:and|&|,)?\s?s\b/i, /\bmcs\b/i,
      /wound swab/i, /blood culture/i, /urine culture/i, /sensitivity (?:report|pattern)/i, /antibiogram/i,
    ],
    weak: [/gram (?:positive|negative|stain)/i, /\bno growth\b/i, /mixed growth/i, /organism/i, /\bisolate[ds]?\b/i, /\bcolonies\b/i, /\bcfu\b/i, /sensitive to/i, /resistant to/i, /\bmrsa\b/i, /\besbl\b/i, /\bspp\.?\b/i, /staphylococcus|streptococcus|escherichia|klebsiella|pseudomonas|enterococcus|proteus|candida|acinetobacter/i],
  },
];

export interface Classification {
  modules: ModuleId[];
  scores: Record<string, number>;
  primary: ModuleId;
}

/**
 * Count distinct ECG lead labels appearing as standalone tokens.
 *
 * A photograph of a tracing frequently carries no report text at all — no
 * "ECG" heading, no measurement block — but it always carries its lead labels.
 * Several distinct labels is therefore strong evidence on its own, and without
 * this a bare tracing is classified as nothing and never reaches the waveform
 * analyser.
 */
export function countLeadLabels(text: string): number {
  const found = new Set<string>();
  const tokens = text.split(/[^A-Za-z0-9]+/);
  for (const t of tokens) {
    if (/^(aVR|aVL|aVF)$/i.test(t)) found.add(t.toUpperCase());
    else if (/^V[1-6]$/i.test(t)) found.add(t.toUpperCase());
    else if (/^(I|II|III)$/.test(t)) found.add(t);
  }
  return found.size;
}

export function classifyReport(text: string): Classification {
  const scores: Record<string, number> = {};

  for (const rule of RULES) {
    let s = 0;
    for (const p of rule.strong) if (p.test(text)) s += 4;
    for (const p of rule.weak) if (p.test(text)) s += 1;
    if (s > 0) scores[rule.module] = s;
  }

  const leadLabels = countLeadLabels(text);
  if (leadLabels >= 4) {
    scores.ecg = (scores.ecg ?? 0) + 4 + Math.min(leadLabels, 8);
  } else if (leadLabels >= 2) {
    scores.ecg = (scores.ecg ?? 0) + 2;
  }

  const modules = Object.entries(scores)
    .filter(([, s]) => s >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m as ModuleId);

  const primary = (modules[0] ?? 'other') as ModuleId;
  return { modules: modules.length ? modules : ['other'], scores, primary };
}
