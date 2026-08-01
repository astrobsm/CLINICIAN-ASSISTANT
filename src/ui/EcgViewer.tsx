import { useEffect, useMemo, useRef, useState } from 'react';
import type { WaveformAnalysis } from '../ecg/types';
import { Field } from './common';

/**
 * Renders the signal the digitiser actually recovered, with the fiducial
 * points the measurements were taken from.
 *
 * This is a safety control rather than a decoration: every number in the ECG
 * section derives from this signal, and the only way a clinician can judge
 * whether to trust those numbers is to see whether the recovered trace matches
 * the paper in front of them and whether the onsets and offsets landed in the
 * right places.
 */
export function EcgViewer({ waveform }: { waveform: WaveformAnalysis }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [gain, setGain] = useState(1);
  const [speed, setSpeed] = useState(25);
  const [showFiducials, setShowFiducials] = useState(true);
  const [width, setWidth] = useState(1000);

  const [showAll, setShowAll] = useState(false);

  const allLeads = useMemo(
    () => [...waveform.digitised.leads].sort((a, b) => {
      const order = ['rhythm', 'I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
      return order.indexOf(a.lead) - order.indexOf(b.lead);
    }),
    [waveform],
  );

  // Thirteen stacked panels is more than fits on a screen at a legible scale,
  // so a representative selection is shown by default: the rhythm strip plus
  // one lead from each territory.
  const SUMMARY = ['rhythm', 'II', 'I', 'aVF', 'V1', 'V5'];
  const leads = useMemo(
    () => (showAll ? allLeads : allLeads.filter((l) => SUMMARY.includes(l.lead))),
    [allLeads, showAll],
  );

  // The beats were delineated on the longest continuous panel; markers are
  // only meaningful on that lead's timebase.
  const markerLead = useMemo(
    () => leads.reduce((a, b) => (b.samples.length > a.samples.length ? b : a), leads[0]),
    [leads],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !leads.length) return;

    const fs = waveform.digitised.fs;
    // Each panel covers its own slice of the recording, so the timeline runs
    // to the end of the latest one. Drawing every panel flush left would
    // misrepresent when each lead was actually recorded.
    const durationSec = Math.max(...leads.map((l) => l.startSec + l.samples.length / fs));

    // Clamped so a short panel cannot blow the display up to thousands of
    // pixels, and a long one stays legible.
    const pxPerMm = Math.min(6, Math.max(1.3, (width - 44) / (durationSec * speed)));
    const rowMm = 20;
    const rowPx = rowMm * pxPerMm;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const left = 40;
    // Draw only as wide as there is signal, so a short panel does not leave
    // three quarters of the canvas as empty grid.
    const contentWidth = Math.min(width, left + durationSec * speed * pxPerMm + 8);

    const height = Math.round(rowPx * leads.length + 16);
    canvas.width = Math.round(contentWidth * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${contentWidth}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0f18';
    ctx.fillRect(0, 0, contentWidth, height);

    // Millimetre grid, at the same scale the measurements were made in.
    const drawGrid = () => {
      for (let mm = 0; left + mm * pxPerMm < contentWidth; mm++) {
        const x = left + mm * pxPerMm;
        ctx.strokeStyle = mm % 5 === 0 ? 'rgba(255,90,90,0.22)' : 'rgba(255,90,90,0.09)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();
      }
      for (let mm = 0; mm * pxPerMm < height; mm++) {
        const y = mm * pxPerMm;
        ctx.strokeStyle = mm % 5 === 0 ? 'rgba(255,90,90,0.22)' : 'rgba(255,90,90,0.09)';
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(contentWidth, y + 0.5);
        ctx.stroke();
      }
    };
    drawGrid();

    const mmPerMv = 10 * gain;

    leads.forEach((lead, i) => {
      const baseline = rowPx * i + rowPx / 2 + 8;

      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.moveTo(left, baseline + 0.5);
      ctx.lineTo(contentWidth, baseline + 0.5);
      ctx.stroke();

      ctx.fillStyle = '#4fd2ff';
      ctx.font = '600 11px "Segoe UI", sans-serif';
      ctx.fillText(lead.lead === 'rhythm' ? 'Rhythm' : lead.lead, 6, baseline + 4);

      const offsetPx = lead.startSec * speed * pxPerMm;

      ctx.strokeStyle = lead.coverage < 0.7 ? '#ffd166' : '#e8f1fb';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (let n = 0; n < lead.samples.length; n++) {
        const x = left + offsetPx + (n / fs) * speed * pxPerMm;
        if (x > contentWidth) break;
        const y = baseline - lead.samples[n] * mmPerMv * pxPerMm;
        if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (showFiducials && lead.lead === markerLead.lead) {
        for (const b of waveform.beats) {
          const xAt = (idx: number) => left + offsetPx + (idx / fs) * speed * pxPerMm;
          const top = baseline - rowPx * 0.42;
          const bottom = baseline + rowPx * 0.42;

          const tick = (idx: number | null, colour: string, dash: number[]) => {
            if (idx === null) return;
            const x = xAt(idx);
            if (x > contentWidth) return;
            ctx.strokeStyle = colour;
            ctx.lineWidth = 1;
            ctx.setLineDash(dash);
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.stroke();
            ctx.setLineDash([]);
          };

          tick(b.pOnset, 'rgba(143,211,255,0.75)', [2, 3]);
          tick(b.qrsOnset, 'rgba(61,220,151,0.9)', []);
          tick(b.qrsOffset, 'rgba(255,159,67,0.9)', []);
          tick(b.tOffset, 'rgba(255,45,111,0.75)', [2, 3]);

          const rx = xAt(b.rIndex);
          if (rx <= contentWidth) {
            ctx.fillStyle = '#3ddc97';
            ctx.beginPath();
            ctx.arc(rx, baseline - (lead.samples[b.rIndex] ?? 0) * mmPerMv * pxPerMm, 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    });
  }, [leads, width, gain, speed, showFiducials, waveform, markerLead]);

  const d = waveform.digitised;

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 10, alignItems: 'flex-end' }}>
        <div style={{ width: 150 }}>
          <Field label={`Gain ×${gain}`}>
            <input type="range" min={0.25} max={4} step={0.25} value={gain} onChange={(e) => setGain(parseFloat(e.target.value))} />
          </Field>
        </div>
        <div style={{ width: 150 }}>
          <Field label={`Sweep ${speed} mm/s`}>
            <input type="range" min={12.5} max={50} step={12.5} value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} />
          </Field>
        </div>
        <label className={`check${showFiducials ? ' on' : ''}`}>
          <input type="checkbox" checked={showFiducials} onChange={(e) => setShowFiducials(e.target.checked)} />
          <span>Show measurement points</span>
        </label>
        <label className={`check${showAll ? ' on' : ''}`}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span>All {allLeads.length} leads</span>
        </label>
        <span className="chip accent">Digitisation quality {Math.round(d.quality.score * 100)}%</span>
        <span className="chip">{d.layout}</span>
        <span className="chip">{d.pxPerMm.toFixed(1)} px/mm</span>
      </div>

      <div
        ref={wrapRef}
        style={{ border: '1px solid var(--line)', borderRadius: 8, overflowX: 'hidden', overflowY: 'auto', maxHeight: 560, background: '#0a0f18' }}
      >
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>

      <div className="small faint" style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span><span style={{ color: '#3ddc97' }}>▮</span> QRS onset / R peak</span>
        <span><span style={{ color: '#ff9f43' }}>▮</span> QRS offset (J point)</span>
        <span><span style={{ color: '#8fd3ff' }}>▮</span> P onset</span>
        <span><span style={{ color: '#ff2d6f' }}>▮</span> T offset</span>
        <span>Markers shown on {markerLead?.lead === 'rhythm' ? 'the rhythm strip' : `lead ${markerLead?.lead}`} only — other panels cover a different time window.</span>
      </div>

      <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
        This is the signal recovered from the image, not the original tracing. Compare it against the paper before
        relying on any measurement derived from it.
        {d.quality.warnings.length > 0 && ` ${d.quality.warnings.join(' ')}`}
      </p>
    </div>
  );
}
