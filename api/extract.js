/**
 * Assisted extraction endpoint.
 *
 * Reads a scanned diagnostic report with a vision model and returns the values
 * as structured data. It exists because on-device recognition, however well
 * tuned, still loses values on a poorly lit photograph of a bordered table —
 * and a value silently missed is worse than a value reported with a caveat.
 *
 * Deployment:
 *   OPENAI_API_KEY   required
 *   OPENAI_MODEL     optional, overrides the model preference order
 *   AI_APP_TOKEN     optional, a shared token the client must present
 *
 * The key stays here. It is never sent to the browser.
 *
 * Note on the shared key: this endpoint is reachable by anyone who can reach
 * the deployment. A token shipped inside a browser bundle is not a secret, so
 * it raises the effort required rather than preventing misuse. Set a spending
 * limit on the OpenAI account.
 */

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const RATE_LIMIT = { windowMs: 60_000, max: 20 };

/** Per-instance sliding window. Imperfect across instances, but stops trivial abuse. */
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const window = hits.get(ip) ?? [];
  const recent = window.filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT.max;
}

/**
 * The analyte keys the model may use. Constraining the output to this
 * vocabulary is what allows the result to flow straight into the same
 * reference intervals, grading and correlation rules as a locally read value,
 * with no free-text matching in between.
 */
const ANALYTE_KEYS = [
  'hb', 'hct', 'rbc', 'mcv', 'mch', 'mchc', 'rdw', 'wbc', 'neut', 'lymph', 'mono', 'eos', 'baso',
  'plt', 'mpv', 'pdw', 'pct', 'retic', 'nrbc', 'ig', 'blasts', 'bands',
  'pt', 'inr', 'aptt', 'apttRatio', 'tt', 'fibrinogen', 'ddimer', 'antixa', 'bleedingTime', 'clottingTime',
  'creatinine', 'urea', 'egfr', 'cystatinC', 'uricAcid', 'urineOutput',
  'na', 'k', 'cl', 'hco3', 'calcium', 'ionisedCalcium', 'magnesium', 'phosphate', 'osmolality', 'glucose',
  'alt', 'ast', 'alp', 'ggt', 'bilirubinTotal', 'bilirubinDirect', 'albumin', 'totalProtein',
  'ph', 'paco2', 'pao2', 'baseExcess', 'lactate', 'sao2', 'fio2', 'cohb', 'methb',
  'uPh', 'uSg', 'uAcr', 'uPcr',
  'crp', 'esr', 'procalcitonin', 'ferritin', 'iron', 'tsat', 'b12', 'folate',
  'troponin', 'ckmb', 'ck', 'bnp', 'ntprobnp',
  'ecgRate', 'ecgPr', 'ecgQrs', 'ecgQt', 'ecgQtc', 'ecgAxis',
];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['values', 'differentialPercentages', 'unreadable'],
  properties: {
    values: {
      type: 'array',
      description: 'One entry per numeric result printed on the report.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'value', 'unit', 'printedText', 'refLow', 'refHigh', 'confidence'],
        properties: {
          key: { type: 'string', enum: ANALYTE_KEYS },
          value: { type: 'number', description: 'The result exactly as printed, not converted.' },
          unit: { type: 'string', description: 'The unit exactly as printed. Empty string if none.' },
          printedText: { type: 'string', description: 'The full row as printed, for verification.' },
          refLow: { type: ['number', 'null'], description: 'Lower bound of the reference interval printed on the report.' },
          refHigh: { type: ['number', 'null'], description: 'Upper bound of the reference interval printed on the report.' },
          confidence: { type: 'number', description: '0 to 1. Lower this where the print is unclear.' },
        },
      },
    },
    differentialPercentages: {
      type: 'array',
      description: 'White cell differentials printed only as percentages.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'percent'],
        properties: {
          key: { type: 'string', enum: ['neut', 'lymph', 'mono', 'eos', 'baso'] },
          percent: { type: 'number' },
        },
      },
    },
    unreadable: {
      type: 'array',
      description: 'Parameters visibly present but not legible enough to report.',
      items: { type: 'string' },
    },
  },
};

const SYSTEM = `You transcribe diagnostic laboratory reports. You are a careful transcriber, not a clinician.

Rules:
- Report only what is printed. Never infer, complete or correct a value.
- Copy the value and unit exactly as printed. Do not convert units.
- Where the report prints a reference interval for a row, record its bounds.
- A white cell differential printed as a percentage goes in differentialPercentages, never in values as though it were an absolute count.
- If a parameter is present but you cannot read it confidently, list its name in unreadable rather than guessing.
- Lower the confidence for any row where the print is faint, obscured or ambiguous.
- Ignore patient identifiers entirely; they are not requested and may have been removed.`;

const MODEL_PREFERENCE = [process.env.OPENAI_MODEL, 'gpt-5', 'gpt-4o'].filter(Boolean);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    // Capability probe, so the interface can tell whether assisted extraction
    // is configured without attempting a request.
    return res.status(200).json({
      available: Boolean(process.env.OPENAI_API_KEY),
      requiresToken: Boolean(process.env.AI_APP_TOKEN),
    });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'Assisted extraction is not configured on this deployment. Set OPENAI_API_KEY.' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Malformed request body.' }); }
  }
  if (!body || typeof body.image !== 'string') {
    return res.status(400).json({ error: 'An image is required.' });
  }
  if (body.image.length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Image too large. Reduce the resolution and try again.' });
  }
  if (process.env.AI_APP_TOKEN && body.token !== process.env.AI_APP_TOKEN) {
    return res.status(401).json({ error: 'Not authorised.' });
  }

  const context = typeof body.context === 'string' ? body.context.slice(0, 400) : '';

  let lastError = 'No model responded.';
  for (const model of MODEL_PREFERENCE) {
    try {
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Transcribe every numeric result from this diagnostic report.${context ? `\n\nContext supplied by the clinician: ${context}` : ''}`,
                },
                { type: 'image_url', image_url: { url: body.image, detail: 'high' } },
              ],
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'diagnostic_report', strict: true, schema: SCHEMA },
          },
        }),
      });

      if (!upstream.ok) {
        const detail = await upstream.text();
        // An unknown or unavailable model falls through to the next preference.
        if (upstream.status === 404 || /model/i.test(detail)) {
          lastError = `Model ${model} unavailable.`;
          continue;
        }
        return res.status(upstream.status).json({
          error: `The extraction service refused the request (${upstream.status}).`,
          detail: detail.slice(0, 400),
        });
      }

      const data = await upstream.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        lastError = 'The model returned no content.';
        continue;
      }

      let parsed;
      try { parsed = JSON.parse(content); } catch {
        lastError = 'The model returned malformed data.';
        continue;
      }

      return res.status(200).json({
        model,
        values: Array.isArray(parsed.values) ? parsed.values : [],
        differentialPercentages: Array.isArray(parsed.differentialPercentages) ? parsed.differentialPercentages : [],
        unreadable: Array.isArray(parsed.unreadable) ? parsed.unreadable : [],
        usage: data.usage ?? null,
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return res.status(502).json({ error: `Assisted extraction failed: ${lastError}` });
}

export const config = { api: { bodyParser: { sizeLimit: '13mb' } } };
