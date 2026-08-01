/**
 * Microbiology reference data: organism catalogue, antimicrobial catalogue with
 * class and renal-handling metadata, and resistance-marker definitions.
 *
 * Used for decision support only. The application never prescribes.
 */
import type { GramCategory, Organism } from '../types';

// ───────────────────────────── ORGANISMS ─────────────────────────────

export interface OrganismDef {
  key: string;
  name: string;
  gram: GramCategory;
  synonyms: string[];
  /** Sites where this organism is usually a true pathogen. */
  pathogenSites: string[];
  /** Sites where it commonly represents contamination or colonisation. */
  contaminantSites: string[];
  biofilm: boolean;
  hospitalAcquiredIndicator: boolean;
  /** Intrinsic resistances worth surfacing even if not reported. */
  intrinsicResistance: string[];
  notes: string;
}

const O = (d: OrganismDef): OrganismDef => d;

export const ORGANISMS: OrganismDef[] = [
  // Gram positive cocci
  O({
    key: 'saureus', name: 'Staphylococcus aureus', gram: 'gram-positive',
    synonyms: ['staphylococcus aureus', 'staph aureus', 's. aureus', 's aureus', 'mssa'],
    pathogenSites: ['wound', 'blood', 'tissue', 'sputum', 'csf', 'other'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Always significant in blood — Staphylococcus aureus bacteraemia mandates echocardiography, source identification, removal of any infected line, and a minimum 14 days of intravenous therapy. Specialist infection advice is standard.',
  }),
  O({
    key: 'mrsa', name: 'Meticillin-resistant Staphylococcus aureus (MRSA)', gram: 'gram-positive',
    synonyms: ['meticillin resistant staphylococcus aureus', 'methicillin resistant staphylococcus aureus', 'mrsa'],
    pathogenSites: ['wound', 'blood', 'tissue', 'sputum', 'other'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: true,
    intrinsicResistance: ['flucloxacillin', 'benzylpenicillin', 'amoxicillin', 'co-amoxiclav', 'cefalexin', 'cefuroxime', 'ceftriaxone', 'meropenem', 'ertapenem', 'piperacillin-tazobactam'],
    notes: 'MRSA is resistant to all standard beta-lactams irrespective of the reported disc result. Glycopeptides, linezolid, daptomycin or ceftaroline are the usual options. Contact precautions and decolonisation apply.',
  }),
  O({
    key: 'cons', name: 'Coagulase-negative Staphylococcus', gram: 'gram-positive',
    synonyms: ['coagulase negative staphylococcus', 'coagulase-negative staphylococci', 'staphylococcus epidermidis', 'staph epidermidis', 's. epidermidis', 'cons', 'staphylococcus haemolyticus', 'staphylococcus hominis'],
    pathogenSites: [], contaminantSites: ['blood', 'wound', 'urine'],
    biofilm: true, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Usually a skin contaminant. Significant when isolated from multiple separate blood culture sets, from a prosthesis or line, or in a neutropenic or neonatal patient. Frequently meticillin-resistant.',
  }),
  O({
    key: 'spyogenes', name: 'Streptococcus pyogenes (Group A Streptococcus)', gram: 'gram-positive',
    synonyms: ['streptococcus pyogenes', 'group a streptococcus', 'group a strep', 's. pyogenes', 'beta haemolytic streptococcus group a'],
    pathogenSites: ['wound', 'blood', 'tissue', 'other'], contaminantSites: [],
    biofilm: false, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Always significant. Associated with necrotising fasciitis and streptococcal toxic shock syndrome — rapidly progressive pain out of proportion to appearance demands immediate surgical assessment. Remains uniformly penicillin-susceptible; clindamycin is added for toxin suppression in severe disease.',
  }),
  O({
    key: 'sagalactiae', name: 'Streptococcus agalactiae (Group B Streptococcus)', gram: 'gram-positive',
    synonyms: ['streptococcus agalactiae', 'group b streptococcus', 'group b strep', 's. agalactiae'],
    pathogenSites: ['wound', 'blood', 'urine', 'tissue'], contaminantSites: [],
    biofilm: false, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Significant in diabetic foot infection, skin and soft tissue infection, and in pregnancy where it carries neonatal implications.',
  }),
  O({
    key: 'spneumoniae', name: 'Streptococcus pneumoniae', gram: 'gram-positive',
    synonyms: ['streptococcus pneumoniae', 'pneumococcus', 's. pneumoniae'],
    pathogenSites: ['sputum', 'blood', 'csf', 'other'], contaminantSites: [],
    biofilm: false, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Leading cause of community-acquired pneumonia and bacterial meningitis. Invasive disease should prompt assessment for asplenia, myeloma and HIV.',
  }),
  O({
    key: 'viridans', name: 'Viridans group Streptococcus', gram: 'gram-positive',
    synonyms: ['viridans streptococcus', 'streptococcus viridans', 'streptococcus mitis', 'streptococcus sanguinis', 'streptococcus oralis', 'alpha haemolytic streptococcus'],
    pathogenSites: ['blood'], contaminantSites: ['wound', 'sputum'],
    biofilm: true, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Oral flora. In blood cultures, particularly with a murmur or prosthetic valve, consider infective endocarditis. In neutropenic patients it can cause severe sepsis.',
  }),
  O({
    key: 'efaecalis', name: 'Enterococcus faecalis', gram: 'gram-positive',
    synonyms: ['enterococcus faecalis', 'e. faecalis', 'streptococcus faecalis'],
    pathogenSites: ['urine', 'blood', 'wound', 'tissue'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: false,
    intrinsicResistance: ['cefalexin', 'cefuroxime', 'ceftriaxone', 'ceftazidime', 'clindamycin', 'co-trimoxazole (in vivo)', 'aminoglycoside monotherapy'],
    notes: 'Intrinsically resistant to all cephalosporins. Amoxicillin is usually the agent of choice. Enterococcal bacteraemia warrants assessment for endocarditis.',
  }),
  O({
    key: 'efaecium', name: 'Enterococcus faecium', gram: 'gram-positive',
    synonyms: ['enterococcus faecium', 'e. faecium'],
    pathogenSites: ['urine', 'blood', 'wound', 'tissue'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: true,
    intrinsicResistance: ['cefalexin', 'cefuroxime', 'ceftriaxone', 'ceftazidime', 'clindamycin'],
    notes: 'More resistant than E. faecalis and frequently ampicillin-resistant. Often a hospital-acquired organism associated with prior broad-spectrum antimicrobial exposure.',
  }),
  O({
    key: 'vre', name: 'Vancomycin-resistant Enterococcus (VRE)', gram: 'gram-positive',
    synonyms: ['vancomycin resistant enterococcus', 'vancomycin-resistant enterococci', 'vre', 'glycopeptide resistant enterococcus', 'gre'],
    pathogenSites: ['blood', 'urine', 'wound', 'tissue'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: true,
    intrinsicResistance: ['vancomycin', 'teicoplanin', 'cephalosporins', 'clindamycin'],
    notes: 'Requires contact precautions and infection prevention notification. Linezolid or daptomycin are the usual therapeutic options; discuss with microbiology.',
  }),
  O({
    key: 'listeria', name: 'Listeria monocytogenes', gram: 'gram-positive',
    synonyms: ['listeria monocytogenes', 'listeria'],
    pathogenSites: ['blood', 'csf'], contaminantSites: [],
    biofilm: false, hospitalAcquiredIndicator: false,
    intrinsicResistance: ['cefalexin', 'cefuroxime', 'ceftriaxone', 'ceftazidime', 'all cephalosporins'],
    notes: 'Intrinsically resistant to all cephalosporins — amoxicillin is required. Consider in meningitis in patients over 50, in pregnancy and in immunosuppression.',
  }),
  O({
    key: 'cutibacterium', name: 'Cutibacterium acnes', gram: 'anaerobe',
    synonyms: ['cutibacterium acnes', 'propionibacterium acnes', 'p. acnes'],
    pathogenSites: [], contaminantSites: ['blood', 'wound'],
    biofilm: true, hospitalAcquiredIndicator: false, intrinsicResistance: ['metronidazole'],
    notes: 'Usually a skin contaminant, but a recognised pathogen in prosthetic joint infection (particularly shoulder), spinal implants and neurosurgical shunts, where prolonged culture is required.',
  }),
  O({
    key: 'corynebacterium', name: 'Corynebacterium species (diphtheroids)', gram: 'gram-positive',
    synonyms: ['corynebacterium', 'diphtheroids', 'coryneform bacteria'],
    pathogenSites: [], contaminantSites: ['blood', 'wound', 'urine'],
    biofilm: false, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Usually skin flora. Significant in prosthetic material infection or when repeatedly isolated in pure growth.',
  }),
  O({
    key: 'bacillus', name: 'Bacillus species', gram: 'gram-positive',
    synonyms: ['bacillus species', 'bacillus cereus', 'aerobic spore bearers'],
    pathogenSites: [], contaminantSites: ['blood', 'wound'],
    biofilm: false, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Usually environmental contamination. Bacillus cereus is a genuine pathogen in intravenous drug users, neutropenic patients and ocular trauma.',
  }),

  // Gram negative
  O({
    key: 'ecoli', name: 'Escherichia coli', gram: 'gram-negative',
    synonyms: ['escherichia coli', 'e. coli', 'e coli'],
    pathogenSites: ['urine', 'blood', 'wound', 'tissue'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'The commonest cause of urinary tract infection and Gram-negative bacteraemia. Rising rates of ESBL production make susceptibility testing essential.',
  }),
  O({
    key: 'klebsiella', name: 'Klebsiella species', gram: 'gram-negative',
    synonyms: ['klebsiella pneumoniae', 'klebsiella oxytoca', 'klebsiella species', 'klebsiella'],
    pathogenSites: ['urine', 'blood', 'sputum', 'wound', 'tissue'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: true, intrinsicResistance: ['amoxicillin', 'ampicillin'],
    notes: 'Intrinsically resistant to amoxicillin. Hypervirulent strains cause liver abscess and metastatic infection. A frequent host of ESBL and carbapenemase genes.',
  }),
  O({
    key: 'proteus', name: 'Proteus mirabilis', gram: 'gram-negative',
    synonyms: ['proteus mirabilis', 'proteus species', 'proteus vulgaris', 'proteus'],
    pathogenSites: ['urine', 'wound', 'blood'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: false, intrinsicResistance: ['nitrofurantoin', 'tetracycline', 'colistin', 'tigecycline'],
    notes: 'Urease-producing — associated with alkaline urine and struvite (staghorn) calculi. Intrinsically resistant to nitrofurantoin, so this drug is not an option for Proteus urinary infection.',
  }),
  O({
    key: 'enterobacter', name: 'Enterobacter species', gram: 'gram-negative',
    synonyms: ['enterobacter cloacae', 'enterobacter species', 'enterobacter'],
    pathogenSites: ['blood', 'wound', 'urine', 'sputum'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: true, intrinsicResistance: ['amoxicillin', 'co-amoxiclav', 'cefalexin', 'cefuroxime'],
    notes: 'Carries an inducible AmpC beta-lactamase. Treatment failure can occur with third-generation cephalosporins despite apparent in-vitro susceptibility — avoid them and discuss with microbiology.',
  }),
  O({
    key: 'serratia', name: 'Serratia marcescens', gram: 'gram-negative',
    synonyms: ['serratia marcescens', 'serratia'],
    pathogenSites: ['blood', 'wound', 'urine', 'sputum'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: true, intrinsicResistance: ['amoxicillin', 'co-amoxiclav', 'cefalexin', 'cefuroxime', 'colistin', 'nitrofurantoin'],
    notes: 'AmpC producer with the same third-generation cephalosporin caveat as Enterobacter. Strongly associated with healthcare-associated infection.',
  }),
  O({
    key: 'citrobacter', name: 'Citrobacter species', gram: 'gram-negative',
    synonyms: ['citrobacter freundii', 'citrobacter species', 'citrobacter'],
    pathogenSites: ['blood', 'urine', 'wound'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: true, intrinsicResistance: ['amoxicillin', 'cefalexin', 'cefuroxime'],
    notes: 'AmpC producer. Same treatment caveats as Enterobacter and Serratia.',
  }),
  O({
    key: 'morganella', name: 'Morganella morganii', gram: 'gram-negative',
    synonyms: ['morganella morganii', 'morganella'],
    pathogenSites: ['urine', 'wound', 'blood'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: true, intrinsicResistance: ['amoxicillin', 'co-amoxiclav', 'cefuroxime', 'nitrofurantoin', 'colistin', 'tigecycline'],
    notes: 'AmpC producer with broad intrinsic resistance; commonly isolated from chronic wounds and catheterised urinary tracts.',
  }),
  O({
    key: 'pseudomonas', name: 'Pseudomonas aeruginosa', gram: 'gram-negative',
    synonyms: ['pseudomonas aeruginosa', 'p. aeruginosa', 'pseudomonas'],
    pathogenSites: ['wound', 'blood', 'sputum', 'urine', 'tissue'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: true,
    intrinsicResistance: ['amoxicillin', 'co-amoxiclav', 'cefalexin', 'cefuroxime', 'ceftriaxone', 'ertapenem', 'trimethoprim', 'tigecycline', 'doxycycline'],
    notes: 'Intrinsically resistant to most beta-lactams including ceftriaxone and ertapenem. Anti-pseudomonal cover requires piperacillin-tazobactam, ceftazidime, cefepime, meropenem, ciprofloxacin or an aminoglycoside. Strong biofilm former in chronic wounds, burns and on devices.',
  }),
  O({
    key: 'acinetobacter', name: 'Acinetobacter baumannii', gram: 'gram-negative',
    synonyms: ['acinetobacter baumannii', 'acinetobacter species', 'acinetobacter'],
    pathogenSites: ['blood', 'sputum', 'wound'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: true,
    intrinsicResistance: ['amoxicillin', 'ertapenem', 'aztreonam'],
    notes: 'Highly associated with intensive care and ventilator-associated infection. Frequently multidrug resistant; environmental persistence is prolonged and contact precautions are required.',
  }),
  O({
    key: 'stenotrophomonas', name: 'Stenotrophomonas maltophilia', gram: 'gram-negative',
    synonyms: ['stenotrophomonas maltophilia', 'stenotrophomonas', 'xanthomonas maltophilia'],
    pathogenSites: ['sputum', 'blood'], contaminantSites: ['wound'],
    biofilm: true, hospitalAcquiredIndicator: true,
    intrinsicResistance: ['meropenem', 'imipenem', 'ertapenem', 'all carbapenems', 'aminoglycosides'],
    notes: 'Intrinsically carbapenem-resistant — emergence during carbapenem therapy is characteristic. Co-trimoxazole is the usual agent of choice.',
  }),
  O({
    key: 'haemophilus', name: 'Haemophilus influenzae', gram: 'gram-negative',
    synonyms: ['haemophilus influenzae', 'h. influenzae', 'haemophilus'],
    pathogenSites: ['sputum', 'blood', 'csf'], contaminantSites: [],
    biofilm: false, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Common in exacerbations of COPD and in community-acquired pneumonia. Beta-lactamase production is frequent, so co-amoxiclav rather than amoxicillin may be required.',
  }),
  O({
    key: 'moraxella', name: 'Moraxella catarrhalis', gram: 'gram-negative',
    synonyms: ['moraxella catarrhalis', 'moraxella'],
    pathogenSites: ['sputum'], contaminantSites: [],
    biofilm: false, hospitalAcquiredIndicator: false, intrinsicResistance: ['amoxicillin'],
    notes: 'Almost universally beta-lactamase producing — amoxicillin alone is inadequate.',
  }),

  // Anaerobes
  O({
    key: 'bacteroides', name: 'Bacteroides fragilis group', gram: 'anaerobe',
    synonyms: ['bacteroides fragilis', 'bacteroides species', 'bacteroides'],
    pathogenSites: ['wound', 'tissue', 'blood'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: false,
    intrinsicResistance: ['aminoglycosides', 'ciprofloxacin', 'trimethoprim'],
    notes: 'Gut anaerobe associated with intra-abdominal and perineal wound infection. Metronidazole, co-amoxiclav, piperacillin-tazobactam or a carbapenem provide cover. Source control is essential.',
  }),
  O({
    key: 'cperfringens', name: 'Clostridium perfringens', gram: 'anaerobe',
    synonyms: ['clostridium perfringens', 'c. perfringens'],
    pathogenSites: ['wound', 'tissue', 'blood'], contaminantSites: [],
    biofilm: false, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Associated with gas gangrene and necrotising soft tissue infection — a surgical emergency requiring urgent debridement alongside high-dose penicillin and clindamycin.',
  }),
  O({
    key: 'cdifficile', name: 'Clostridioides difficile', gram: 'anaerobe',
    synonyms: ['clostridioides difficile', 'clostridium difficile', 'c. difficile', 'c diff', 'cdi'],
    pathogenSites: ['other'], contaminantSites: [],
    biofilm: false, hospitalAcquiredIndicator: true, intrinsicResistance: [],
    notes: 'Requires isolation with enteric precautions, review and cessation of the precipitating antimicrobial, and treatment per local protocol. Assess severity — white cell count, creatinine, temperature and albumin.',
  }),
  O({
    key: 'anaerobicmixed', name: 'Mixed anaerobic flora', gram: 'anaerobe',
    synonyms: ['mixed anaerobes', 'anaerobic organisms', 'peptostreptococcus', 'prevotella', 'fusobacterium', 'anaerobic growth'],
    pathogenSites: ['wound', 'tissue'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: false, intrinsicResistance: ['aminoglycosides'],
    notes: 'Characteristic of deep, necrotic, malodorous or diabetic foot wounds. Anaerobic cover and surgical debridement are usually both required.',
  }),

  // Fungi
  O({
    key: 'candidaalbicans', name: 'Candida albicans', gram: 'fungus',
    synonyms: ['candida albicans', 'c. albicans'],
    pathogenSites: ['blood', 'tissue'], contaminantSites: ['wound', 'sputum', 'urine'],
    biofilm: true, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Candida in blood is always significant and requires antifungal therapy, line removal, ophthalmological assessment and specialist input. Isolation from sputum or a superficial wound usually represents colonisation.',
  }),
  O({
    key: 'candidaglabrata', name: 'Candida glabrata / non-albicans Candida', gram: 'fungus',
    synonyms: ['candida glabrata', 'candida krusei', 'candida parapsilosis', 'candida tropicalis', 'candida species', 'non-albicans candida'],
    pathogenSites: ['blood', 'tissue'], contaminantSites: ['wound', 'sputum', 'urine'],
    biofilm: true, hospitalAcquiredIndicator: true, intrinsicResistance: ['fluconazole (variable; C. krusei intrinsically resistant)'],
    notes: 'Reduced fluconazole susceptibility is common; an echinocandin is usually preferred as initial therapy pending identification and susceptibility.',
  }),
  O({
    key: 'candidaauris', name: 'Candida auris', gram: 'fungus',
    synonyms: ['candida auris', 'c. auris'],
    pathogenSites: ['blood', 'wound', 'urine', 'tissue'], contaminantSites: [],
    biofilm: true, hospitalAcquiredIndicator: true, intrinsicResistance: ['fluconazole'],
    notes: 'A significant infection-prevention concern: frequently multidrug resistant, persists in the environment and causes outbreaks. Notify infection prevention and control immediately; single-room isolation with contact precautions is required.',
  }),
  O({
    key: 'aspergillus', name: 'Aspergillus species', gram: 'fungus',
    synonyms: ['aspergillus fumigatus', 'aspergillus species', 'aspergillus'],
    pathogenSites: ['sputum', 'tissue'], contaminantSites: ['wound'],
    biofilm: false, hospitalAcquiredIndicator: false, intrinsicResistance: ['fluconazole', 'echinocandin monotherapy'],
    notes: 'Significance depends on host immune status. Invasive aspergillosis in the immunocompromised requires urgent specialist management; voriconazole is first-line.',
  }),

  O({
    key: 'tuberculosis', name: 'Mycobacterium tuberculosis complex', gram: 'mycobacterium',
    synonyms: ['mycobacterium tuberculosis', 'm. tuberculosis', 'afb positive', 'acid fast bacilli'],
    pathogenSites: ['sputum', 'tissue', 'csf', 'other'], contaminantSites: [],
    biofilm: false, hospitalAcquiredIndicator: false, intrinsicResistance: [],
    notes: 'Notifiable disease. Requires airborne isolation, urgent infection specialist involvement, contact tracing and public health notification.',
  }),
];

export const ORGANISM_SYNONYMS: { phrase: string; def: OrganismDef }[] = ORGANISMS
  .flatMap((def) => def.synonyms.map((phrase) => ({ phrase, def })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

// ───────────────────────────── ANTIMICROBIALS ─────────────────────────────

export type AntibioticClass =
  | 'penicillin' | 'beta-lactam/beta-lactamase inhibitor' | 'cephalosporin' | 'carbapenem'
  | 'monobactam' | 'glycopeptide' | 'lipopeptide' | 'oxazolidinone' | 'aminoglycoside'
  | 'fluoroquinolone' | 'macrolide' | 'tetracycline' | 'lincosamide' | 'nitroimidazole'
  | 'folate pathway inhibitor' | 'nitrofuran' | 'phosphonic acid' | 'rifamycin'
  | 'polymyxin' | 'fusidane' | 'phenicol' | 'azole antifungal' | 'echinocandin'
  | 'polyene antifungal' | 'other';

export interface AntibioticDef {
  key: string;
  name: string;
  className: AntibioticClass;
  synonyms: string[];
  /** Requires dose or interval adjustment in renal impairment. */
  renalAdjust: boolean;
  /** Threshold (CrCl mL/min) below which adjustment or avoidance applies. */
  renalThreshold?: number;
  renalNote?: string;
  /** Cross-reactivity groups for user-entered allergies. */
  allergyGroups: string[];
  /** Requires therapeutic drug monitoring. */
  tdm?: boolean;
  notes?: string;
}

const A = (d: AntibioticDef): AntibioticDef => d;

export const ANTIBIOTICS: AntibioticDef[] = [
  A({ key: 'benzylpenicillin', name: 'Benzylpenicillin', className: 'penicillin', synonyms: ['benzylpenicillin', 'penicillin g', 'penicillin'], renalAdjust: true, renalThreshold: 30, renalNote: 'Reduce dose in severe renal impairment; high doses risk neurotoxicity.', allergyGroups: ['penicillin', 'beta-lactam'] }),
  A({ key: 'amoxicillin', name: 'Amoxicillin', className: 'penicillin', synonyms: ['amoxicillin', 'amoxycillin', 'ampicillin'], renalAdjust: true, renalThreshold: 30, renalNote: 'Extend the dosing interval when creatinine clearance is below 30 mL/min.', allergyGroups: ['penicillin', 'beta-lactam'] }),
  A({ key: 'flucloxacillin', name: 'Flucloxacillin', className: 'penicillin', synonyms: ['flucloxacillin', 'floxacillin', 'oxacillin', 'nafcillin', 'cloxacillin'], renalAdjust: true, renalThreshold: 10, renalNote: 'Usually unchanged until creatinine clearance falls below 10 mL/min.', allergyGroups: ['penicillin', 'beta-lactam'], notes: 'Agent of choice for meticillin-susceptible Staphylococcus aureus. Monitor liver function with prolonged courses.' }),
  A({ key: 'co-amoxiclav', name: 'Co-amoxiclav', className: 'beta-lactam/beta-lactamase inhibitor', synonyms: ['co-amoxiclav', 'coamoxiclav', 'amoxicillin-clavulanate', 'amoxicillin/clavulanic acid', 'augmentin'], renalAdjust: true, renalThreshold: 30, renalNote: 'Reduce frequency when creatinine clearance is below 30 mL/min.', allergyGroups: ['penicillin', 'beta-lactam'] }),
  A({ key: 'piperacillin-tazobactam', name: 'Piperacillin-tazobactam', className: 'beta-lactam/beta-lactamase inhibitor', synonyms: ['piperacillin-tazobactam', 'piperacillin/tazobactam', 'pip-taz', 'tazocin', 'piptaz'], renalAdjust: true, renalThreshold: 40, renalNote: 'Dose reduction required below 40 mL/min; accumulation causes neurotoxicity.', allergyGroups: ['penicillin', 'beta-lactam'] }),
  A({ key: 'temocillin', name: 'Temocillin', className: 'penicillin', synonyms: ['temocillin'], renalAdjust: true, renalThreshold: 60, allergyGroups: ['penicillin', 'beta-lactam'], notes: 'Stable to ESBLs and AmpC; no anaerobic or Pseudomonas activity.' }),
  A({ key: 'cefalexin', name: 'Cefalexin', className: 'cephalosporin', synonyms: ['cefalexin', 'cephalexin', 'cefaclor', 'cefadroxil'], renalAdjust: true, renalThreshold: 40, allergyGroups: ['cephalosporin', 'beta-lactam'] }),
  A({ key: 'cefuroxime', name: 'Cefuroxime', className: 'cephalosporin', synonyms: ['cefuroxime', 'cefoxitin'], renalAdjust: true, renalThreshold: 20, allergyGroups: ['cephalosporin', 'beta-lactam'] }),
  A({ key: 'ceftriaxone', name: 'Ceftriaxone', className: 'cephalosporin', synonyms: ['ceftriaxone', 'cefotaxime'], renalAdjust: false, renalNote: 'No routine renal adjustment — biliary and renal elimination. Cap at 2 g daily where both hepatic and severe renal impairment coexist.', allergyGroups: ['cephalosporin', 'beta-lactam'], notes: 'No activity against Pseudomonas, Enterococcus or Listeria.' }),
  A({ key: 'ceftazidime', name: 'Ceftazidime', className: 'cephalosporin', synonyms: ['ceftazidime', 'ceftazidime-avibactam', 'cefepime'], renalAdjust: true, renalThreshold: 50, renalNote: 'Substantial dose reduction required; neurotoxicity with accumulation.', allergyGroups: ['cephalosporin', 'beta-lactam'], notes: 'Anti-pseudomonal; poor Gram-positive cover.' }),
  A({ key: 'meropenem', name: 'Meropenem', className: 'carbapenem', synonyms: ['meropenem', 'imipenem', 'imipenem-cilastatin', 'doripenem'], renalAdjust: true, renalThreshold: 50, renalNote: 'Dose and interval adjustment required below 50 mL/min; accumulation lowers the seizure threshold.', allergyGroups: ['carbapenem', 'beta-lactam'], notes: 'Reserve agent — de-escalate as soon as susceptibilities permit.' }),
  A({ key: 'ertapenem', name: 'Ertapenem', className: 'carbapenem', synonyms: ['ertapenem'], renalAdjust: true, renalThreshold: 30, allergyGroups: ['carbapenem', 'beta-lactam'], notes: 'No activity against Pseudomonas, Acinetobacter or Enterococcus.' }),
  A({ key: 'aztreonam', name: 'Aztreonam', className: 'monobactam', synonyms: ['aztreonam'], renalAdjust: true, renalThreshold: 30, allergyGroups: ['monobactam'], notes: 'Negligible cross-reactivity with penicillins — an option in severe beta-lactam allergy (except ceftazidime allergy, with which it shares a side chain).' }),
  A({ key: 'vancomycin', name: 'Vancomycin', className: 'glycopeptide', synonyms: ['vancomycin'], renalAdjust: true, renalThreshold: 90, tdm: true, renalNote: 'Dose entirely by level and renal function. Nephrotoxic, particularly with concomitant piperacillin-tazobactam or aminoglycosides.', allergyGroups: ['glycopeptide'] }),
  A({ key: 'teicoplanin', name: 'Teicoplanin', className: 'glycopeptide', synonyms: ['teicoplanin'], renalAdjust: true, renalThreshold: 60, tdm: true, allergyGroups: ['glycopeptide'] }),
  A({ key: 'daptomycin', name: 'Daptomycin', className: 'lipopeptide', synonyms: ['daptomycin'], renalAdjust: true, renalThreshold: 30, renalNote: 'Extend to alternate-day dosing below 30 mL/min.', allergyGroups: [], notes: 'Inactivated by pulmonary surfactant — not for pneumonia. Monitor creatine kinase weekly.' }),
  A({ key: 'linezolid', name: 'Linezolid', className: 'oxazolidinone', synonyms: ['linezolid', 'tedizolid'], renalAdjust: false, renalNote: 'No renal dose adjustment required.', allergyGroups: [], notes: 'Monitor full blood count — myelosuppression with courses beyond 10–14 days. Risk of serotonin syndrome with serotonergic drugs, and of peripheral and optic neuropathy with prolonged use.' }),
  A({ key: 'gentamicin', name: 'Gentamicin', className: 'aminoglycoside', synonyms: ['gentamicin', 'tobramycin'], renalAdjust: true, renalThreshold: 60, tdm: true, renalNote: 'Nephrotoxic and ototoxic. Extend the interval and dose strictly by level in renal impairment; avoid where possible.', allergyGroups: ['aminoglycoside'] }),
  A({ key: 'amikacin', name: 'Amikacin', className: 'aminoglycoside', synonyms: ['amikacin'], renalAdjust: true, renalThreshold: 60, tdm: true, allergyGroups: ['aminoglycoside'] }),
  A({ key: 'ciprofloxacin', name: 'Ciprofloxacin', className: 'fluoroquinolone', synonyms: ['ciprofloxacin', 'ofloxacin'], renalAdjust: true, renalThreshold: 30, allergyGroups: ['quinolone'], notes: 'Regulatory restrictions apply due to disabling and potentially irreversible musculoskeletal and neurological adverse effects. Risk of tendon rupture, aortic aneurysm, QT prolongation and Clostridioides difficile infection.' }),
  A({ key: 'levofloxacin', name: 'Levofloxacin', className: 'fluoroquinolone', synonyms: ['levofloxacin'], renalAdjust: true, renalThreshold: 50, allergyGroups: ['quinolone'] }),
  A({ key: 'moxifloxacin', name: 'Moxifloxacin', className: 'fluoroquinolone', synonyms: ['moxifloxacin'], renalAdjust: false, renalNote: 'No renal adjustment required.', allergyGroups: ['quinolone'], notes: 'Marked QT prolongation; poor urinary concentrations so unsuitable for urinary tract infection.' }),
  A({ key: 'clarithromycin', name: 'Clarithromycin', className: 'macrolide', synonyms: ['clarithromycin', 'erythromycin', 'azithromycin'], renalAdjust: true, renalThreshold: 30, allergyGroups: ['macrolide'], notes: 'Significant CYP3A4 interactions — check statins, DOACs, warfarin and immunosuppressants. QT prolongation.' }),
  A({ key: 'doxycycline', name: 'Doxycycline', className: 'tetracycline', synonyms: ['doxycycline', 'tetracycline', 'minocycline', 'lymecycline'], renalAdjust: false, renalNote: 'No renal adjustment required — a useful option in renal impairment.', allergyGroups: ['tetracycline'], notes: 'Avoid in pregnancy and in children under 12 years.' }),
  A({ key: 'tigecycline', name: 'Tigecycline', className: 'tetracycline', synonyms: ['tigecycline'], renalAdjust: false, allergyGroups: ['tetracycline'], notes: 'Low serum concentrations — not for bacteraemia. Increased all-cause mortality signal; reserve for when alternatives are unavailable.' }),
  A({ key: 'clindamycin', name: 'Clindamycin', className: 'lincosamide', synonyms: ['clindamycin'], renalAdjust: false, renalNote: 'No renal adjustment required.', allergyGroups: ['lincosamide'], notes: 'High risk of Clostridioides difficile infection. Adds toxin suppression in streptococcal and staphylococcal toxic shock.' }),
  A({ key: 'metronidazole', name: 'Metronidazole', className: 'nitroimidazole', synonyms: ['metronidazole', 'tinidazole'], renalAdjust: false, renalNote: 'No routine renal adjustment; consider reduction in end-stage renal disease.', allergyGroups: ['nitroimidazole'], notes: 'Anaerobic cover. Disulfiram-like reaction with alcohol; peripheral neuropathy with prolonged use.' }),
  A({ key: 'trimethoprim', name: 'Trimethoprim', className: 'folate pathway inhibitor', synonyms: ['trimethoprim'], renalAdjust: true, renalThreshold: 30, renalNote: 'Halve the dose after 3 days when creatinine clearance is 15–30 mL/min.', allergyGroups: ['sulfonamide/trimethoprim'], notes: 'Raises serum creatinine by inhibiting tubular secretion without reducing true GFR. Causes hyperkalaemia, particularly with ACE inhibitors or in renal impairment.' }),
  A({ key: 'co-trimoxazole', name: 'Co-trimoxazole', className: 'folate pathway inhibitor', synonyms: ['co-trimoxazole', 'cotrimoxazole', 'trimethoprim-sulfamethoxazole', 'trimethoprim/sulfamethoxazole', 'septrin', 'bactrim', 'tmp-smx'], renalAdjust: true, renalThreshold: 30, allergyGroups: ['sulfonamide/trimethoprim'], notes: 'Risk of hyperkalaemia, marrow suppression and severe cutaneous adverse reactions. Agent of choice for Stenotrophomonas and for Pneumocystis.' }),
  A({ key: 'nitrofurantoin', name: 'Nitrofurantoin', className: 'nitrofuran', synonyms: ['nitrofurantoin'], renalAdjust: true, renalThreshold: 45, renalNote: 'Avoid when creatinine clearance is below 45 mL/min — inadequate urinary concentrations and increased toxicity.', allergyGroups: [], notes: 'Lower urinary tract only. Ineffective for pyelonephritis or bacteraemia. Avoid at term in pregnancy.' }),
  A({ key: 'fosfomycin', name: 'Fosfomycin', className: 'phosphonic acid', synonyms: ['fosfomycin'], renalAdjust: true, renalThreshold: 30, allergyGroups: [], notes: 'Useful oral option for multiresistant lower urinary tract infection.' }),
  A({ key: 'rifampicin', name: 'Rifampicin', className: 'rifamycin', synonyms: ['rifampicin', 'rifampin'], renalAdjust: false, allergyGroups: [], notes: 'Never use as monotherapy — resistance emerges rapidly. Potent CYP450 inducer with extensive interactions. Excellent biofilm penetration, used in prosthetic infection.' }),
  A({ key: 'fusidicacid', name: 'Fusidic acid', className: 'fusidane', synonyms: ['fusidic acid', 'sodium fusidate'], renalAdjust: false, allergyGroups: [], notes: 'Use in combination to prevent resistance. Monitor liver function.' }),
  A({ key: 'colistin', name: 'Colistin', className: 'polymyxin', synonyms: ['colistin', 'colistimethate', 'polymyxin b', 'polymyxin e'], renalAdjust: true, renalThreshold: 60, renalNote: 'Markedly nephrotoxic and neurotoxic; dose strictly by renal function.', allergyGroups: [], notes: 'Last-line agent for carbapenem-resistant Gram-negative infection. Discuss with microbiology.' }),
  A({ key: 'chloramphenicol', name: 'Chloramphenicol', className: 'phenicol', synonyms: ['chloramphenicol'], renalAdjust: false, allergyGroups: [], notes: 'Systemic use is limited by aplastic anaemia risk.' }),
  A({ key: 'fluconazole', name: 'Fluconazole', className: 'azole antifungal', synonyms: ['fluconazole'], renalAdjust: true, renalThreshold: 50, allergyGroups: ['azole'], notes: 'No activity against Candida krusei or Aspergillus; variable against Candida glabrata. QT prolongation and CYP interactions.' }),
  A({ key: 'voriconazole', name: 'Voriconazole', className: 'azole antifungal', synonyms: ['voriconazole', 'posaconazole', 'itraconazole', 'isavuconazole'], renalAdjust: false, tdm: true, renalNote: 'Oral form needs no renal adjustment; the intravenous vehicle accumulates below 50 mL/min.', allergyGroups: ['azole'], notes: 'Therapeutic drug monitoring required. Extensive CYP interactions; visual disturbance and hepatotoxicity.' }),
  A({ key: 'caspofungin', name: 'Caspofungin', className: 'echinocandin', synonyms: ['caspofungin', 'anidulafungin', 'micafungin', 'echinocandin'], renalAdjust: false, renalNote: 'No renal adjustment required.', allergyGroups: [], notes: 'First-line for candidaemia pending identification. Poor urinary and central nervous system penetration.' }),
  A({ key: 'amphotericin', name: 'Amphotericin B', className: 'polyene antifungal', synonyms: ['amphotericin b', 'amphotericin', 'ambisome', 'liposomal amphotericin'], renalAdjust: true, renalThreshold: 60, renalNote: 'Directly nephrotoxic with potassium and magnesium wasting; liposomal formulations are less toxic.', allergyGroups: [], notes: 'Monitor renal function, potassium and magnesium daily.' }),
];

export const ANTIBIOTIC_SYNONYMS: { phrase: string; def: AntibioticDef }[] = ANTIBIOTICS
  .flatMap((def) => def.synonyms.map((phrase) => ({ phrase, def })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

export const ANTIBIOTIC_BY_KEY: Record<string, AntibioticDef> = Object.fromEntries(
  ANTIBIOTICS.map((a) => [a.key, a]),
);

export function lookupAntibiotic(raw: string): AntibioticDef | undefined {
  const s = raw.toLowerCase().replace(/[^a-z0-9/\- ]/g, '').trim();
  return ANTIBIOTIC_SYNONYMS.find((x) => s === x.phrase || s.includes(x.phrase))?.def;
}

export function lookupOrganism(raw: string): OrganismDef | undefined {
  // Collapse punctuation to spaces so "Meticillin-resistant Staphylococcus
  // aureus (MRSA)" still matches the hyphen-free synonym.
  const s = raw.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return ORGANISM_SYNONYMS.find((x) => s.includes(x.phrase))?.def;
}

// ───────────────────────────── RESISTANCE MARKERS ─────────────────────────────

export interface ResistanceMarkerDef {
  key: string;
  label: string;
  patterns: RegExp[];
  severity: 'moderate' | 'significant' | 'critical';
  implication: string;
  isolation: string;
  stewardship: string;
}

export const RESISTANCE_MARKERS: ResistanceMarkerDef[] = [
  {
    key: 'mrsa',
    label: 'Meticillin-resistant Staphylococcus aureus (MRSA)',
    patterns: [/\bmrsa\b/i, /meticillin[\s-]*resistant/i, /methicillin[\s-]*resistant/i],
    severity: 'significant',
    implication: 'All beta-lactams are ineffective irrespective of individual disc results. Glycopeptide, linezolid, daptomycin or ceftaroline therapy is required.',
    isolation: 'Contact precautions with single-room isolation where available; decolonisation per local policy.',
    stewardship: 'Confirm the source and remove any infected device. Seek infection specialist advice for bacteraemia or deep-seated infection.',
  },
  {
    key: 'esbl',
    label: 'Extended-spectrum beta-lactamase (ESBL) producer',
    patterns: [/\besbl\b/i, /extended[\s-]*spectrum beta[\s-]*lactamase/i],
    severity: 'significant',
    implication: 'Penicillins and all cephalosporins should be regarded as ineffective for serious infection even where the laboratory reports susceptibility. Carbapenems are the reliable option; temocillin, fosfomycin or nitrofurantoin may suit lower urinary tract infection.',
    isolation: 'Contact precautions and enteric precautions per local policy.',
    stewardship: 'Use the narrowest effective agent and the shortest effective course; consider oral step-down where a susceptible option exists to reduce carbapenem exposure.',
  },
  {
    key: 'ampc',
    label: 'AmpC beta-lactamase producer',
    patterns: [/\bampc\b/i, /amp[\s-]*c beta[\s-]*lactamase/i, /inducible cephalosporinase/i],
    severity: 'significant',
    implication: 'Third-generation cephalosporins may fail through derepression during therapy even when initially susceptible. Cefepime or a carbapenem is preferred for serious infection.',
    isolation: 'Standard precautions unless local policy requires otherwise.',
    stewardship: 'Avoid ceftriaxone and cefotaxime monotherapy for Enterobacter, Serratia, Citrobacter and Morganella.',
  },
  {
    key: 'cre',
    label: 'Carbapenem-resistant / carbapenemase-producing organism',
    patterns: [/\bcre\b/i, /\bcpe\b/i, /\bcpo\b/i, /carbapenem[\s-]*resistant/i, /carbapenemase/i, /\bkpc\b/i, /\bndm\b/i, /\boxa[\s-]?48\b/i, /\bvim\b/i, /\bimp\b(?!\w)/i],
    severity: 'critical',
    implication: 'Very limited therapeutic options. Requires immediate discussion with a microbiologist or infection specialist; newer beta-lactam/beta-lactamase inhibitor combinations, colistin, or combination therapy may be needed.',
    isolation: 'Single-room isolation with contact precautions and immediate notification of infection prevention and control. Screening of contacts is usually required.',
    stewardship: 'Mandatory infection specialist involvement. Review all indwelling devices and ensure source control.',
  },
  {
    key: 'vre',
    label: 'Vancomycin-resistant Enterococcus (VRE / GRE)',
    patterns: [/\bvre\b/i, /\bgre\b/i, /vancomycin[\s-]*resistant enterococc/i, /glycopeptide[\s-]*resistant enterococc/i],
    severity: 'significant',
    implication: 'Glycopeptides are ineffective. Linezolid or daptomycin are the usual options depending on site.',
    isolation: 'Contact precautions with single-room isolation; environmental decontamination is important.',
    stewardship: 'Reduce unnecessary glycopeptide and cephalosporin exposure, which drive VRE acquisition.',
  },
  {
    key: 'mdr',
    label: 'Multidrug-resistant organism',
    patterns: [/multi[\s-]*drug[\s-]*resistant/i, /\bmdr\b/i, /\bxdr\b/i, /extensively drug[\s-]*resistant/i, /\bpan[\s-]*resistant\b/i],
    severity: 'critical',
    implication: 'Non-susceptibility to agents in three or more antimicrobial classes. Therapeutic options are constrained and specialist input is required.',
    isolation: 'Contact precautions and notification of infection prevention and control.',
    stewardship: 'Formal infection specialist review of the antimicrobial plan is required.',
  },
  {
    key: 'pvl',
    label: 'Panton-Valentine leukocidin (PVL) positive Staphylococcus aureus',
    patterns: [/\bpvl\b/i, /panton[\s-]*valentine/i],
    severity: 'critical',
    implication: 'Associated with recurrent severe skin and soft tissue infection and with necrotising pneumonia. Toxin-suppressing therapy (clindamycin or linezolid) is added and specialist advice is required.',
    isolation: 'Contact precautions; household screening and decolonisation are usually indicated.',
    stewardship: 'Notify infection specialist and infection prevention and control.',
  },
];

export function detectResistanceMarkers(text: string): ResistanceMarkerDef[] {
  return RESISTANCE_MARKERS.filter((m) => m.patterns.some((p) => p.test(text)));
}

/** Allergy cross-reactivity guidance for user-entered allergies. */
export function allergyConflict(drug: AntibioticDef, allergies: string[]): string | null {
  const a = allergies.map((x) => x.toLowerCase().trim()).filter(Boolean);
  if (!a.length) return null;

  const direct = a.find((x) => drug.synonyms.some((s) => s.includes(x) || x.includes(s)) || drug.name.toLowerCase().includes(x));
  if (direct) return `Recorded allergy to "${direct}" — this is the same agent. Do not use.`;

  const groupHit = a.find((x) => drug.allergyGroups.some((g) => g.includes(x) || x.includes(g.split('/')[0])));
  if (groupHit) return `Recorded allergy to "${groupHit}" — same antimicrobial group (${drug.allergyGroups.join(', ')}).`;

  const penAllergy = a.some((x) => /penicillin|amoxicillin|augmentin|co-amoxiclav|flucloxacillin/.test(x));
  if (penAllergy && drug.allergyGroups.includes('cephalosporin')) {
    return 'Recorded penicillin allergy — cephalosporin cross-reactivity is low (approximately 1–3%) and is side-chain dependent. Usually acceptable where the reaction was non-severe, but avoid where there is a history of anaphylaxis without specialist advice.';
  }
  if (penAllergy && drug.allergyGroups.includes('carbapenem')) {
    return 'Recorded penicillin allergy — carbapenem cross-reactivity is under 1%. Generally acceptable, but confirm the nature of the original reaction.';
  }
  return null;
}
