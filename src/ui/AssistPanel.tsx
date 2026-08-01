import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from './common';
import {
  checkAvailability,
  extractFromImage,
  hasConsented,
  isEnabled,
  recordConsent,
  setEnabled,
  toAnalytes,
  type AiAvailability,
} from '../ai/client';
import { redactIdentifiers, toTransmissionDataUrl } from '../ai/redact';
import { loadImage, scaleToCanvas } from '../ocr/preprocess';
import type { SessionApi } from '../store/session';
import type { ScannedDocument } from '../clinical/types';

/**
 * Assisted extraction.
 *
 * Optional, off by default, and never automatic. Everything else in this
 * application runs on the device; this sends an image of the report to a
 * third-party model, and so the interface leads with what leaves, shows the
 * exact image that would be sent, and requires an explicit decision before the
 * first transmission of a session.
 */
export function AssistPanel({ session }: { session: SessionApi }) {
  const [availability, setAvailability] = useState<AiAvailability | null>(null);
  const [enabled, setEnabledState] = useState(isEnabled());
  const [target, setTarget] = useState<ScannedDocument | null>(null);
  const [preview, setPreview] = useState<{ dataUrl: string; redacted: string[]; nothingFound: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const refresh = useCallback(async () => setAvailability(await checkAvailability()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const say = (kind: 'ok' | 'err', text: string) => {
    setNote({ kind, text });
    setTimeout(() => setNote(null), 12000);
  };

  const candidates = session.documents.filter(
    (d) => session.fileFor(d.id) && /^image\//.test(d.mime),
  );

  if (!availability) return null;

  /** Build the redacted image and show it before anything is transmitted. */
  const prepare = async (doc: ScannedDocument) => {
    setBusy(true);
    try {
      const file = session.fileFor(doc.id);
      if (!file) throw new Error('The original image is no longer in this session. Re-scan it to use assisted extraction.');
      const img = await loadImage(file);
      const canvas = scaleToCanvas(img, 1800);
      const result = redactIdentifiers(canvas, doc.words ?? [], session.patient);
      previewRef.current = result.canvas;
      setTarget(doc);
      setPreview({
        dataUrl: result.canvas.toDataURL('image/png'),
        redacted: result.redactedText,
        nothingFound: result.nothingFound,
      });
    } catch (err) {
      say('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!target || !previewRef.current) return;
    setBusy(true);
    try {
      recordConsent(true);
      const dataUrl = toTransmissionDataUrl(previewRef.current);
      const context = [
        session.patient.age !== null ? `age ${session.patient.age}` : '',
        session.patient.sex !== 'unspecified' ? session.patient.sex : '',
      ].filter(Boolean).join(', ');

      const extraction = await extractFromImage(dataUrl, context);
      const { analytes, rejected } = toAnalytes(extraction, session.patient, target.id);

      if (!analytes.length) {
        say('err', `The model read no usable values.${extraction.unreadable.length ? ` It reported these as illegible: ${extraction.unreadable.join(', ')}.` : ''}`);
      } else {
        session.applyAssisted(target.id, analytes, extraction.model);
        say('ok',
          `${analytes.length} value${analytes.length === 1 ? '' : 's'} extracted with ${extraction.model} and added to the review, where every one still needs checking against the report.` +
          (rejected.length ? ` ${rejected.length} implausible reading${rejected.length === 1 ? ' was' : 's were'} discarded.` : '') +
          (extraction.unreadable.length ? ` Reported illegible: ${extraction.unreadable.join(', ')}.` : ''));
      }
      setPreview(null);
      setTarget(null);
    } catch (err) {
      say('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <Card
      title="Assisted extraction (sends data off this device)"
      actions={
        availability.available ? (
          <label className={`check${enabled ? ' on' : ''}`}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => { setEnabled(e.target.checked); setEnabledState(e.target.checked); }}
            />
            <span>Enable</span>
          </label>
        ) : null
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        Everything else in this application runs on this device. This one feature does not: it sends an image of the
        report to a vision model to transcribe values that on-device recognition missed. Identifiers are painted out
        first and you see the exact image before it is sent. Leave it off and nothing is ever transmitted.
      </p>

      {!availability.available && (
        <p className="small faint" style={{ marginBottom: 0 }}>
          Not available here — {availability.reason}
        </p>
      )}

      {availability.available && !enabled && (
        <p className="small faint" style={{ marginBottom: 0 }}>
          Switch on above to use it on a document that scanned poorly.
        </p>
      )}

      {note && (
        <div
          className="disclaimer"
          style={{
            marginTop: 12,
            borderColor: note.kind === 'ok' ? 'rgba(61,220,151,.4)' : 'rgba(255,91,91,.45)',
            background: note.kind === 'ok' ? 'rgba(61,220,151,.07)' : 'rgba(255,91,91,.07)',
            color: note.kind === 'ok' ? 'var(--normal)' : 'var(--critical)',
          }}
        >
          {note.text}
        </div>
      )}

      {availability.available && enabled && !preview && (
        <>
          {candidates.length === 0 ? (
            <p className="small faint" style={{ marginBottom: 0 }}>
              No scanned images in this session. Assisted extraction works on photographs and scans, not on files that
              were already machine-readable.
            </p>
          ) : (
            <div style={{ marginTop: 6 }}>
              {candidates.map((d) => (
                <div className="doc-row" key={d.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="name">{d.fileName}</div>
                    <div className="small muted">
                      {Math.round(d.meanConfidence * 100)}% on-device recognition
                      {d.assistedModel && ` · already extracted with ${d.assistedModel}`}
                    </div>
                  </div>
                  <button className="btn" disabled={busy} onClick={() => void prepare(d)}>
                    Prepare to send…
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {preview && (
        <div style={{ marginTop: 12 }}>
          <div className="disclaimer" style={{ marginBottom: 12 }}>
            <strong>This exact image will be sent to the model.</strong> Check it before continuing — anything still
            legible in it leaves this device.
            {preview.nothingFound && (
              <div style={{ marginTop: 6, color: 'var(--critical)' }}>
                No identifiers were detected to remove. That may be correct, or the header may not have been read.
                Look closely before sending.
              </div>
            )}
            {preview.redacted.length > 0 && (
              <div style={{ marginTop: 6 }}>
                Painted out: {preview.redacted.map((t) => `“${t}”`).join(', ')}
              </div>
            )}
            {!hasConsented() && (
              <div style={{ marginTop: 6 }}>
                This is the first transmission from this browser. Continuing sends the image above to the extraction
                service configured on this deployment, and records that you agreed.
              </div>
            )}
          </div>

          <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'auto', maxHeight: 460, background: '#fff' }}>
            <img src={preview.dataUrl} alt="Image that will be transmitted, with identifiers removed" style={{ display: 'block', width: '100%' }} />
          </div>

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={busy} onClick={() => void send()}>
              {busy ? 'Sending…' : 'Send this image'}
            </button>
            <button className="btn" disabled={busy} onClick={() => { setPreview(null); setTarget(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
