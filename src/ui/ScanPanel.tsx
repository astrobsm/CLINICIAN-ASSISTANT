import { useEffect, useRef, useState } from 'react';
import { Card, Empty } from './common';
import { MODULE_LABEL, type ScannedDocument } from '../clinical/types';
import type { IngestProgress } from '../parse/pipeline';
import { ocrAssetsAvailable } from '../ocr/ocrEngine';
import type { SessionApi } from '../store/session';
import { SAMPLE_REPORTS, sampleEcgImageFile, sampleFiles } from '../demo/sampleReports';
import { AssistPanel } from './AssistPanel';
import { CameraCapture } from './CameraCapture';

const ACCEPT = 'image/*,application/pdf,text/plain,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.txt';

export function ScanPanel({
  documents,
  busy,
  progress,
  addFiles,
  removeDocument,
  session,
}: {
  documents: ScannedDocument[];
  busy: boolean;
  progress: IngestProgress | null;
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeDocument: (id: string) => void;
  session: SessionApi;
}) {
  const [over, setOver] = useState(false);
  const [assets, setAssets] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void ocrAssetsAvailable().then(setAssets); }, []);

  // A live stream needs both the API and a secure context; without either the
  // platform file input is the only route and the button opens that instead.
  const liveCamera =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    (window.isSecureContext || location.hostname === 'localhost');

  return (
    <div className="grid" style={{ gap: 16 }}>
      {camera && (
        <CameraCapture
          onClose={() => setCamera(false)}
          onCapture={(files) => { setCamera(false); void addFiles(files); }}
        />
      )}

      {assets === false && (
        <div className="disclaimer">
          <strong>OCR language data not found.</strong> The recognition engine needs <code>eng.traineddata</code> in
          the <code>public/ocr/</code> folder. Run <code>npm run setup:ocr</code> once with an internet connection, or
          copy the file in manually. PDFs with a digital text layer, and manual entry, still work without it.
        </div>
      )}

      <Card
        title="Scan diagnostic reports"
        actions={
          <>
            <button
              className="btn"
              onClick={() => (liveCamera ? setCamera(true) : cameraRef.current?.click())}
              disabled={busy}
              title={liveCamera ? 'Take several photographs in one session and analyse them together' : 'Take a photograph'}
            >
              Use camera
            </button>
            <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>Choose files</button>
          </>
        }
      >
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />

        <div
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
        >
          <div className="big">Drop laboratory reports, ECGs or culture results here</div>
          <div className="small muted">
            Photographs, scans, PDFs and plain text · multiple files at once · every panel on a page is detected separately
          </div>
          <div className="chips" style={{ justifyContent: 'center', marginTop: 14 }}>
            {['Renal / U&E', 'Electrolytes', 'LFT', 'FBC', 'Coagulation', 'ABG', 'Urinalysis', 'Inflammatory', 'Cardiac', 'ECG', 'Microbiology MCS'].map((x) => (
              <span key={x} className="chip">{x}</span>
            ))}
          </div>
        </div>

        {busy && progress && (
          <div style={{ marginTop: 14 }}>
            <div className="btn-row" style={{ justifyContent: 'space-between' }}>
              <span className="small"><span className="spinner" style={{ marginRight: 8, verticalAlign: -2 }} />{progress.fileName}</span>
              <span className="small muted">{progress.stage}</span>
            </div>
            <div className="progress"><span style={{ width: `${Math.round(progress.progress * 100)}%` }} /></div>
          </div>
        )}

        <p className="small faint" style={{ marginBottom: 0, marginTop: 14 }}>
          Recognition runs in a local WebAssembly worker. Images and text never leave this device, and no network request
          is made at any point during analysis.
        </p>
      </Card>

      <Card
        title="Demonstration data"
        actions={
          <button
            className="btn"
            disabled={busy}
            onClick={async () => { await addFiles([...sampleFiles(), await sampleEcgImageFile()]); }}
          >
            Load demonstration reports
          </button>
        }
      >
        <p className="small muted" style={{ marginTop: 0 }}>
          Loads {SAMPLE_REPORTS.length + 1} fictitious reports through the identical ingestion path as a scanned
          document — classification, parsing, analysis and correlation. The ECG is supplied as a rendered image on
          ruled paper, so it exercises the real digitisation and waveform signal analysis rather than the statement
          parser. Useful for seeing the engine work before you have a real report to hand. The demonstration patient is
          clearly labelled and contains no real data.
        </p>
        <div className="chips">
          {SAMPLE_REPORTS.map((r) => <span key={r.fileName} className="chip">{r.label}</span>)}
          <span className="chip accent">12-lead ECG tracing (image — waveform analysed)</span>
        </div>
      </Card>

      <Card title={`Source documents (${documents.length})`}>
        {documents.length === 0 ? (
          <Empty icon="⌸" title="No documents scanned yet" hint="Add a report above, or go straight to the Review tab to enter values by hand." />
        ) : (
          documents.map((d) => (
            <div key={d.id}>
              <div className="doc-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="name">{d.fileName}</div>
                  <div className="small muted">
                    {d.pageCount} page{d.pageCount === 1 ? '' : 's'} · {Math.round(d.meanConfidence * 100)}% recognition confidence
                    {d.detectedModules.length > 0 && ' · '}
                    {d.detectedModules.filter((m) => m !== 'other').map((m) => MODULE_LABEL[m]).join(', ')}
                  </div>
                  {d.error && <div className="small" style={{ color: 'var(--moderate)', marginTop: 3 }}>{d.error}</div>}
                </div>
                <span className={`chip${d.status === 'done' ? ' accent' : ''}`}>{d.status === 'done' ? 'Processed' : d.status}</span>
                <button className="btn small" onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
                  {expanded === d.id ? 'Hide text' : 'View text'}
                </button>
                <button className="btn small danger" onClick={() => removeDocument(d.id)}>Remove</button>
              </div>
              {expanded === d.id && <pre className="raw-text" style={{ marginBottom: 10 }}>{d.rawText || '(no text extracted)'}</pre>}
            </div>
          ))
        )}
      </Card>
      <AssistPanel session={session} />
    </div>
  );
}
