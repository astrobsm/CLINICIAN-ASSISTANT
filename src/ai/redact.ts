/**
 * De-identification before anything is transmitted.
 *
 * Assisted extraction sends an image of the report to a third party. Nothing
 * that identifies the patient needs to go with it — the model is transcribing
 * numbers — so identifiers are painted out first, and the clinician is shown
 * the redacted image and confirms it before the first send.
 *
 * Redaction is deliberately generous. Obscuring a line that turned out to be
 * harmless costs nothing; missing one discloses a patient.
 */
import { groupRows, type WordBox } from '../parse/spatial';
import type { PatientContext } from '../clinical/types';

/** Field labels whose whole row is removed wherever they appear. */
const IDENTIFIER_LABELS = [
  'name', 'patient', 'surname', 'forename', 'firstname', 'lastname',
  'hospital', 'hosp', 'mrn', 'nhs', 'unit no', 'unitno', 'reg no', 'regno',
  'patient id', 'patientid', 'lab no', 'labno', 'accession',
  'dob', 'd.o.b', 'date of birth', 'birth',
  'address', 'addr', 'tel', 'phone', 'mobile', 'email', 'postcode', 'zip',
  'nok', 'next of kin', 'consultant', 'clinician', 'requesting', 'referred by',
  'ward', 'clinic', 'bed',
];

export interface RedactionResult {
  canvas: HTMLCanvasElement;
  /** Rows that were painted out, as read — shown so the clinician can check. */
  redactedText: string[];
  /** Regions painted out, in canvas pixels. */
  regions: { x0: number; y0: number; x1: number; y1: number }[];
  /** True when nothing identifiable was found, which warrants a closer look. */
  nothingFound: boolean;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Tokens from the patient record that must not leave, so that an identifier
 * printed without a label beside it is still caught.
 */
function patientTokens(patient: PatientContext): string[] {
  const out: string[] = [];
  for (const part of patient.name.split(/[\s,]+/)) {
    if (part.length >= 3) out.push(normalise(part));
  }
  if (patient.hospitalNumber.length >= 4) out.push(normalise(patient.hospitalNumber));
  if (patient.consultant) {
    for (const part of patient.consultant.split(/[\s,.]+/)) {
      if (part.length >= 3) out.push(normalise(part));
    }
  }
  return out.filter(Boolean);
}

export function redactIdentifiers(
  source: HTMLCanvasElement,
  words: WordBox[],
  patient: PatientContext,
): RedactionResult {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);

  const rows = groupRows(words);
  const tokens = patientTokens(patient);
  const regions: RedactionResult['regions'] = [];
  const redactedText: string[] = [];

  for (const row of rows) {
    const flat = normalise(row.text);
    const lower = row.text.toLowerCase();

    const hasLabel = IDENTIFIER_LABELS.some((label) => {
      const l = label.replace(/[^a-z0-9]/g, '');
      return flat.includes(l) && new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(lower);
    });
    const hasToken = tokens.some((t) => flat.includes(t));

    // A long digit run that is not a measurement — a record number, a
    // telephone number, an NHS number.
    const bareIdentifier = /(?:^|\s)[A-Z]{0,3}\d{6,}(?:\s|$)/.test(row.text);

    if (!hasLabel && !hasToken && !bareIdentifier) continue;

    // The whole row goes, with a margin: a name frequently sits to the right
    // of its label with a gap that word grouping does not span.
    const pad = Math.max(4, (row.bbox.y1 - row.bbox.y0) * 0.35);
    const region = {
      x0: Math.max(0, row.bbox.x0 - pad),
      y0: Math.max(0, row.bbox.y0 - pad),
      x1: Math.min(canvas.width, canvas.width),
      y1: Math.min(canvas.height, row.bbox.y1 + pad),
    };
    regions.push(region);
    redactedText.push(row.text);
  }

  ctx.fillStyle = '#000';
  for (const r of regions) ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);

  // A visible marker, so a redacted image can never be mistaken for the
  // original if it is saved or forwarded.
  if (regions.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `${Math.max(11, Math.round(canvas.width / 90))}px sans-serif`;
    ctx.fillText('IDENTIFIERS REMOVED', 8, canvas.height - 8);
  }

  return { canvas, redactedText, regions, nothingFound: regions.length === 0 };
}

/** Encode for transmission, downscaled to keep the payload sensible. */
export function toTransmissionDataUrl(canvas: HTMLCanvasElement, maxWidth = 1600): string {
  if (canvas.width <= maxWidth) return canvas.toDataURL('image/jpeg', 0.88);
  const scale = maxWidth / canvas.width;
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.88);
}
