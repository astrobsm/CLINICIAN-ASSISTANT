/**
 * Closed-loop verification of the ECG waveform pipeline.
 *
 * Renders synthetic ECGs whose parameters are known exactly, digitises them
 * back from the pixels, and checks that the recovered rate, intervals, axis,
 * ST deviation and rhythm match. Anything the digitiser cannot recover to a
 * clinically meaningful tolerance is a defect, not a rounding difference.
 */
import { analyseWaveform, WaveformError } from '../src/ecg/analyseWaveform';
import { renderSyntheticEcg, type SynthOptions } from '../src/ecg/synth';
import type { LeadName } from '../src/ecg/types';

let failures = 0;
let checks = 0;

const line = (c = '─', n = 78) => console.log(c.repeat(n));

function check(label: string, ok: boolean, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

function near(label: string, got: number | null, want: number, tol: number, unit = '') {
  const ok = got !== null && Math.abs(got - want) <= tol;
  check(label, ok, `expected ${want}${unit} ±${tol}, got ${got === null ? 'null' : `${Math.round(got * 10) / 10}${unit}`}`);
}

function run(name: string, opts: Partial<SynthOptions>, assertions: (a: ReturnType<typeof analyseWaveform>, truth: ReturnType<typeof renderSyntheticEcg>['truth']) => void) {
  console.log(`\n▸ ${name}`);
  const { pixels, width, height, truth } = renderSyntheticEcg(opts);
  console.log(`   rendered ${width}×${height} px at ${truth.pxPerMm} px/mm`);
  try {
    const t0 = Date.now();
    const analysis = analyseWaveform(pixels, width, height, {
      sex: (opts as { sex?: 'male' | 'female' }).sex ?? 'male',
      age: 60,
    });
    const ms = Date.now() - t0;
    const d = analysis.digitised;
    console.log(`   digitised in ${ms} ms: ${d.leads.length} leads, layout "${d.layout}", grid ${d.pxPerMm.toFixed(2)} px/mm, quality ${(d.quality.score * 100).toFixed(0)}%`);
    console.log(`   rhythm: ${analysis.rhythm.label}`);
    const m = analysis.measurements;
    console.log(`   measured: HR ${m.heartRateBpm} · PR ${m.prMs} · QRS ${m.qrsMs} · QT ${m.qtMs} · QTc ${m.qtcBazettMs} · axis ${m.axisDeg}°`);
    if (analysis.features.length) console.log(`   features: ${analysis.features.join(', ')}`);
    assertions(analysis, truth);
  } catch (e) {
    failures++;
    checks++;
    if (e instanceof WaveformError) {
      console.log(`   ✗ digitisation failed: ${e.message}`);
      for (const w of e.quality.warnings) console.log(`     · ${w}`);
    } else {
      console.log(`   ✗ threw: ${e instanceof Error ? `${e.message}\n${e.stack}` : String(e)}`);
    }
  }
}

line('═');
console.log('  ECG WAVEFORM PIPELINE — CLOSED-LOOP VERIFICATION');
line('═');

// ── 1. Normal sinus rhythm, standard parameters ──────────────────────
run('Normal sinus rhythm, 72 bpm, axis +45°', {
  heartRateBpm: 72, prMs: 160, qrsMs: 92, qtMs: 380, axisDeg: 45, pxPerMm: 6,
}, (a, t) => {
  check('grid scale recovered', Math.abs(a.digitised.pxPerMm - t.pxPerMm) < 0.35, `${a.digitised.pxPerMm.toFixed(2)} vs ${t.pxPerMm}`);
  check('12 leads recovered', a.digitised.leads.filter((l) => l.lead !== 'rhythm').length >= 12, `${a.digitised.leads.length} panels`);
  near('heart rate', a.measurements.heartRateBpm, t.heartRateBpm, 4, ' bpm');
  near('PR interval', a.measurements.prMs, t.prMs, 22, ' ms');
  near('QRS duration', a.measurements.qrsMs, t.qrsMs, 22, ' ms');
  near('QT interval', a.measurements.qtMs, t.qtMs, 32, ' ms');
  near('QTc (Bazett)', a.measurements.qtcBazettMs, t.qtcMs, 35, ' ms');
  near('cardiac axis', a.measurements.axisDeg, t.axisDeg, 15, '°');
  check('rhythm classified as sinus', /sinus/i.test(a.rhythm.label), a.rhythm.label);
  check('P waves detected', a.measurements.pWavePresent);
  check('no ischaemic features raised', !a.features.includes('stElevation') && !a.features.includes('stDepression'), a.features.join(',') || 'none');
  check('quality score above 0.5', a.digitised.quality.score > 0.5, a.digitised.quality.score.toFixed(2));
});

// ── 2. Bradycardia with first degree block and left axis ─────────────
run('Sinus bradycardia 48 bpm, PR 260 ms, axis −40°', {
  heartRateBpm: 48, prMs: 260, qrsMs: 96, qtMs: 440, axisDeg: -40, pxPerMm: 6,
}, (a, t) => {
  near('heart rate', a.measurements.heartRateBpm, t.heartRateBpm, 4, ' bpm');
  near('PR interval', a.measurements.prMs, t.prMs, 25, ' ms');
  near('cardiac axis', a.measurements.axisDeg, t.axisDeg, 18, '°');
  check('sinus bradycardia identified', /bradycardia/i.test(a.rhythm.label), a.rhythm.label);
  check('first degree AV block flagged', a.rhythm.avBlock?.includes('First degree') === true, a.rhythm.avBlock ?? 'none');
});

// ── 3. Tachycardia ───────────────────────────────────────────────────
run('Sinus tachycardia 124 bpm', {
  heartRateBpm: 124, prMs: 140, qrsMs: 88, qtMs: 300, axisDeg: 60, pxPerMm: 6,
}, (a, t) => {
  near('heart rate', a.measurements.heartRateBpm, t.heartRateBpm, 6, ' bpm');
  check('sinus tachycardia identified', /tachycardia/i.test(a.rhythm.label), a.rhythm.label);
  near('QRS duration', a.measurements.qrsMs, t.qrsMs, 22, ' ms');
});

// ── 4. Inferior ST elevation ─────────────────────────────────────────
run('Inferior ST elevation (II, III, aVF +0.3 mV)', {
  heartRateBpm: 78, prMs: 160, qrsMs: 94, qtMs: 370, axisDeg: 60, pxPerMm: 6,
  stMv: { II: 0.3, III: 0.32, aVF: 0.3, I: -0.12, aVL: -0.14 },
}, (a) => {
  const st = (l: LeadName) => a.measurements.st.find((s) => s.lead === l)?.jMv ?? null;
  near('ST at J in lead II', st('II'), 0.3, 0.09, ' mV');
  near('ST at J in lead III', st('III'), 0.32, 0.09, ' mV');
  near('ST at J in aVF', st('aVF'), 0.3, 0.09, ' mV');
  near('ST at J in lead I (reciprocal)', st('I'), -0.12, 0.09, ' mV');
  check('ST elevation feature raised', a.features.includes('stElevation'), a.features.join(','));
  check('inferior territory named', a.statements.some((s) => /inferior/i.test(s)), a.statements.find((s) => /territory|ST elevation/i.test(s)) ?? '');
  check('reciprocal depression detected', a.features.includes('stDepression'), a.features.join(','));
});

// ── 5. Anterior ST elevation with the V2–V3 threshold ────────────────
run('Anterior ST elevation (V2–V4 +0.35 mV)', {
  heartRateBpm: 88, prMs: 150, qrsMs: 96, qtMs: 360, axisDeg: 40, pxPerMm: 6,
  stMv: { V2: 0.35, V3: 0.38, V4: 0.3 },
}, (a) => {
  check('ST elevation feature raised', a.features.includes('stElevation'), a.features.join(','));
  check('anteroseptal territory named', a.statements.some((s) => /anteroseptal/i.test(s)));
});

// ── 6. Broad QRS ─────────────────────────────────────────────────────
run('Broad QRS 150 ms', {
  heartRateBpm: 70, prMs: 170, qrsMs: 150, qtMs: 440, axisDeg: -20, pxPerMm: 7,
}, (a, t) => {
  near('QRS duration', a.measurements.qrsMs, t.qrsMs, 26, ' ms');
  check('conduction delay reported', a.statements.some((s) => /conduction delay|bundle branch/i.test(s)), a.statements.join(' | ').slice(0, 120));
});

// ── 7. Prolonged QT ──────────────────────────────────────────────────
run('Prolonged QT (QTc ≈ 520 ms)', {
  heartRateBpm: 68, prMs: 160, qrsMs: 92, qtMs: 545, axisDeg: 50, pxPerMm: 7,
}, (a, t) => {
  near('QT interval', a.measurements.qtMs, t.qtMs, 40, ' ms');
  near('QTc (Bazett)', a.measurements.qtcBazettMs, t.qtcMs, 45, ' ms');
  check('long QT feature raised', a.features.includes('longQt'), a.features.join(','));
});

// ── 8. Atrial fibrillation ───────────────────────────────────────────
run('Atrial fibrillation — no P waves, irregular RR', {
  heartRateBpm: 96, prMs: 160, qrsMs: 90, qtMs: 340, axisDeg: 45, pxPerMm: 6,
  pAmplitudeMv: 0, rrJitter: 0.22, seed: 777,
}, (a) => {
  check('atrial fibrillation identified', /fibrillation/i.test(a.rhythm.label), a.rhythm.label);
  check('rhythm reported as irregular', a.rhythm.regular === false);
  check('P waves reported absent', !a.measurements.pWavePresent);
  check('af feature raised', a.features.includes('af'), a.features.join(','));
});

// ── 9. Left ventricular hypertrophy voltages ─────────────────────────
run('Left ventricular hypertrophy voltages', {
  heartRateBpm: 74, prMs: 165, qrsMs: 100, qtMs: 390, axisDeg: -15, pxPerMm: 6,
  precordialGain: 2.1,
}, (a) => {
  check('LVH voltage criteria met', a.features.includes('lvh'), a.features.join(','));
  check('criterion named in statement', a.statements.some((s) => /Sokolow|Cornell/i.test(s)), a.statements.find((s) => /hypertroph/i.test(s)) ?? '');
});

// ── 10. T wave inversion ─────────────────────────────────────────────
run('Lateral T wave inversion', {
  heartRateBpm: 76, prMs: 158, qrsMs: 92, qtMs: 380, axisDeg: 30, pxPerMm: 6,
  tInverted: ['I', 'aVL', 'V5', 'V6'],
}, (a) => {
  check('T inversion feature raised', a.features.includes('tInversion'), a.features.join(','));
  check('lateral territory named', a.statements.some((s) => /lateral/i.test(s)));
});

// ── 11. Rhythm strip only ────────────────────────────────────────────
run('Single rhythm strip (no 12-lead layout)', {
  heartRateBpm: 58, prMs: 170, qrsMs: 94, qtMs: 420, axisDeg: 45, pxPerMm: 7,
  layout: 'rhythm', durationSec: 10,
}, (a, t) => {
  near('heart rate', a.measurements.heartRateBpm, t.heartRateBpm, 4, ' bpm');
  check('rhythm still classified', a.rhythm.label.length > 0 && !/could not/i.test(a.rhythm.label), a.rhythm.label);
  check('12-lead criteria suppressed', !a.features.includes('lvh') && !a.features.includes('lbbb'), a.features.join(','));
  check('single-lead limitation warned', a.quality.warnings.some((w) => /leads were recovered|12-lead/i.test(w)), a.quality.warnings.join(' | '));
});

// ── 12. Noisy, low-resolution scan ───────────────────────────────────
run('Noisy low-resolution scan (4 px/mm, 40 µV noise)', {
  heartRateBpm: 82, prMs: 158, qrsMs: 96, qtMs: 370, axisDeg: 45,
  pxPerMm: 4, noiseMv: 0.04, seed: 4242,
}, (a, t) => {
  near('heart rate survives noise', a.measurements.heartRateBpm, t.heartRateBpm, 6, ' bpm');
  near('QRS duration survives noise', a.measurements.qrsMs, t.qrsMs, 30, ' ms');
  check('quality score reflects the poorer scan', a.digitised.quality.score < 0.85, a.digitised.quality.score.toFixed(2));
});

// ── 13. Half gain (5 mm/mV) must be detected and corrected ───────────
run('Half-gain recording (5 mm/mV calibration pulse)', {
  heartRateBpm: 75, prMs: 160, qrsMs: 92, qtMs: 380, axisDeg: 45, pxPerMm: 7,
  mmPerMv: 5,
}, (a) => {
  check('gain reinterpreted from the calibration pulse', a.digitised.mmPerMv === 5, `${a.digitised.mmPerMv} mm/mV`);
  const v5 = a.measurements.amplitudes.find((x) => x.lead === 'V5');
  check('V5 R wave amplitude plausible after rescaling', !!v5 && v5.rMv > 0.6 && v5.rMv < 2.2, `${v5?.rMv.toFixed(2)} mV`);
  check('LVH not falsely triggered by gain error', !a.features.includes('lvh'), a.features.join(','));
});

// ── 14. Refuses to guess when there is no grid ───────────────────────
console.log('\n▸ No grid present — must refuse rather than guess');
{
  const { pixels, width, height } = renderSyntheticEcg({ pxPerMm: 6 });
  // Erase the grid by whitening every reddish pixel.
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (r - Math.max(g, b) > 10) { pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; }
  }
  try {
    analyseWaveform(pixels, width, height, { sex: 'male', age: 60 });
    check('refuses to analyse without a scale reference', false, 'analysis returned a result');
  } catch (e) {
    check('refuses to analyse without a scale reference', e instanceof WaveformError, e instanceof Error ? e.message : String(e));
  }
}

line('═');
if (failures) {
  console.log(`  RESULT: ${failures} of ${checks} CHECKS FAILED`);
  process.exitCode = 1;
} else {
  console.log(`  RESULT: ALL ${checks} CHECKS PASSED`);
}
line('═');
