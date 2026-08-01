/**
 * Demonstration reports.
 *
 * Fictitious data used to exercise the full pipeline without a real patient
 * document. These are fed through the identical ingestion path as a scanned
 * report — classification, parsing, analysis — so what is demonstrated is the
 * real engine, not a mock-up.
 */

export interface SampleReport {
  fileName: string;
  label: string;
  text: string;
}

export const SAMPLE_REPORTS: SampleReport[] = [
  {
    fileName: 'demo-fbc.txt',
    label: 'Full Blood Count',
    text: `CITY GENERAL HOSPITAL — DEPARTMENT OF HAEMATOLOGY
FULL BLOOD COUNT
Patient Name: DEMONSTRATION, PATIENT     Hospital No: DEMO-0001
Age: 68        Sex: M                    Collected: 01/08/2026 08:15
Ward: Ward 12 Acute Medicine             Consultant: Dr A Reynolds

Test                          Result      Unit           Reference
Haemoglobin                   7.4         g/dL           13.0 - 17.0    L
Packed Cell Volume            23.1        %              40 - 52        L
Red Blood Cell Count          2.71        x10^12/L       4.5 - 6.5      L
Mean Cell Volume              72.4        fL             80 - 100       L
Mean Cell Haemoglobin         24.1        pg             27 - 32        L
MCHC                          31.2        g/dL           32 - 36        L
Red Cell Distribution Width   18.6        %              11.5 - 14.5    H
White Blood Cell Count        18.9        x10^9/L        4.0 - 11.0     H
Neutrophils                   16.2        x10^9/L        2.0 - 7.5      H
Lymphocytes                   1.4         x10^9/L        1.0 - 4.0
Monocytes                     0.9         x10^9/L        0.2 - 0.8      H
Eosinophils                   0.05        x10^9/L        0.04 - 0.40
Basophils                     0.02        x10^9/L        0.0 - 0.1
Platelet Count                612         x10^9/L        150 - 400      H
Immature Granulocytes         1.8         %              0 - 0.5        H
Reticulocyte Count            1.1         %              0.5 - 2.5
`,
  },
  {
    fileName: 'demo-renal-electrolytes.txt',
    label: 'Renal profile, electrolytes and inflammatory markers',
    text: `CITY GENERAL HOSPITAL — CLINICAL BIOCHEMISTRY
UREA AND ELECTROLYTES / RENAL PROFILE
Hospital No: DEMO-0001                   Collected: 01/08/2026 08:15

Sodium                  129     mmol/L    (135 - 145)
Potassium               6.4     mmol/L    (3.5 - 5.0)
Chloride                101     mmol/L    (98 - 107)
Bicarbonate             15      mmol/L    (22 - 29)
Urea                    28.4    mmol/L    (2.5 - 7.8)
Creatinine              342     umol/L    (60 - 110)
eGFR                    14      mL/min/1.73m2
Total Calcium           2.05    mmol/L    (2.20 - 2.60)
Magnesium               0.58    mmol/L    (0.70 - 1.00)
Phosphate               2.10    mmol/L    (0.80 - 1.45)
Albumin                 26      g/L       (35 - 50)
Random Blood Glucose    9.8     mmol/L    (3.9 - 7.8)

INFLAMMATORY MARKERS
C-Reactive Protein      214     mg/L      (< 5)
Procalcitonin           4.80    ng/mL     (< 0.5)
Ferritin                640     ug/L      (30 - 400)
`,
  },
  {
    fileName: 'demo-coagulation.txt',
    label: 'Coagulation screen',
    text: `CITY GENERAL HOSPITAL — HAEMOSTASIS LABORATORY
COAGULATION SCREEN
Hospital No: DEMO-0001                   Collected: 01/08/2026 08:20

Prothrombin Time         22.4    s        (11 - 14)
INR                      1.9
Activated Partial Thromboplastin Time   52.3   s   (25 - 35)
Thrombin Time            21.5    s        (14 - 19)
Fibrinogen               0.9     g/L      (2.0 - 4.0)
D-Dimer                  8.4     mg/L FEU (< 0.5)
`,
  },
  {
    fileName: 'demo-abg.txt',
    label: 'Arterial blood gas',
    text: `CITY GENERAL HOSPITAL — ARTERIAL BLOOD GAS
Hospital No: DEMO-0001            Sample: Arterial, FiO2 28%    01/08/2026 08:30

pH             7.24        (7.35 - 7.45)
pCO2           4.1  kPa    (4.7 - 6.0)
pO2            9.2  kPa    (10.6 - 13.3)
HCO3           15.0 mmol/L (22 - 29)
Base Excess    -11.4 mmol/L (-2 - +2)
Lactate        4.6  mmol/L (0.5 - 2.0)
Oxygen Saturation  93 %
FiO2           28 %
`,
  },
  {
    fileName: 'demo-ecg.txt',
    label: '12-lead ECG report',
    text: `CITY GENERAL HOSPITAL — 12-LEAD ELECTROCARDIOGRAM
Hospital No: DEMO-0001                   Recorded: 01/08/2026 08:40
Speed 25 mm/s    Gain 10 mm/mV

Vent. rate            108 BPM
PR interval           218 ms
QRS duration          142 ms
QT/QTc                442/512 ms
P-R-T axes            58  -46  120

Interpretation:
Sinus tachycardia
Peaked T waves - consider hyperkalaemia
Nonspecific intraventricular conduction delay
Prolonged QT interval
Left anterior fascicular block
Abnormal ECG — unconfirmed
`,
  },
  {
    fileName: 'demo-wound-mcs.txt',
    label: 'Wound swab microscopy, culture and sensitivity',
    text: `CITY GENERAL HOSPITAL — DEPARTMENT OF MEDICAL MICROBIOLOGY
WOUND SWAB — MICROSCOPY, CULTURE AND SENSITIVITY
Hospital No: DEMO-0001
Specimen: Wound swab, left lower limb ulcer
Collected: 01/08/2026

Microscopy: Numerous pus cells seen. Epithelial cells scanty.
Gram stain: Gram positive cocci in clusters seen

Culture: Heavy growth of Staphylococcus aureus (MRSA)

Sensitivity:
Flucloxacillin          R
Co-amoxiclav            R
Erythromycin            R
Clarithromycin          R
Ciprofloxacin           R
Gentamicin              S
Vancomycin              S
Teicoplanin             S
Linezolid               S
Daptomycin              S
Doxycycline             S
Trimethoprim            S
Rifampicin              S

Comment: MRSA isolated. Please observe contact precautions and inform
infection prevention and control.
`,
  },
  {
    fileName: 'demo-urinalysis.txt',
    label: 'Urinalysis',
    text: `CITY GENERAL HOSPITAL — URINALYSIS (DIPSTICK AND MICROSCOPY)
Hospital No: DEMO-0001                   Collected: 01/08/2026 09:00

Specific Gravity     1.026
Urine pH             5.5
Protein              ++
Blood                +
Leucocytes           +++
Nitrite              Positive
Glucose              +
Ketones              Trace
Bilirubin            Negative
Urobilinogen         Negative

Microscopy: Granular casts seen. Numerous pus cells. Red cells 10-20 per high power field.
`,
  },
];

/** Build File objects so the demonstration goes through the real ingestion path. */
export function sampleFiles(): File[] {
  return SAMPLE_REPORTS.map(
    (r) => new File([r.text], r.fileName, { type: 'text/plain', lastModified: Date.now() }),
  );
}

/**
 * A synthetic 12-lead ECG rendered onto standard ruled paper, matching the
 * demonstration patient: broad QRS, prolonged QT and tall peaked T waves in the
 * context of hyperkalaemia. Supplied as an image so that the demonstration
 * exercises the real digitisation and signal-analysis path rather than the
 * statement parser.
 */
export async function sampleEcgImageFile(): Promise<File> {
  const { renderSyntheticEcg, encodePng } = await import('../ecg/synth');
  const { pixels, width, height } = renderSyntheticEcg({
    heartRateBpm: 108,
    prMs: 218,
    qrsMs: 142,
    qtMs: 400,
    axisDeg: -46,
    tGain: 2.6,
    pxPerMm: 6,
    durationSec: 10,
    seed: 20260801,
  });
  const png = encodePng(pixels, width, height);
  return new File([png as unknown as BlobPart], 'demo-ecg-tracing.png', { type: 'image/png' });
}
