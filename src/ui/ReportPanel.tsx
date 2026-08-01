import { useMemo, useRef, useState } from 'react';
import { Card, Field, Toggle } from './common';
import { buildReportBody, buildStandaloneHtml, REPORT_CSS } from '../report/reportHtml';
import { buildPdf, pdfFilename } from '../report/exportPdf';
import { archiveFilename, decryptSnapshot, downloadBlob, encryptSnapshot } from '../store/archive';
import type { InstitutionConfig } from '../config/institution';
import type { SessionApi } from '../store/session';
import { CaseLibrary } from './CaseLibrary';

export function ReportPanel({ session, institution }: { session: SessionApi; institution: InstitutionConfig }) {
  const { analysis, extraction, patient } = session;
  const [notes, setNotes] = useState('');
  const [includeRaw, setIncludeRaw] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const options = useMemo(
    () => ({ institution, clinicianNotes: notes, includeRawText: includeRaw, micro: extraction.micro }),
    [institution, notes, includeRaw, extraction.micro],
  );

  const bodyHtml = useMemo(() => buildReportBody(analysis, options), [analysis, options]);

  const hasData = analysis.modules.some((m) => m.present);

  const say = (kind: 'ok' | 'err', text: string) => {
    setStatus({ kind, text });
    setTimeout(() => setStatus(null), 7000);
  };

  const exportPdf = () => {
    try {
      const blob = buildPdf(analysis, options);
      downloadBlob(blob, pdfFilename(patient.hospitalNumber, patient.name));
      say('ok', 'PDF report saved.');
    } catch (e) {
      say('err', `PDF export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const exportHtml = () => {
    const html = buildStandaloneHtml(analysis, options);
    const name = pdfFilename(patient.hospitalNumber, patient.name).replace(/\.pdf$/, '.html');
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), name);
    say('ok', 'Self-contained HTML report saved.');
  };

  const saveArchive = async () => {
    if (passphrase.length < 8) return say('err', 'Passphrase must be at least 8 characters.');
    try {
      const blob = await encryptSnapshot(session.snapshot(), passphrase);
      downloadBlob(blob, archiveFilename(patient.hospitalNumber));
      setPassphrase('');
      say('ok', 'Encrypted archive saved (AES-256-GCM). Keep the passphrase safe — it cannot be recovered.');
    } catch (e) {
      say('err', e instanceof Error ? e.message : 'Encryption failed.');
    }
  };

  const openArchive = async (file: File) => {
    if (!passphrase) return say('err', 'Enter the archive passphrase first.');
    try {
      const snap = await decryptSnapshot(file, passphrase);
      session.restore(snap);
      setPassphrase('');
      say('ok', `Archive restored (saved ${new Date(snap.savedAt).toLocaleString()}).`);
    } catch (e) {
      say('err', e instanceof Error ? e.message : 'Decryption failed.');
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <Card
        title="Comprehensive clinical report"
        actions={
          <>
            <button className="btn" onClick={() => window.print()} disabled={!hasData}>Print / A4</button>
            <button className="btn" onClick={exportHtml} disabled={!hasData}>Export HTML</button>
            <button className="btn primary" onClick={exportPdf} disabled={!hasData}>Export PDF</button>
          </>
        }
      >
        {!hasData && (
          <p className="muted" style={{ marginTop: 0 }}>
            The report populates once investigations have been scanned or entered. Exports are disabled until then.
          </p>
        )}
        <div className="grid two" style={{ marginBottom: 14 }}>
          <Field label="Clinician notes" hint="Included in the report above the signature block">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Free-text notes for inclusion in the printed report…" />
          </Field>
          <div>
            <Toggle label="Include appendix of original extracted OCR text" checked={includeRaw} onChange={setIncludeRaw} />
            <p className="small faint" style={{ marginTop: 8 }}>
              The report always shows the original OCR value alongside the validated value for every analyte. This
              option additionally appends the full verbatim text of every source document.
            </p>
          </div>
        </div>

        {status && (
          <div className="disclaimer" style={{ borderColor: status.kind === 'ok' ? 'rgba(61,220,151,.4)' : 'rgba(255,91,91,.45)', background: status.kind === 'ok' ? 'rgba(61,220,151,.07)' : 'rgba(255,91,91,.07)', color: status.kind === 'ok' ? 'var(--normal)' : 'var(--critical)', marginBottom: 12 }}>
            {status.text}
          </div>
        )}

        <div className="report-preview" id="report-print-root">
          <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />
          <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        </div>
      </Card>

      <CaseLibrary session={session} />

      <Card title="Encrypted offline archive" id="archive">
        <p className="small muted" style={{ marginTop: 0 }}>
          The session is never written to browser storage. To keep it, save an encrypted archive file: the data is
          compressed and encrypted with AES-256-GCM under a key derived from your passphrase using PBKDF2-SHA256
          (310,000 iterations). The passphrase is never stored and cannot be recovered — if it is lost, the archive
          cannot be opened.
        </p>
        <div className="btn-row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Field label="Archive passphrase" hint="Minimum 8 characters">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Passphrase"
                autoComplete="new-password"
                style={{ fontFamily: 'var(--mono)' }}
              />
            </Field>
          </div>
          <button className="btn primary" onClick={() => void saveArchive()} disabled={passphrase.length < 8}>Save encrypted archive</button>
          <button className="btn" onClick={() => importRef.current?.click()} disabled={!passphrase}>Open archive…</button>
          <input
            ref={importRef}
            type="file"
            accept=".enc,application/octet-stream"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void openArchive(f); e.target.value = ''; }}
          />
        </div>
      </Card>
    </div>
  );
}
