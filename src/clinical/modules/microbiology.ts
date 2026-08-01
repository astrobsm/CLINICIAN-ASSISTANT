/**
 * MICROBIOLOGY / MCS ANALYSIS MODULE
 *
 * Interprets wound swab, blood, urine and other culture reports: organism
 * significance, resistance markers, and antimicrobial decision support with
 * renal dose prompts, allergy warnings and stewardship reminders.
 *
 * The application presents options that the reported susceptibilities permit.
 * It does not prescribe.
 */
import type { ClinicalContext } from '../context';
import { uniq } from '../context';
import { fmt } from '../units';
import type { Finding, MicrobiologyReport, ModuleResult, Organism, Severity, Susceptibility } from '../types';
import { finding } from '../types';
import { rollUp } from '../severity';
import { cockcroftGault, ckdEpi2021 } from './renal';
import {
  ANTIBIOTIC_BY_KEY,
  allergyConflict,
  detectResistanceMarkers,
  lookupAntibiotic,
  lookupOrganism,
} from './microbiologyData';

const SPECIMEN_LABEL: Record<MicrobiologyReport['specimenType'], string> = {
  wound: 'Wound swab / tissue',
  blood: 'Blood culture',
  urine: 'Urine',
  sputum: 'Respiratory',
  csf: 'Cerebrospinal fluid',
  tissue: 'Tissue / deep specimen',
  other: 'Other specimen',
};

export interface TherapyOption {
  antibiotic: string;
  key: string;
  className: string;
  result: 'S' | 'I';
  renalNote?: string;
  allergyNote?: string;
  tdmNote?: string;
  generalNote?: string;
}

/** Build the decision-support list for one organism, given renal function and allergies. */
export function therapyOptionsFor(
  org: Organism,
  crcl: number | null,
  allergies: string[],
): TherapyOption[] {
  const out: TherapyOption[] = [];
  for (const s of org.susceptibilities) {
    if (s.result !== 'S' && s.result !== 'I') continue;
    const def = ANTIBIOTIC_BY_KEY[s.key] ?? lookupAntibiotic(s.antibiotic);
    const className = def?.className ?? 'not classified';

    let renalNote: string | undefined;
    if (def && crcl !== null) {
      if (def.key === 'nitrofurantoin' && crcl < 45) {
        renalNote = `Avoid — creatinine clearance ${crcl} mL/min is below the threshold of 45 mL/min for nitrofurantoin.`;
      } else if (def.renalAdjust && def.renalThreshold !== undefined && crcl < def.renalThreshold) {
        renalNote = `Dose adjustment required: creatinine clearance ${crcl} mL/min is below ${def.renalThreshold} mL/min. ${def.renalNote ?? 'Consult the local renal dosing guidance.'}`;
      } else if (def.renalAdjust && crcl < 60) {
        renalNote = `Creatinine clearance ${crcl} mL/min — check renal dosing. ${def.renalNote ?? ''}`.trim();
      } else if (!def.renalAdjust && crcl < 60) {
        renalNote = def.renalNote ?? 'No routine renal dose adjustment required.';
      }
    } else if (def?.renalAdjust && crcl === null) {
      renalNote = 'Renally cleared — enter age and weight in the patient panel to enable a creatinine clearance estimate.';
    }

    out.push({
      antibiotic: s.antibiotic,
      key: s.key,
      className,
      result: s.result,
      renalNote,
      allergyNote: def ? allergyConflict(def, allergies) ?? undefined : undefined,
      tdmNote: def?.tdm ? 'Therapeutic drug monitoring required — check levels per local protocol.' : undefined,
      generalNote: def?.notes,
    });
  }
  // Narrow-spectrum, orally available options first.
  const rank: Record<string, number> = {
    penicillin: 0, 'folate pathway inhibitor': 1, nitrofuran: 1, tetracycline: 2, macrolide: 2,
    lincosamide: 3, cephalosporin: 3, 'beta-lactam/beta-lactamase inhibitor': 4, fluoroquinolone: 5,
    glycopeptide: 6, aminoglycoside: 6, oxazolidinone: 7, lipopeptide: 7, carbapenem: 8, polymyxin: 9,
  };
  return out.sort((a, b) => (rank[a.className] ?? 5) - (rank[b.className] ?? 5) || a.antibiotic.localeCompare(b.antibiotic));
}

function significanceOf(org: Organism, specimen: MicrobiologyReport['specimenType']): Organism['likelySignificance'] {
  const def = lookupOrganism(org.name);
  if (!def) return 'indeterminate';
  if (def.pathogenSites.includes(specimen)) return 'pathogen';
  if (def.contaminantSites.includes(specimen)) return specimen === 'blood' ? 'possible-contaminant' : 'coloniser';
  return 'indeterminate';
}

export function analyseMicrobiology(ctx: ClinicalContext): ModuleResult {
  const findings: Finding[] = [];
  const derived: ModuleResult['derived'] = {};
  const p = ctx.patient;
  const reports = ctx.extraction.micro;
  const present = reports.length > 0;

  // Renal function for dosing prompts.
  const creat = ctx.v('creatinine');
  let crcl: number | null = null;
  let egfr: number | null = ctx.v('egfr');
  if (creat !== null && p.age && p.weightKg) crcl = cockcroftGault(creat, p.age, p.weightKg, p.sex);
  if (creat !== null && p.age && egfr === null) egfr = ckdEpi2021(creat, p.age, p.sex);

  if (present) {
    derived.renalDosing = {
      label: 'Renal function for antimicrobial dosing',
      value: crcl !== null ? `Creatinine clearance ${crcl} mL/min` : egfr !== null ? `eGFR ${fmt(egfr, 0)} mL/min/1.73m²` : 'Not available',
      note: crcl === null
        ? 'Enter age and body weight in the patient panel to enable Cockcroft–Gault dosing prompts, which most antimicrobial dosing tables use.'
        : crcl < 30 ? 'Significant renal impairment — every renally cleared agent below requires dose review.'
          : crcl < 60 ? 'Moderate renal impairment — check dosing for renally cleared agents.' : 'No renal dose reduction expected on this clearance.',
    };
    derived.allergies = {
      label: 'Recorded drug allergies',
      value: p.allergies.length ? p.allergies.join(', ') : 'None recorded',
      note: p.allergies.length ? 'Allergy warnings appear against each susceptible agent below.' : 'Enter any known drug allergies in the patient panel to enable allergy checking.',
    };
  }

  for (const [i, rep] of reports.entries()) {
    const label = SPECIMEN_LABEL[rep.specimenType];
    const markers = detectResistanceMarkers(`${rep.cultureText} ${rep.microscopy} ${rep.gramStain} ${rep.organisms.map((o) => `${o.name} ${o.resistanceMarkers.join(' ')}`).join(' ')}`);

    // ── No growth ────────────────────────────────────────────────────
    if (rep.noGrowth && !rep.organisms.length) {
      findings.push(finding({
        id: `micro.nogrowth.${i}`,
        module: 'microbiology',
        title: `${label}: no growth`,
        severity: p.fever ? 'moderate' : 'normal',
        interpretation:
          `No organisms isolated from the ${label.toLowerCase()} specimen${rep.specimen ? ` (${rep.specimen})` : ''}.` +
          (p.fever ? ' The patient is recorded as febrile — a negative culture does not exclude infection, particularly if antimicrobials were given before the sample was taken.' : '') +
          (rep.specimenType === 'blood' ? ' Note the incubation period: blood cultures are usually reported as negative only after five days.' : ''),
        basis: [`micro:${i}`],
        differentials: ['True absence of bacterial infection', 'Prior antimicrobial therapy suppressing growth', 'Fastidious or slow-growing organism requiring extended or specialised culture', 'Viral or non-infective cause', 'Inadequate sampling technique or volume'],
        investigations: uniq([
          p.fever ? 'Repeat cultures from all plausible sources before further antimicrobials where the patient remains febrile' : '',
          'Consider extended culture, 16S PCR or fungal culture where clinical suspicion of infection is high',
          rep.specimenType === 'blood' ? 'Ensure an adequate volume was taken — culture yield is volume-dependent — and consider two separate sets from different sites' : '',
          'Review for non-infective causes of the inflammatory response',
        ]),
        implications: ['A negative culture in an improving patient supports antimicrobial de-escalation or cessation.'],
        monitoring: ['Clinical response and inflammatory markers'],
        guidance: ['Review the need for ongoing empirical antimicrobials — negative cultures with clinical improvement is a recognised stopping point.'],
        tags: ['no-growth', 'antimicrobial-stewardship'],
      }));
      continue;
    }

    // ── Mixed growth with no dominant organism ───────────────────────
    if (rep.mixedGrowth && !rep.organisms.length) {
      findings.push(finding({
        id: `micro.mixed.${i}`,
        module: 'microbiology',
        title: `${label}: mixed growth reported`,
        severity: 'moderate',
        interpretation:
          'Mixed growth without a dominant organism most often indicates surface colonisation or contamination rather than a single causative pathogen. In a superficial wound swab this is a common and largely uninformative result — deep tissue or curettage samples taken after cleansing and debridement give a far more reliable answer.',
        basis: [`micro:${i}`],
        differentials: ['Surface colonisation of an open wound', 'Contamination during collection', 'Genuine polymicrobial infection — particularly diabetic foot, pressure ulcer, perineal and intra-abdominal wounds'],
        investigations: ['Obtain a deep tissue or curettage specimen after cleansing rather than a superficial swab', 'Correlate with clinical signs of infection: spreading erythema, purulence, malodour, increasing pain, systemic upset', 'Consider imaging for deep collection or osteomyelitis where the wound is chronic or over a bony prominence'],
        implications: ['Do not treat a mixed growth in the absence of clinical signs of infection — this drives resistance without benefit.'],
        monitoring: ['Reassess the wound and repeat sampling if the clinical picture changes'],
        guidance: ['Antimicrobial stewardship: colonisation of a chronic wound is expected and is not an indication for systemic antimicrobials.'],
        tags: ['mixed-growth', 'antimicrobial-stewardship', 'polymicrobial'],
      }));
    }

    // ── Per-organism analysis ────────────────────────────────────────
    for (const [j, orgRaw] of rep.organisms.entries()) {
      const def = lookupOrganism(orgRaw.name);
      const org: Organism = {
        ...orgRaw,
        gram: def?.gram ?? orgRaw.gram,
        likelySignificance: significanceOf(orgRaw, rep.specimenType),
        biofilmRisk: def?.biofilm ?? orgRaw.biofilmRisk,
        hospitalAcquiredIndicator: def?.hospitalAcquiredIndicator ?? orgRaw.hospitalAcquiredIndicator,
      };

      const options = therapyOptionsFor(org, crcl, p.allergies);
      const resistant = org.susceptibilities.filter((s) => s.result === 'R');
      const orgMarkers = detectResistanceMarkers(`${org.name} ${org.resistanceMarkers.join(' ')}`);
      const allMarkers = uniq([...markers, ...orgMarkers].map((m) => m.key)).map(
        (k) => [...markers, ...orgMarkers].find((m) => m.key === k)!,
      );

      const isBlood = rep.specimenType === 'blood';
      const contaminant = org.likelySignificance === 'possible-contaminant';
      const criticalMarker = allMarkers.some((m) => m.severity === 'critical');

      let severity: Severity = 'moderate';
      if (criticalMarker) severity = 'critical';
      else if (isBlood && !contaminant) severity = 'critical';
      else if (allMarkers.length) severity = 'significant';
      else if (org.likelySignificance === 'pathogen') severity = p.fever ? 'significant' : 'moderate';
      else if (contaminant) severity = 'minor';

      const interpretation = uniq([
        `${org.name} isolated from ${label.toLowerCase()}${rep.specimen ? ` (${rep.specimen})` : ''}${org.growthQuantity ? `, reported as ${org.growthQuantity}` : ''}.`,
        `Organism category: ${org.gram.replace('-', ' ')}.`,
        org.likelySignificance === 'pathogen'
          ? 'On the sampled site this organism is usually a true pathogen.'
          : contaminant
            ? 'On the sampled site this organism is frequently a contaminant. Significance depends on the number of positive sets, the presence of prosthetic material or a line, and the clinical picture — clinician review is required.'
            : org.likelySignificance === 'coloniser'
              ? 'On the sampled site this organism commonly represents colonisation rather than invasive infection. Treat only where there are clinical signs of infection.'
              : 'Clinical significance is indeterminate on the available information and requires clinician review.',
        isBlood && !contaminant ? 'Isolation from blood indicates bacteraemia and requires source identification, assessment for endovascular involvement, and appropriate intravenous therapy.' : '',
        def?.notes ?? '',
        org.biofilmRisk ? 'This organism is a recognised biofilm former: where prosthetic material, a line or a chronic wound is present, antimicrobials alone are frequently insufficient and device removal or debridement should be considered.' : '',
        def?.intrinsicResistance.length ? `Intrinsic resistance to note: ${def.intrinsicResistance.join(', ')}.` : '',
        allMarkers.length ? allMarkers.map((m) => `${m.label}: ${m.implication}`).join(' ') : '',
      ]).join(' ');

      findings.push(finding({
        id: `micro.org.${i}.${j}`,
        module: 'microbiology',
        title: `${org.name} — ${label}${allMarkers.length ? ` (${allMarkers.map((m) => m.key.toUpperCase()).join(', ')})` : ''}`,
        severity,
        interpretation,
        basis: [`micro:${i}:${j}`],
        differentials: contaminant
          ? ['Skin flora contamination during collection', 'True bloodstream infection — more likely with multiple positive sets, a line, or prosthetic material', 'Line-associated infection']
          : [`Infection at the sampled site with ${org.name}`, 'Colonisation without invasive infection', 'Contamination'],
        investigations: uniq([
          contaminant && isBlood ? 'Repeat blood cultures from two separate peripheral sites before further antimicrobials' : '',
          isBlood && !contaminant ? 'Identify and control the source; assess indwelling lines for removal' : '',
          isBlood && org.name.toLowerCase().includes('aureus') ? 'Echocardiography (transthoracic, with transoesophageal if inconclusive or risk factors present) and repeat blood cultures at 48–72 hours' : '',
          isBlood && org.gram === 'fungus' ? 'Dilated fundoscopy for endophthalmitis, line removal and repeat cultures to document clearance' : '',
          rep.specimenType === 'wound' ? 'Assess for deep infection, collection or osteomyelitis; consider imaging where the wound overlies bone or is chronic' : '',
          rep.specimenType === 'urine' && p.fever ? 'Assess for upper tract involvement and obstruction; renal tract imaging if obstruction is suspected' : '',
          'Discuss with a microbiologist or infection specialist where the organism is resistant, the site is deep, or the patient is not responding',
        ]),
        implications: uniq([
          resistant.length ? `Reported resistant to: ${resistant.map((r) => r.antibiotic).join(', ')}.` : '',
          org.hospitalAcquiredIndicator ? 'This organism is commonly healthcare-associated — review recent hospital exposure, devices and prior antimicrobial therapy.' : '',
          allMarkers.length ? allMarkers.map((m) => `Isolation precautions: ${m.isolation}`).join(' ') : '',
          crcl !== null && crcl < 60 ? `Renal impairment is present (creatinine clearance ${crcl} mL/min) — renal dose adjustment applies to several of the options listed.` : '',
          p.allergies.length ? `Recorded allergies (${p.allergies.join(', ')}) have been checked against the susceptible agents.` : '',
        ]),
        monitoring: uniq([
          isBlood ? 'Repeat blood cultures to document clearance' : 'Repeat culture if there is no clinical response',
          'Clinical response, temperature and inflammatory markers',
          options.some((o) => o.tdmNote) ? 'Therapeutic drug monitoring where a glycopeptide or aminoglycoside is used' : '',
          crcl !== null && crcl < 60 ? 'Renal function during therapy with nephrotoxic agents' : '',
        ]),
        guidance: uniq([
          'Antimicrobial choice should follow local guidelines and the reported susceptibilities, and should be reviewed at 48–72 hours.',
          allMarkers.map((m) => m.stewardship).join(' '),
          'De-escalate to the narrowest effective agent, switch from intravenous to oral when the patient is stable, and document a stop or review date.',
        ]),
        tags: uniq([
          'organism-isolated',
          `gram:${org.gram}`,
          isBlood ? 'bacteraemia' : '',
          contaminant ? 'possible-contaminant' : 'likely-pathogen',
          ...allMarkers.map((m) => `resistance:${m.key}`),
          org.biofilmRisk ? 'biofilm' : '',
          org.hospitalAcquiredIndicator ? 'hospital-acquired' : '',
          'culture-positive',
          crcl !== null && crcl < 60 ? 'renal-dose-consideration' : '',
        ]),
      }));

      // Publish the therapy options as derived data for the report table.
      derived[`therapy.${i}.${j}`] = {
        label: `Antimicrobial options — ${org.name}`,
        value: options.length
          ? options.map((o) => `${o.antibiotic} (${o.result === 'S' ? 'sensitive' : 'intermediate'}, ${o.className})`).join('; ')
          : 'No susceptible agents reported — discuss with microbiology.',
        note: uniq([
          ...options.filter((o) => o.allergyNote).map((o) => `${o.antibiotic}: ${o.allergyNote}`),
          ...options.filter((o) => o.renalNote).map((o) => `${o.antibiotic}: ${o.renalNote}`),
          ...options.filter((o) => o.tdmNote).map((o) => `${o.antibiotic}: ${o.tdmNote}`),
        ]).join(' | ') || undefined,
      };
    }

    // Polymicrobial flag
    if (rep.organisms.length >= 2) {
      const grams = uniq(rep.organisms.map((o) => o.gram));
      findings.push(finding({
        id: `micro.poly.${i}`,
        module: 'microbiology',
        title: `Polymicrobial growth — ${label}`,
        severity: 'significant',
        interpretation:
          `${rep.organisms.length} organisms isolated (${rep.organisms.map((o) => o.name).join(', ')})${grams.length > 1 ? `, spanning ${grams.join(' and ')} categories` : ''}. Polymicrobial infection is characteristic of diabetic foot infection, pressure ulcers, perineal and intra-abdominal sepsis, and typically requires broad initial cover with subsequent narrowing.`,
        basis: [`micro:${i}`],
        differentials: ['Genuine polymicrobial infection', 'Colonisation of a chronic wound with a single true pathogen', 'Contamination of a superficial specimen'],
        investigations: ['Deep tissue sampling if the specimen was superficial', 'Imaging for deep collection or bone involvement', 'Surgical assessment for debridement and source control'],
        implications: ['Source control — debridement, drainage or device removal — is usually more important than the choice of antimicrobial.', 'Anaerobic cover should be considered where the wound is deep, necrotic or malodorous.'],
        monitoring: ['Repeat culture from deep tissue after debridement', 'Clinical wound assessment and inflammatory markers'],
        guidance: ['Broad initial cover followed by de-escalation once the responsible organisms and susceptibilities are established.'],
        tags: ['polymicrobial', 'source-control'],
      }));
    }

    if (rep.microscopy || rep.gramStain) {
      derived[`microscopy.${i}`] = {
        label: `Microscopy / Gram stain — ${label}`,
        value: uniq([rep.gramStain, rep.microscopy]).join(' · '),
        note: /pus cells|leuc|wbc|polymorph/i.test(`${rep.microscopy}`)
          ? 'Pus cells reported — supports an inflammatory response at the sampled site rather than pure colonisation.'
          : undefined,
      };
    }
  }

  const analytes = ctx.moduleAnalytes('microbiology');
  const titles = uniq(findings.map((f) => f.title));

  return {
    module: 'microbiology',
    present,
    analytes,
    observations: ctx.moduleObservations('microbiology'),
    findings,
    summary: !present
      ? 'No microbiology data available.'
      : titles.length ? `${titles.join('; ')}.` : 'Microbiology reports processed with no significant findings identified.',
    severity: rollUp(findings.map((f) => f.severity)),
    derived,
  };
}

/** Exposed for the report renderer so it can build the susceptibility table. */
export function susceptibilityTable(org: Organism): { sensitive: Susceptibility[]; intermediate: Susceptibility[]; resistant: Susceptibility[] } {
  return {
    sensitive: org.susceptibilities.filter((s) => s.result === 'S'),
    intermediate: org.susceptibilities.filter((s) => s.result === 'I'),
    resistant: org.susceptibilities.filter((s) => s.result === 'R'),
  };
}
