/**
 * Microbiology report parser.
 *
 * Extracts specimen type, microscopy and Gram stain findings, isolated
 * organisms and their susceptibility patterns. Handles the three susceptibility
 * layouts encountered in practice: a tabulated antibiotic/result grid, prose
 * "Sensitive to: … Resistant to: …" lists, and dotted-leader rows.
 */
import type { MicrobiologyReport, Organism, Susceptibility, SusceptibilityResult } from '../clinical/types';
import { ANTIBIOTIC_SYNONYMS, ORGANISM_SYNONYMS, lookupAntibiotic, lookupOrganism } from '../clinical/modules/microbiologyData';

function detectSpecimen(text: string): { type: MicrobiologyReport['specimenType']; label: string } {
  const t = text.toLowerCase();
  const pick = (re: RegExp): string | null => re.exec(text)?.[0]?.trim() ?? null;

  if (/blood culture|bacta?lert|bactec|blood.*(?:aerobic|anaerobic) bottle/i.test(t)) {
    return { type: 'blood', label: pick(/blood culture[^\n,;]{0,40}/i) ?? 'Blood culture' };
  }
  if (/\b(?:wound|swab|ulcer|abscess|pus|discharge|burn|surgical site)\b/i.test(t)) {
    return { type: 'wound', label: pick(/(?:wound|swab|ulcer|abscess|pus)[^\n,;]{0,40}/i) ?? 'Wound swab' };
  }
  if (/\b(?:urine|msu|csu|cathether specimen|catheter specimen|mid-?stream)\b/i.test(t)) {
    return { type: 'urine', label: pick(/(?:urine|msu|csu)[^\n,;]{0,40}/i) ?? 'Urine' };
  }
  if (/\b(?:sputum|bronchial|bal|bronchoalveolar|tracheal aspirate|respiratory)\b/i.test(t)) {
    return { type: 'sputum', label: pick(/(?:sputum|bal|bronchial|tracheal)[^\n,;]{0,40}/i) ?? 'Respiratory specimen' };
  }
  if (/\b(?:csf|cerebrospinal)\b/i.test(t)) {
    return { type: 'csf', label: 'Cerebrospinal fluid' };
  }
  if (/\b(?:tissue|biopsy|bone|aspirate|fluid|joint)\b/i.test(t)) {
    return { type: 'tissue', label: pick(/(?:tissue|biopsy|bone|aspirate|joint)[^\n,;]{0,40}/i) ?? 'Tissue specimen' };
  }
  return { type: 'other', label: pick(/specimen\s*[:\-]\s*[^\n]{2,50}/i) ?? 'Specimen' };
}

function normaliseResult(raw: string): SusceptibilityResult {
  const s = raw.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (/^(s|sens|sensitive|susceptible|susc)$/.test(s)) return 'S';
  if (/^(i|int|intermediate|intermed|iincreasedexposure)$/.test(s)) return 'I';
  if (/^(r|res|resistant|resist)$/.test(s)) return 'R';
  return 'unknown';
}

/** Tabulated / dotted-leader susceptibility rows. */
function parseSusceptibilityRows(block: string): Susceptibility[] {
  const out: Susceptibility[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line || line.length > 90) continue;

    const hit = ANTIBIOTIC_SYNONYMS.find(({ phrase }) => line.toLowerCase().startsWith(phrase));
    if (!hit) continue;

    const tail = line.slice(hit.phrase.length).replace(/^[\s:.\-–|]+/, '');
    const resultToken = /^(sensitive|susceptible|resistant|intermediate|susc|sens|res|int|[sirSIR])\b/.exec(tail);
    if (!resultToken) continue;

    const result = normaliseResult(resultToken[1]);
    if (result === 'unknown') continue;
    if (out.some((o) => o.key === hit.def.key)) continue;

    out.push({ antibiotic: hit.def.name, key: hit.def.key, result, rawText: rawLine.trim() });
  }
  return out;
}

/** Prose form: "Sensitive to: A, B, C. Resistant to: D, E." */
function parseSusceptibilityLists(text: string): Susceptibility[] {
  const out: Susceptibility[] = [];
  const patterns: { re: RegExp; result: SusceptibilityResult }[] = [
    { re: /(?:sensitive|susceptible)\s*(?:to)?\s*[:\-]\s*([^\n]{3,300})/gi, result: 'S' },
    { re: /intermediate\s*(?:to)?\s*[:\-]\s*([^\n]{3,300})/gi, result: 'I' },
    { re: /resistant\s*(?:to)?\s*[:\-]\s*([^\n]{3,300})/gi, result: 'R' },
  ];

  for (const { re, result } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      for (const part of m[1].split(/[,;/]|\band\b/i)) {
        const name = part.replace(/[.()]/g, '').trim();
        if (!name || name.length < 3) continue;
        const def = lookupAntibiotic(name);
        if (!def) continue;
        if (out.some((o) => o.key === def.key)) continue;
        out.push({ antibiotic: def.name, key: def.key, result, rawText: name });
      }
    }
  }
  return out;
}

/** Find organism names, keeping the order in which they appear. */
function findOrganisms(text: string): { name: string; index: number; key: string }[] {
  const found: { name: string; index: number; key: string }[] = [];
  const lower = text.toLowerCase();
  for (const { phrase, def } of ORGANISM_SYNONYMS) {
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(phrase, from);
      if (idx < 0) break;
      from = idx + phrase.length;
      // Skip mentions inside an explicitly negative statement.
      const context = text.slice(Math.max(0, idx - 60), idx).toLowerCase();
      if (/\bno\s+(?:growth|significant)|not isolated|absent\b/.test(context)) continue;
      if (found.some((f) => f.key === def.key)) break;
      found.push({ name: def.name, index: idx, key: def.key });
      break;
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/**
 * A report reading "Staphylococcus aureus (MRSA)" matches both the species and
 * the resistant-variant entry. Keep the resistant variant — it carries the
 * intrinsic-resistance and isolation implications — and give it the earlier
 * position so it claims the whole susceptibility block.
 */
const VARIANT_PARENTS: Record<string, string[]> = {
  mrsa: ['saureus'],
  vre: ['efaecalis', 'efaecium'],
  candidaauris: ['candidaalbicans', 'candidaglabrata'],
};

function mergeResistantVariants(hits: { name: string; index: number; key: string }[]) {
  let out = hits;
  for (const [variant, parents] of Object.entries(VARIANT_PARENTS)) {
    const v = out.find((h) => h.key === variant);
    if (!v) continue;
    const covered = out.filter((h) => parents.includes(h.key));
    if (!covered.length) continue;
    v.index = Math.min(v.index, ...covered.map((c) => c.index));
    out = out.filter((h) => !parents.includes(h.key));
  }
  return out.sort((a, b) => a.index - b.index);
}

const GROWTH_QUANTITY =
  /(heavy growth|moderate growth|scanty growth|light growth|profuse growth|pure growth|>?\s*10\s*\^?\s*[45678]\s*(?:cfu)?\/?m?l?|\d{2,3},?\d{3}\s*cfu\/ml|significant growth)/i;

export function parseMicrobiology(text: string): MicrobiologyReport | null {
  if (!text.trim()) return null;

  const noGrowth = /\bno (?:significant )?(?:bacterial )?growth\b|no organisms? (?:isolated|seen|grown)|sterile\b|culture negative|no pathogens? isolated/i.test(text);
  const mixedGrowth = /mixed (?:bacterial )?growth|mixed flora|mixed skin flora|multiple organisms|polymicrobial/i.test(text);

  const organismHits = mergeResistantVariants(findOrganisms(text));
  if (!organismHits.length && !noGrowth && !mixedGrowth) return null;

  const { type, label } = detectSpecimen(text);

  const microscopy =
    /(?:microscopy|direct (?:microscopy|examination)|wet (?:prep|mount))\s*[:\-]?\s*([^\n]{2,180})/i.exec(text)?.[1]?.trim() ??
    (/(?:pus cells|white cells|leucocytes|epithelial cells|red cells)[^\n]{0,80}/i.exec(text)?.[0]?.trim() ?? '');

  const gramStain =
    /gram\s*(?:stain|film)?\s*[:\-]?\s*([^\n]{2,180})/i.exec(text)?.[1]?.trim() ??
    (/gram[\s-]?(?:positive|negative)\s+(?:cocci|bacilli|rods|organisms)[^\n]{0,60}/i.exec(text)?.[0]?.trim() ?? '');

  const cultureText =
    /(?:culture|growth|isolate[ds]?)\s*[:\-]?\s*([^\n]{2,220})/i.exec(text)?.[1]?.trim() ?? '';

  // Split the document at organism boundaries so each organism gets its own
  // susceptibility block where several are reported.
  const organisms: Organism[] = [];
  for (const [i, hit] of organismHits.entries()) {
    const start = hit.index;
    const end = organismHits[i + 1]?.index ?? text.length;
    const block = text.slice(start, end);

    const rows = parseSusceptibilityRows(block);
    const lists = parseSusceptibilityLists(block);
    const merged = [...rows];
    for (const l of lists) if (!merged.some((m) => m.key === l.key)) merged.push(l);

    // Single-organism reports often place the panel outside the organism block.
    if (!merged.length && organismHits.length === 1) {
      const all = [...parseSusceptibilityRows(text), ...parseSusceptibilityLists(text)];
      for (const s of all) if (!merged.some((m) => m.key === s.key)) merged.push(s);
    }

    const def = lookupOrganism(hit.name);
    const markers: string[] = [];
    for (const m of [/\bmrsa\b/i, /\besbl\b/i, /\bcre\b/i, /\bcpe\b/i, /carbapenemase/i, /\bvre\b/i, /\bampc\b/i, /\bpvl\b/i, /multi[\s-]?drug[\s-]?resistant/i]) {
      const found = m.exec(block) ?? m.exec(text.slice(0, 400));
      if (found) markers.push(found[0].toUpperCase());
    }

    organisms.push({
      name: def?.name ?? hit.name,
      key: hit.key,
      gram: def?.gram ?? 'unknown',
      likelySignificance: 'indeterminate',
      resistanceMarkers: [...new Set(markers)],
      susceptibilities: merged,
      growthQuantity: GROWTH_QUANTITY.exec(block)?.[0] ?? GROWTH_QUANTITY.exec(text)?.[0],
      biofilmRisk: def?.biofilm,
      hospitalAcquiredIndicator: def?.hospitalAcquiredIndicator,
    });
  }

  const collected =
    /(?:collect(?:ed|ion)|specimen|sample|taken)\s*(?:date|on)?\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i.exec(text)?.[1];

  return {
    specimen: label,
    specimenType: type,
    microscopy,
    gramStain,
    cultureText,
    noGrowth: noGrowth && !organisms.length,
    mixedGrowth,
    organisms,
    collectedAt: collected,
  };
}
