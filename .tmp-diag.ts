import { parseLabValues, resolvePercentages } from './src/parse/labParser';
import { classifyReport } from './src/parse/classify';
import { emptyPatient } from './src/clinical/types';

const patient = { ...emptyPatient(), sex: 'male' as const, age: 30 };

// How a bordered table like the JENPEEY report actually comes out of OCR.
const LAYOUTS: Record<string, string> = {
  'A: row-major, Investigation column carries FBC': `
Investigation Parameters Result Unit Normal Range
FBC WBC 4.42 10/9 (4.5- 17.0)
NEUTROPHILS 68.6 % (40 - 75)
LYMPHOCYTES 23.4 % (19 - 46)
MONOCYTES 6.9 % ( 2 -10)
EOSINOPHILS 1.1 % (1 - 6)
BASOPHILS 0.0 % (0 - 2)
RBC 4.35 10^12L (4.0 - 5.8)
HAEMOGLOBIN 13.0 g/dl (11.5 - 15.5)
PCV/HEAMATOCRIT 37.2 % (36.0 - 46.0)
MCV 86.0 Fl (80.0 - 95.0)
MCH 30.0 Pg (27.0 - 32.0)
MCHC 34.9 g/dl (32.0 - 36.0)
RDW-CV 13.2 % (11 - 16)
PLATELET 187 10^9/L (100- 400)
MPV 11.0 Fl (9 - 13)
`,
  'B: label and value on separate lines': `
FBC
WBC
4.42
10/9
(4.5- 17.0)
NEUTROPHILS
68.6
%
(40 - 75)
HAEMOGLOBIN
13.0
g/dl
(11.5 - 15.5)
PLATELET
187
10^9/L
(100- 400)
`,
  'C: cell borders read as pipes': `
| FBC | WBC | 4.42 | 10/9 | (4.5- 17.0) |
| | NEUTROPHILS | 68.6 | % | (40 - 75) |
| | HAEMOGLOBIN | 13.0 | g/dl | (11.5 - 15.5) |
| | PLATELET | 187 | 10^9/L | (100- 400) |
| | MPV | 11.0 | Fl | (9 - 13) |
`,
};

for (const [name, text] of Object.entries(LAYOUTS)) {
  const cls = classifyReport(text);
  const lab = parseLabValues(text, patient, 'doc', 0.73);
  const derived = resolvePercentages(lab, patient, 'doc', 0.73);
  const all = [...lab.analytes, ...derived];
  console.log(`\n${name}`);
  console.log(`   classified: ${cls.modules.join(', ')}`);
  console.log(`   extracted ${all.length}: ${all.map((a) => `${a.key}=${a.value}`).join(', ') || '(NOTHING)'}`);
  if (lab.percentages.length) console.log(`   deferred %: ${lab.percentages.map((p) => `${p.key}=${p.percent}`).join(', ')}`);
}
