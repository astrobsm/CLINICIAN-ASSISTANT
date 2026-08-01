// src/clinical/referenceRanges.ts
var D = (d) => d;
var ANALYTES = [
  // ─────────────────────────── FULL BLOOD COUNT ───────────────────────────
  D({
    key: "hb",
    label: "Haemoglobin",
    module: "fbc",
    unitRule: "hb",
    unit: "g/dL",
    synonyms: ["haemoglobin", "hemoglobin", "haemoglobin (hb)", "hgb", "hb"],
    refMale: { low: 13, high: 17 },
    refFemale: { low: 11.5, high: 15.5 },
    crit: { low: 7, high: 20 },
    lifeThreat: { low: 5, high: 22 },
    decimals: 1,
    plausible: { low: 1, high: 30 }
  }),
  D({
    key: "hct",
    label: "Packed Cell Volume (PCV/Haematocrit)",
    module: "fbc",
    unitRule: "hct",
    unit: "%",
    synonyms: ["packed cell volume", "haematocrit", "hematocrit", "heamatocrit", "haematocrit (pcv)", "pcv", "hct"],
    refMale: { low: 40, high: 52 },
    refFemale: { low: 36, high: 47 },
    crit: { low: 21, high: 60 },
    decimals: 1,
    plausible: { low: 5, high: 80 }
  }),
  D({
    key: "rbc",
    label: "Red Blood Cell Count",
    module: "fbc",
    unitRule: "rbc",
    unit: "x10^12/L",
    synonyms: ["red blood cell count", "red cell count", "erythrocyte count", "rbc count", "rbc"],
    refMale: { low: 4.5, high: 6.5 },
    refFemale: { low: 3.8, high: 5.8 },
    decimals: 2,
    plausible: { low: 0.5, high: 12 }
  }),
  D({
    key: "mcv",
    label: "Mean Cell Volume",
    module: "fbc",
    unitRule: "mcv",
    unit: "fL",
    synonyms: ["mean cell volume", "mean corpuscular volume", "mcv"],
    ref: { low: 80, high: 100 },
    decimals: 1,
    plausible: { low: 40, high: 160 }
  }),
  D({
    key: "mch",
    label: "Mean Cell Haemoglobin",
    module: "fbc",
    unitRule: "mch",
    unit: "pg",
    synonyms: ["mean cell haemoglobin concentration", "mean cell haemoglobin", "mean corpuscular hemoglobin", "mch"],
    ref: { low: 27, high: 32 },
    decimals: 1,
    plausible: { low: 10, high: 50 }
  }),
  D({
    key: "mchc",
    label: "Mean Cell Haemoglobin Concentration",
    module: "fbc",
    unitRule: "mchc",
    unit: "g/dL",
    synonyms: ["mean cell haemoglobin concentration", "mean corpuscular hemoglobin concentration", "mchc"],
    ref: { low: 32, high: 36 },
    decimals: 1,
    plausible: { low: 20, high: 45 }
  }),
  D({
    key: "rdw",
    label: "Red Cell Distribution Width",
    module: "fbc",
    unitRule: "rdw",
    unit: "%",
    synonyms: ["red cell distribution width", "rdw-cv", "rdw cv", "rdw-sd", "rdw"],
    ref: { low: 11.5, high: 14.5 },
    decimals: 1,
    plausible: { low: 8, high: 40 }
  }),
  D({
    key: "wbc",
    label: "White Blood Cell Count",
    module: "fbc",
    unitRule: "wbc",
    unit: "x10^9/L",
    synonyms: ["white blood cell count", "white cell count", "total leucocyte count", "total leukocyte count", "leucocyte count", "wbc count", "tlc", "wbc"],
    ref: { low: 4, high: 11 },
    crit: { low: 1.5, high: 30 },
    lifeThreat: { low: 0.5, high: 100 },
    decimals: 1,
    plausible: { low: 0.05, high: 500 }
  }),
  D({
    key: "neut",
    label: "Neutrophils (absolute)",
    module: "fbc",
    unitRule: "wbc",
    unit: "x10^9/L",
    synonyms: ["absolute neutrophil count", "neutrophils absolute", "neutrophil count", "neutrophils", "neutrophil", "anc"],
    ref: { low: 2, high: 7.5 },
    crit: { low: 0.5 },
    lifeThreat: { low: 0.2 },
    decimals: 2,
    plausible: { low: 0, high: 300 }
  }),
  D({
    key: "lymph",
    label: "Lymphocytes (absolute)",
    module: "fbc",
    unitRule: "wbc",
    unit: "x10^9/L",
    synonyms: ["absolute lymphocyte count", "lymphocytes absolute", "lymphocyte count", "lymphocytes", "lymphocyte"],
    ref: { low: 1, high: 4 },
    decimals: 2,
    plausible: { low: 0, high: 300 }
  }),
  D({
    key: "mono",
    label: "Monocytes (absolute)",
    module: "fbc",
    unitRule: "wbc",
    unit: "x10^9/L",
    synonyms: ["monocyte count", "monocytes", "monocyte"],
    ref: { low: 0.2, high: 0.8 },
    decimals: 2,
    plausible: { low: 0, high: 100 }
  }),
  D({
    key: "eos",
    label: "Eosinophils (absolute)",
    module: "fbc",
    unitRule: "wbc",
    unit: "x10^9/L",
    synonyms: ["eosinophil count", "eosinophils", "eosinophil"],
    ref: { low: 0.04, high: 0.4 },
    decimals: 2,
    plausible: { low: 0, high: 100 }
  }),
  D({
    key: "baso",
    label: "Basophils (absolute)",
    module: "fbc",
    unitRule: "wbc",
    unit: "x10^9/L",
    synonyms: ["basophil count", "basophils", "basophil"],
    ref: { low: 0, high: 0.1 },
    decimals: 2,
    plausible: { low: 0, high: 50 }
  }),
  D({
    key: "plt",
    label: "Platelet Count",
    module: "fbc",
    unitRule: "plt",
    unit: "x10^9/L",
    synonyms: ["platelet count", "platelets", "platelet", "thrombocyte count", "thrombocytes", "plt"],
    ref: { low: 150, high: 400 },
    crit: { low: 50, high: 1e3 },
    lifeThreat: { low: 20, high: 1500 },
    decimals: 0,
    plausible: { low: 1, high: 3e3 }
  }),
  D({
    key: "mpv",
    label: "Mean Platelet Volume",
    module: "fbc",
    unitRule: "mcv",
    unit: "fL",
    synonyms: ["mean platelet volume", "mpv"],
    ref: { low: 7.5, high: 11.5 },
    decimals: 1,
    plausible: { low: 3, high: 25 }
  }),
  D({
    key: "pdw",
    label: "Platelet Distribution Width",
    module: "fbc",
    unitRule: "percent",
    unit: "%",
    synonyms: ["platelet distribution width", "pdw"],
    ref: { low: 9, high: 17 },
    decimals: 1,
    plausible: { low: 2, high: 40 }
  }),
  D({
    key: "pct",
    label: "Plateletcrit",
    module: "fbc",
    unitRule: "percent",
    unit: "%",
    synonyms: ["plateletcrit", "pct%"],
    ref: { low: 0.17, high: 0.35 },
    decimals: 2,
    plausible: { low: 0, high: 3 }
  }),
  D({
    key: "retic",
    label: "Reticulocyte Count",
    module: "fbc",
    unitRule: "percent",
    unit: "%",
    synonyms: ["reticulocyte count", "reticulocytes", "retic count", "retics"],
    ref: { low: 0.5, high: 2.5 },
    decimals: 2,
    plausible: { low: 0, high: 60 }
  }),
  D({
    key: "nrbc",
    label: "Nucleated Red Cells",
    module: "fbc",
    unitRule: "ratio",
    unit: "/100 WBC",
    synonyms: ["nucleated red blood cells", "nucleated red cells", "nucleated rbc", "nrbc"],
    ref: { low: 0, high: 0 },
    decimals: 1,
    plausible: { low: 0, high: 500 }
  }),
  D({
    key: "ig",
    label: "Immature Granulocytes",
    module: "fbc",
    unitRule: "percent",
    unit: "%",
    synonyms: ["immature granulocytes", "immature granulocyte", "ig%", "ig"],
    ref: { low: 0, high: 0.5 },
    decimals: 2,
    plausible: { low: 0, high: 60 }
  }),
  D({
    key: "blasts",
    label: "Blast Cells",
    module: "fbc",
    unitRule: "percent",
    unit: "%",
    synonyms: ["blast cells", "blasts"],
    ref: { low: 0, high: 0 },
    decimals: 1,
    plausible: { low: 0, high: 100 }
  }),
  D({
    key: "bands",
    label: "Band Forms",
    module: "fbc",
    unitRule: "percent",
    unit: "%",
    synonyms: ["band forms", "band cells", "stab cells", "bands"],
    ref: { low: 0, high: 6 },
    decimals: 1,
    plausible: { low: 0, high: 80 }
  }),
  // ─────────────────────────── COAGULATION ───────────────────────────
  D({
    key: "pt",
    label: "Prothrombin Time",
    module: "coagulation",
    unitRule: "seconds",
    unit: "s",
    synonyms: ["prothrombin time", "pt (prothrombin time)", "pro-time", "pt"],
    ref: { low: 11, high: 14 },
    crit: { high: 30 },
    decimals: 1,
    plausible: { low: 5, high: 200 }
  }),
  D({
    key: "inr",
    label: "INR",
    module: "coagulation",
    unitRule: "ratio",
    unit: "",
    synonyms: ["international normalised ratio", "international normalized ratio", "inr"],
    ref: { low: 0.8, high: 1.2 },
    crit: { high: 4.5 },
    lifeThreat: { high: 8 },
    decimals: 2,
    plausible: { low: 0.4, high: 20 }
  }),
  D({
    key: "aptt",
    label: "aPTT",
    module: "coagulation",
    unitRule: "seconds",
    unit: "s",
    synonyms: ["activated partial thromboplastin time", "partial thromboplastin time", "aptt", "appt", "ptt"],
    ref: { low: 25, high: 35 },
    crit: { high: 90 },
    decimals: 1,
    plausible: { low: 8, high: 300 }
  }),
  D({
    key: "apttRatio",
    label: "aPTT Ratio",
    module: "coagulation",
    unitRule: "ratio",
    unit: "",
    synonyms: ["aptt ratio", "appt ratio", "ptt ratio"],
    ref: { low: 0.8, high: 1.2 },
    decimals: 2,
    plausible: { low: 0.3, high: 12 }
  }),
  D({
    key: "tt",
    label: "Thrombin Time",
    module: "coagulation",
    unitRule: "seconds",
    unit: "s",
    synonyms: ["thrombin time", "tt"],
    ref: { low: 14, high: 19 },
    decimals: 1,
    plausible: { low: 5, high: 200 }
  }),
  D({
    key: "fibrinogen",
    label: "Fibrinogen",
    module: "coagulation",
    unitRule: "fibrinogen",
    unit: "g/L",
    synonyms: ["fibrinogen level", "fibrinogen"],
    ref: { low: 2, high: 4 },
    crit: { low: 1 },
    lifeThreat: { low: 0.5 },
    decimals: 2,
    plausible: { low: 0.05, high: 15 }
  }),
  D({
    key: "ddimer",
    label: "D-Dimer",
    module: "coagulation",
    unitRule: "ddimer",
    unit: "mg/L FEU",
    synonyms: ["d-dimer", "d dimer", "ddimer"],
    ref: { high: 0.5 },
    decimals: 2,
    plausible: { low: 0, high: 200 }
  }),
  D({
    key: "antixa",
    label: "Anti-Xa Activity",
    module: "coagulation",
    unitRule: "antixa",
    unit: "IU/mL",
    synonyms: ["anti-xa activity", "anti xa level", "anti-factor xa", "anti-xa", "anti xa"],
    ref: { low: 0.5, high: 1 },
    decimals: 2,
    plausible: { low: 0, high: 5 }
  }),
  D({
    key: "bleedingTime",
    label: "Bleeding Time",
    module: "coagulation",
    unitRule: "ratio",
    unit: "min",
    synonyms: ["bleeding time", "bt (bleeding time)"],
    ref: { low: 2, high: 7 },
    decimals: 1,
    plausible: { low: 0, high: 60 }
  }),
  D({
    key: "clottingTime",
    label: "Clotting Time",
    module: "coagulation",
    unitRule: "ratio",
    unit: "min",
    synonyms: ["clotting time", "coagulation time", "ct (clotting time)"],
    ref: { low: 4, high: 10 },
    decimals: 1,
    plausible: { low: 0, high: 60 }
  }),
  // ─────────────────────────── RENAL ───────────────────────────
  D({
    key: "creatinine",
    label: "Creatinine",
    module: "renal",
    unitRule: "creatinine",
    unit: "umol/L",
    synonyms: ["serum creatinine", "creatinine (serum)", "creat", "creatinine"],
    refMale: { low: 60, high: 110 },
    refFemale: { low: 45, high: 90 },
    crit: { high: 350 },
    lifeThreat: { high: 700 },
    decimals: 0,
    plausible: { low: 5, high: 3e3 }
  }),
  D({
    key: "urea",
    label: "Urea",
    module: "renal",
    unitRule: "urea",
    unit: "mmol/L",
    synonyms: ["blood urea nitrogen", "serum urea", "urea nitrogen", "urea", "bun"],
    ref: { low: 2.5, high: 7.8 },
    crit: { high: 30 },
    decimals: 1,
    plausible: { low: 0.2, high: 120 }
  }),
  D({
    key: "egfr",
    label: "eGFR (reported)",
    module: "renal",
    unitRule: "ratio",
    unit: "mL/min/1.73m\xB2",
    synonyms: ["estimated gfr", "egfr (ckd-epi)", "egfr (mdrd)", "gfr estimated", "egfr", "gfr"],
    ref: { low: 90 },
    crit: { low: 15 },
    decimals: 0,
    plausible: { low: 1, high: 200 }
  }),
  D({
    key: "cystatinC",
    label: "Cystatin C",
    module: "renal",
    unitRule: "ratio",
    unit: "mg/L",
    synonyms: ["cystatin c", "cystatin-c"],
    ref: { low: 0.6, high: 1 },
    decimals: 2,
    plausible: { low: 0.1, high: 12 }
  }),
  D({
    key: "uricAcid",
    label: "Uric Acid",
    module: "renal",
    unitRule: "creatinine",
    unit: "umol/L",
    synonyms: ["uric acid", "urate"],
    refMale: { low: 200, high: 430 },
    refFemale: { low: 140, high: 360 },
    decimals: 0,
    plausible: { low: 10, high: 2e3 }
  }),
  D({
    key: "urineOutput",
    label: "Urine Output",
    module: "renal",
    unitRule: "ratio",
    unit: "mL/kg/h",
    synonyms: ["urine output", "uo (ml/kg/h)"],
    ref: { low: 0.5 },
    decimals: 2,
    plausible: { low: 0, high: 10 }
  }),
  // ─────────────────────────── ELECTROLYTES ───────────────────────────
  D({
    key: "na",
    label: "Sodium",
    module: "electrolytes",
    unitRule: "calcium",
    unit: "mmol/L",
    synonyms: ["serum sodium", "sodium (na)", "sodium", "na+", "na"],
    ref: { low: 135, high: 145 },
    crit: { low: 125, high: 155 },
    lifeThreat: { low: 120, high: 160 },
    decimals: 0,
    plausible: { low: 90, high: 200 }
  }),
  D({
    key: "k",
    label: "Potassium",
    module: "electrolytes",
    unitRule: "calcium",
    unit: "mmol/L",
    synonyms: ["serum potassium", "potassium (k)", "potassium", "k+", "k"],
    ref: { low: 3.5, high: 5 },
    crit: { low: 2.5, high: 6 },
    lifeThreat: { low: 2, high: 6.5 },
    decimals: 1,
    plausible: { low: 1, high: 12 }
  }),
  D({
    key: "cl",
    label: "Chloride",
    module: "electrolytes",
    unitRule: "calcium",
    unit: "mmol/L",
    synonyms: ["serum chloride", "chloride (cl)", "chloride", "cl-", "cl"],
    ref: { low: 98, high: 107 },
    decimals: 0,
    plausible: { low: 50, high: 160 }
  }),
  D({
    key: "hco3",
    label: "Bicarbonate",
    module: "electrolytes",
    unitRule: "calcium",
    unit: "mmol/L",
    synonyms: ["bicarbonate", "total co2", "tco2", "hco3-", "hco3"],
    ref: { low: 22, high: 29 },
    crit: { low: 10, high: 40 },
    decimals: 1,
    plausible: { low: 2, high: 60 }
  }),
  D({
    key: "calcium",
    label: "Calcium (total)",
    module: "electrolytes",
    unitRule: "calcium",
    unit: "mmol/L",
    synonyms: ["total calcium", "serum calcium", "calcium (total)", "calcium", "ca2+", "ca"],
    ref: { low: 2.2, high: 2.6 },
    crit: { low: 1.8, high: 3 },
    lifeThreat: { low: 1.6, high: 3.5 },
    decimals: 2,
    plausible: { low: 0.5, high: 6 }
  }),
  D({
    key: "ionisedCalcium",
    label: "Ionised Calcium",
    module: "electrolytes",
    unitRule: "calcium",
    unit: "mmol/L",
    synonyms: ["ionised calcium", "ionized calcium", "free calcium", "ica"],
    ref: { low: 1.15, high: 1.3 },
    crit: { low: 0.9, high: 1.6 },
    decimals: 2,
    plausible: { low: 0.2, high: 3 }
  }),
  D({
    key: "magnesium",
    label: "Magnesium",
    module: "electrolytes",
    unitRule: "magnesium",
    unit: "mmol/L",
    synonyms: ["serum magnesium", "magnesium (mg)", "magnesium", "mg2+"],
    ref: { low: 0.7, high: 1 },
    crit: { low: 0.4, high: 2 },
    decimals: 2,
    plausible: { low: 0.05, high: 6 }
  }),
  D({
    key: "phosphate",
    label: "Phosphate",
    module: "electrolytes",
    unitRule: "phosphate",
    unit: "mmol/L",
    synonyms: ["inorganic phosphate", "serum phosphate", "phosphorus", "phosphate", "po4"],
    ref: { low: 0.8, high: 1.45 },
    crit: { low: 0.32 },
    decimals: 2,
    plausible: { low: 0.05, high: 8 }
  }),
  D({
    key: "osmolality",
    label: "Serum Osmolality",
    module: "electrolytes",
    unitRule: "ratio",
    unit: "mOsm/kg",
    synonyms: ["serum osmolality", "plasma osmolality", "osmolality"],
    ref: { low: 275, high: 295 },
    decimals: 0,
    plausible: { low: 200, high: 450 }
  }),
  D({
    key: "glucose",
    label: "Glucose",
    module: "electrolytes",
    unitRule: "glucose",
    unit: "mmol/L",
    synonyms: ["random blood glucose", "blood glucose", "serum glucose", "glucose", "rbs"],
    ref: { low: 3.9, high: 7.8 },
    crit: { low: 3, high: 20 },
    lifeThreat: { low: 2.2, high: 30 },
    decimals: 1,
    plausible: { low: 0.3, high: 80 }
  }),
  // ─────────────────────────── LIVER ───────────────────────────
  D({
    key: "alt",
    label: "ALT",
    module: "lft",
    unitRule: "enzyme",
    unit: "U/L",
    synonyms: ["alanine aminotransferase", "alanine transaminase", "sgpt", "alt"],
    ref: { low: 0, high: 40 },
    crit: { high: 1e3 },
    decimals: 0,
    plausible: { low: 0, high: 2e4 }
  }),
  D({
    key: "ast",
    label: "AST",
    module: "lft",
    unitRule: "enzyme",
    unit: "U/L",
    synonyms: ["aspartate aminotransferase", "aspartate transaminase", "sgot", "ast"],
    ref: { low: 0, high: 40 },
    crit: { high: 1e3 },
    decimals: 0,
    plausible: { low: 0, high: 2e4 }
  }),
  D({
    key: "alp",
    label: "Alkaline Phosphatase",
    module: "lft",
    unitRule: "enzyme",
    unit: "U/L",
    synonyms: ["alkaline phosphatase", "alk phos", "alk. phos", "alp"],
    ref: { low: 30, high: 130 },
    decimals: 0,
    plausible: { low: 2, high: 5e3 }
  }),
  D({
    key: "ggt",
    label: "Gamma GT",
    module: "lft",
    unitRule: "enzyme",
    unit: "U/L",
    synonyms: ["gamma glutamyl transpeptidase", "gamma glutamyl transferase", "gamma-glutamyl transferase", "gamma gt", "gamma-gt", "g-gt", "ggt"],
    refMale: { low: 10, high: 71 },
    refFemale: { low: 6, high: 42 },
    decimals: 0,
    plausible: { low: 1, high: 5e3 }
  }),
  D({
    key: "bilirubinTotal",
    label: "Bilirubin (total)",
    module: "lft",
    unitRule: "bilirubinTotal",
    unit: "umol/L",
    synonyms: ["total bilirubin", "bilirubin total", "serum bilirubin", "bilirubin"],
    ref: { low: 3, high: 21 },
    crit: { high: 250 },
    decimals: 0,
    plausible: { low: 0, high: 1200 }
  }),
  D({
    key: "bilirubinDirect",
    label: "Bilirubin (conjugated)",
    module: "lft",
    unitRule: "bilirubinDirect",
    unit: "umol/L",
    synonyms: ["direct bilirubin", "conjugated bilirubin", "bilirubin direct"],
    ref: { low: 0, high: 7 },
    decimals: 0,
    plausible: { low: 0, high: 1e3 }
  }),
  D({
    key: "albumin",
    label: "Albumin",
    module: "lft",
    unitRule: "albumin",
    unit: "g/L",
    synonyms: ["serum albumin", "albumin"],
    ref: { low: 35, high: 50 },
    crit: { low: 20 },
    decimals: 0,
    plausible: { low: 3, high: 90 }
  }),
  D({
    key: "totalProtein",
    label: "Total Protein",
    module: "lft",
    unitRule: "totalProtein",
    unit: "g/L",
    synonyms: ["total protein", "serum protein"],
    ref: { low: 60, high: 80 },
    decimals: 0,
    plausible: { low: 10, high: 140 }
  }),
  // ─────────────────────────── ARTERIAL BLOOD GAS ───────────────────────────
  D({
    key: "ph",
    label: "pH",
    module: "abg",
    unitRule: "ratio",
    unit: "",
    synonyms: ["blood ph", "ph"],
    ref: { low: 7.35, high: 7.45 },
    crit: { low: 7.2, high: 7.55 },
    lifeThreat: { low: 7.1, high: 7.6 },
    decimals: 2,
    plausible: { low: 6.5, high: 8 }
  }),
  D({
    key: "paco2",
    label: "PaCO\u2082",
    module: "abg",
    unitRule: "gasTension",
    unit: "kPa",
    synonyms: ["pco2", "paco2", "p co2", "carbon dioxide tension"],
    ref: { low: 4.7, high: 6 },
    crit: { low: 3, high: 8 },
    lifeThreat: { high: 10 },
    decimals: 1,
    plausible: { low: 0.5, high: 25 }
  }),
  D({
    key: "pao2",
    label: "PaO\u2082",
    module: "abg",
    unitRule: "gasTension",
    unit: "kPa",
    synonyms: ["po2", "pao2", "p o2", "oxygen tension"],
    ref: { low: 10.6, high: 13.3 },
    crit: { low: 8 },
    lifeThreat: { low: 6 },
    decimals: 1,
    plausible: { low: 1, high: 90 }
  }),
  D({
    key: "baseExcess",
    label: "Base Excess",
    module: "abg",
    unitRule: "calcium",
    unit: "mmol/L",
    synonyms: ["base excess", "standard base excess", "abe", "sbe", "be"],
    ref: { low: -2, high: 2 },
    crit: { low: -10, high: 10 },
    decimals: 1,
    plausible: { low: -40, high: 40 }
  }),
  D({
    key: "lactate",
    label: "Lactate",
    module: "abg",
    unitRule: "lactate",
    unit: "mmol/L",
    synonyms: ["serum lactate", "blood lactate", "lactate", "lac"],
    ref: { low: 0.5, high: 2 },
    crit: { high: 4 },
    lifeThreat: { high: 10 },
    decimals: 1,
    plausible: { low: 0, high: 40 }
  }),
  D({
    key: "sao2",
    label: "Oxygen Saturation",
    module: "abg",
    unitRule: "percent",
    unit: "%",
    synonyms: ["oxygen saturation", "o2 saturation", "spo2", "sao2", "so2"],
    ref: { low: 94, high: 100 },
    crit: { low: 88 },
    lifeThreat: { low: 80 },
    decimals: 0,
    plausible: { low: 20, high: 100 }
  }),
  D({
    key: "fio2",
    label: "FiO\u2082",
    module: "abg",
    unitRule: "percent",
    unit: "%",
    synonyms: ["inspired oxygen", "fio2"],
    ref: { low: 21, high: 21 },
    decimals: 0,
    plausible: { low: 21, high: 100 }
  }),
  D({
    key: "cohb",
    label: "Carboxyhaemoglobin",
    module: "abg",
    unitRule: "percent",
    unit: "%",
    synonyms: ["carboxyhaemoglobin", "carboxyhemoglobin", "cohb"],
    ref: { low: 0, high: 2 },
    crit: { high: 15 },
    decimals: 1,
    plausible: { low: 0, high: 90 }
  }),
  D({
    key: "methb",
    label: "Methaemoglobin",
    module: "abg",
    unitRule: "percent",
    unit: "%",
    synonyms: ["methaemoglobin", "methemoglobin", "methb"],
    ref: { low: 0, high: 1.5 },
    crit: { high: 20 },
    decimals: 1,
    plausible: { low: 0, high: 90 }
  }),
  // ─────────────────────────── URINALYSIS (numeric) ───────────────────────────
  D({
    key: "uPh",
    label: "Urine pH",
    module: "urinalysis",
    unitRule: "ratio",
    unit: "",
    synonyms: ["urine ph"],
    ref: { low: 4.5, high: 8 },
    decimals: 1,
    plausible: { low: 3, high: 10 }
  }),
  D({
    key: "uSg",
    label: "Urine Specific Gravity",
    module: "urinalysis",
    unitRule: "ratio",
    unit: "",
    synonyms: ["specific gravity", "sp. gravity", "sg"],
    ref: { low: 1.005, high: 1.03 },
    decimals: 3,
    plausible: { low: 1, high: 1.06 }
  }),
  D({
    key: "uAcr",
    label: "Urine Albumin:Creatinine Ratio",
    module: "urinalysis",
    unitRule: "ratio",
    unit: "mg/mmol",
    synonyms: ["albumin creatinine ratio", "albumin:creatinine ratio", "acr"],
    ref: { high: 3 },
    decimals: 1,
    plausible: { low: 0, high: 2e3 }
  }),
  D({
    key: "uPcr",
    label: "Urine Protein:Creatinine Ratio",
    module: "urinalysis",
    unitRule: "ratio",
    unit: "mg/mmol",
    synonyms: ["protein creatinine ratio", "protein:creatinine ratio", "pcr"],
    ref: { high: 15 },
    decimals: 1,
    plausible: { low: 0, high: 3e3 }
  }),
  // ─────────────────────────── INFLAMMATORY ───────────────────────────
  D({
    key: "crp",
    label: "C-Reactive Protein",
    module: "inflammatory",
    unitRule: "crp",
    unit: "mg/L",
    synonyms: ["c-reactive protein", "c reactive protein", "hs-crp", "crp"],
    ref: { high: 5 },
    crit: { high: 200 },
    decimals: 1,
    plausible: { low: 0, high: 800 }
  }),
  D({
    key: "esr",
    label: "ESR",
    module: "inflammatory",
    unitRule: "ratio",
    unit: "mm/hr",
    synonyms: ["erythrocyte sedimentation rate", "sedimentation rate", "esr"],
    refMale: { high: 15 },
    refFemale: { high: 20 },
    decimals: 0,
    plausible: { low: 0, high: 200 }
  }),
  D({
    key: "procalcitonin",
    label: "Procalcitonin",
    module: "inflammatory",
    unitRule: "procalcitonin",
    unit: "ng/mL",
    synonyms: ["procalcitonin", "pct (procalcitonin)"],
    ref: { high: 0.5 },
    crit: { high: 10 },
    decimals: 2,
    plausible: { low: 0, high: 1e3 }
  }),
  D({
    key: "ferritin",
    label: "Ferritin",
    module: "inflammatory",
    unitRule: "ferritin",
    unit: "ug/L",
    synonyms: ["serum ferritin", "ferritin"],
    refMale: { low: 30, high: 400 },
    refFemale: { low: 15, high: 200 },
    decimals: 0,
    plausible: { low: 1, high: 1e5 }
  }),
  D({
    key: "iron",
    label: "Serum Iron",
    module: "inflammatory",
    unitRule: "creatinine",
    unit: "umol/L",
    synonyms: ["serum iron", "iron"],
    ref: { low: 10, high: 30 },
    decimals: 1,
    plausible: { low: 0.5, high: 200 }
  }),
  D({
    key: "tsat",
    label: "Transferrin Saturation",
    module: "inflammatory",
    unitRule: "percent",
    unit: "%",
    synonyms: ["transferrin saturation", "tsat", "iron saturation"],
    ref: { low: 20, high: 45 },
    decimals: 0,
    plausible: { low: 0, high: 100 }
  }),
  D({
    key: "b12",
    label: "Vitamin B12",
    module: "inflammatory",
    unitRule: "ratio",
    unit: "ng/L",
    synonyms: ["vitamin b12", "vit b12", "cobalamin", "b12"],
    ref: { low: 200, high: 900 },
    decimals: 0,
    plausible: { low: 20, high: 5e3 }
  }),
  D({
    key: "folate",
    label: "Serum Folate",
    module: "inflammatory",
    unitRule: "ratio",
    unit: "ug/L",
    synonyms: ["serum folate", "folate"],
    ref: { low: 3, high: 20 },
    decimals: 1,
    plausible: { low: 0.1, high: 60 }
  }),
  // ─────────────────────────── CARDIAC ───────────────────────────
  D({
    key: "troponin",
    label: "Troponin (high sensitivity)",
    module: "cardiac",
    unitRule: "troponin",
    unit: "ng/L",
    synonyms: ["high sensitivity troponin t", "high sensitivity troponin i", "hs-troponin t", "hs-troponin i", "hs-ctnt", "hs-ctni", "troponin t", "troponin i", "troponin"],
    ref: { high: 14 },
    crit: { high: 100 },
    decimals: 0,
    plausible: { low: 0, high: 5e5 }
  }),
  D({
    key: "ckmb",
    label: "CK-MB",
    module: "cardiac",
    unitRule: "enzyme",
    unit: "U/L",
    synonyms: ["ck-mb", "ck mb", "creatine kinase mb"],
    ref: { high: 25 },
    decimals: 0,
    plausible: { low: 0, high: 3e3 }
  }),
  D({
    key: "ck",
    label: "Creatine Kinase",
    module: "cardiac",
    unitRule: "enzyme",
    unit: "U/L",
    synonyms: ["creatine kinase", "creatinine kinase", "cpk", "ck"],
    refMale: { low: 40, high: 320 },
    refFemale: { low: 25, high: 200 },
    crit: { high: 5e3 },
    decimals: 0,
    plausible: { low: 5, high: 5e5 }
  }),
  D({
    key: "bnp",
    label: "BNP",
    module: "cardiac",
    unitRule: "bnp",
    unit: "pg/mL",
    synonyms: ["b-type natriuretic peptide", "brain natriuretic peptide", "bnp"],
    ref: { high: 100 },
    decimals: 0,
    plausible: { low: 0, high: 4e4 }
  }),
  D({
    key: "ntprobnp",
    label: "NT-proBNP",
    module: "cardiac",
    unitRule: "ntprobnp",
    unit: "pg/mL",
    synonyms: ["nt-probnp", "nt probnp", "n-terminal probnp", "probnp"],
    ref: { high: 125 },
    decimals: 0,
    plausible: { low: 0, high: 1e5 }
  }),
  // ─────────────────────────── ECG (numeric) ───────────────────────────
  D({
    key: "ecgRate",
    label: "Heart Rate",
    module: "ecg",
    unitRule: "ratio",
    unit: "bpm",
    synonyms: ["ventricular rate", "heart rate", "atrial rate", "rate"],
    ref: { low: 60, high: 100 },
    crit: { low: 40, high: 150 },
    lifeThreat: { low: 30, high: 180 },
    decimals: 0,
    plausible: { low: 10, high: 320 }
  }),
  D({
    key: "ecgPr",
    label: "PR Interval",
    module: "ecg",
    unitRule: "ratio",
    unit: "ms",
    synonyms: ["pr interval", "p-r interval", "pr"],
    ref: { low: 120, high: 200 },
    decimals: 0,
    plausible: { low: 40, high: 600 }
  }),
  D({
    key: "ecgQrs",
    label: "QRS Duration",
    module: "ecg",
    unitRule: "ratio",
    unit: "ms",
    synonyms: ["qrs duration", "qrs interval", "qrs"],
    ref: { low: 60, high: 110 },
    crit: { high: 160 },
    decimals: 0,
    plausible: { low: 30, high: 400 }
  }),
  D({
    key: "ecgQt",
    label: "QT Interval",
    module: "ecg",
    unitRule: "ratio",
    unit: "ms",
    synonyms: ["qt interval", "qt"],
    ref: { low: 350, high: 450 },
    decimals: 0,
    plausible: { low: 150, high: 800 }
  }),
  D({
    key: "ecgQtc",
    label: "QTc Interval",
    module: "ecg",
    unitRule: "ratio",
    unit: "ms",
    synonyms: ["qtc interval", "qtcb", "qtcf", "qtc"],
    refMale: { low: 350, high: 450 },
    refFemale: { low: 350, high: 470 },
    crit: { high: 500 },
    lifeThreat: { high: 550 },
    decimals: 0,
    plausible: { low: 200, high: 900 }
  }),
  D({
    key: "ecgAxis",
    label: "QRS Axis",
    module: "ecg",
    unitRule: "ratio",
    unit: "\xB0",
    synonyms: ["qrs axis", "p-r-t axes", "cardiac axis", "axis"],
    ref: { low: -30, high: 90 },
    decimals: 0,
    plausible: { low: -180, high: 180 }
  })
];
var ANALYTE_BY_KEY = Object.fromEntries(
  ANALYTES.map((a) => [a.key, a])
);
var SYNONYM_INDEX = ANALYTES.flatMap((def) => def.synonyms.map((phrase) => ({ phrase: phrase.toLowerCase(), def }))).sort((a, b) => b.phrase.length - a.phrase.length);
function refFor(def, sex) {
  if (sex === "male" && def.refMale) return def.refMale;
  if (sex === "female" && def.refFemale) return def.refFemale;
  if (def.ref) return def.ref;
  if (def.refMale && def.refFemale) {
    return {
      low: Math.min(def.refMale.low ?? Infinity, def.refFemale.low ?? Infinity) || void 0,
      high: Math.max(def.refMale.high ?? -Infinity, def.refFemale.high ?? -Infinity) || void 0
    };
  }
  return def.refMale ?? def.refFemale;
}
function refForPatient(def, p) {
  const base = refFor(def, p.sex);
  if (!base) return base;
  if (p.pregnant) {
    if (def.key === "hb") return { low: 10.5, high: 14 };
    if (def.key === "ddimer") return { high: 1.5 };
    if (def.key === "fibrinogen") return { low: 3, high: 6 };
    if (def.key === "creatinine") return { low: 35, high: 75 };
  }
  if (def.key === "esr" && p.age && p.age > 50) {
    const high = p.sex === "female" ? (p.age + 10) / 2 : p.age / 2;
    return { high: Math.max(high, base.high ?? 0) };
  }
  return base;
}

// src/clinical/units.ts
function normaliseUnitToken(raw) {
  return raw.toLowerCase().replace(/\s+/g, "").replace(/µ|μ/g, "u").replace(/[×x]\s*10\s*[\^*e]?\s*/g, "10^").replace(/10\s*[\^*e]\s*/g, "10^").replace(/\bcells?\b/g, "").replace(/[()[\]]/g, "").replace(/percent/g, "%").replace(/litre|liter/g, "l").replace(/\/cumm|\/mm3|\/mm³/g, "/mm3").replace(/[.,]$/g, "");
}
var UNIT_RULES = {
  hb: { canonical: "g/dL", convert: { "g/dl": 1, "gm/dl": 1, "g%": 1, "g/l": 0.1, "gm/l": 0.1, "mmol/l": 1.611 } },
  hct: { canonical: "%", convert: { "%": 1, "l/l": 100, "": 1 } },
  rbc: { canonical: "x10^12/L", convert: { "10^12/l": 1, "10^6/ul": 1, "m/ul": 1, "mill/cumm": 1, "/mm3": 1e-6 } },
  mcv: { canonical: "fL", convert: { fl: 1, um3: 1, "u^3": 1 } },
  mch: { canonical: "pg", convert: { pg: 1 } },
  mchc: { canonical: "g/dL", convert: { "g/dl": 1, "g/l": 0.1, "%": 1 } },
  rdw: { canonical: "%", convert: { "%": 1, fl: 1 } },
  wbc: { canonical: "x10^9/L", convert: { "10^9/l": 1, "10^3/ul": 1, "k/ul": 1, "th/ul": 1, "/mm3": 1e-3, "/ul": 1e-3 } },
  plt: { canonical: "x10^9/L", convert: { "10^9/l": 1, "10^3/ul": 1, "k/ul": 1, "th/ul": 1, "/mm3": 1e-3, "/ul": 1e-3, "lakhs/cumm": 100 } },
  creatinine: { canonical: "umol/L", convert: { "umol/l": 1, "mg/dl": 88.4, "mg/l": 8.84, "mmol/l": 1e3 } },
  urea: { canonical: "mmol/L", convert: { "mmol/l": 1, "mg/dl": 0.1665, "g/l": 16.65 } },
  bun: { canonical: "mmol/L", convert: { "mg/dl": 0.357, "mmol/l": 1 } },
  glucose: { canonical: "mmol/L", convert: { "mmol/l": 1, "mg/dl": 0.0555 } },
  lactate: { canonical: "mmol/L", convert: { "mmol/l": 1, "mg/dl": 0.111 } },
  bilirubinTotal: { canonical: "umol/L", convert: { "umol/l": 1, "mg/dl": 17.1 } },
  bilirubinDirect: { canonical: "umol/L", convert: { "umol/l": 1, "mg/dl": 17.1 } },
  calcium: { canonical: "mmol/L", convert: { "mmol/l": 1, "mg/dl": 0.25, "meq/l": 0.5 } },
  magnesium: { canonical: "mmol/L", convert: { "mmol/l": 1, "mg/dl": 0.4114, "meq/l": 0.5 } },
  phosphate: { canonical: "mmol/L", convert: { "mmol/l": 1, "mg/dl": 0.3229 } },
  albumin: { canonical: "g/L", convert: { "g/l": 1, "g/dl": 10 } },
  totalProtein: { canonical: "g/L", convert: { "g/l": 1, "g/dl": 10 } },
  fibrinogen: { canonical: "g/L", convert: { "g/l": 1, "mg/dl": 0.01 } },
  ddimer: { canonical: "mg/L FEU", convert: { "mg/lfeu": 1, "mg/l": 1, "ug/ml": 1, "ng/ml": 1e-3, "ug/mlfeu": 1, "ng/mlfeu": 1e-3, "ug/l": 1e-3 } },
  crp: { canonical: "mg/L", convert: { "mg/l": 1, "mg/dl": 10 } },
  procalcitonin: { canonical: "ng/mL", convert: { "ng/ml": 1, "ug/l": 1 } },
  ferritin: { canonical: "ug/L", convert: { "ug/l": 1, "ng/ml": 1 } },
  troponin: { canonical: "ng/L", convert: { "ng/l": 1, "pg/ml": 1, "ng/ml": 1e3, "ug/l": 1e3 } },
  bnp: { canonical: "pg/mL", convert: { "pg/ml": 1, "ng/l": 1 } },
  ntprobnp: { canonical: "pg/mL", convert: { "pg/ml": 1, "ng/l": 1 } },
  gasTension: { canonical: "kPa", convert: { kpa: 1, mmhg: 0.1333, torr: 0.1333 } },
  enzyme: { canonical: "U/L", convert: { "u/l": 1, "iu/l": 1, "ku/l": 1e3 } },
  percent: { canonical: "%", convert: { "%": 1 } },
  seconds: { canonical: "s", convert: { s: 1, sec: 1, secs: 1, seconds: 1 } },
  ratio: { canonical: "", convert: { "": 1, ratio: 1 } },
  antixa: { canonical: "IU/mL", convert: { "iu/ml": 1, "u/ml": 1, "iu/l": 1e-3 } }
};
function toCanonical(ruleKey, value, rawUnit) {
  const rule = UNIT_RULES[ruleKey];
  if (!rule) return { value, unit: rawUnit ?? "", converted: false };
  if (!rawUnit) return { value, unit: rule.canonical, converted: false };
  const token = normaliseUnitToken(rawUnit);
  const direct = rule.convert[token];
  if (direct !== void 0) {
    return { value: round(value * direct), unit: rule.canonical, converted: direct !== 1 };
  }
  for (const [k, mult] of Object.entries(rule.convert)) {
    if (k && token.includes(k)) {
      return { value: round(value * mult), unit: rule.canonical, converted: mult !== 1 };
    }
  }
  return { value, unit: rule.canonical, converted: false };
}
var round = (n, dp = 3) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

// src/parse/labParser.ts
var NUM = /[<>]?\s*[-+]?\d{1,7}(?:[.,]\d{1,4})?/g;
var RANGE_SEP = /^\s*(?:-|–|—|~|to|:)\s*$/i;
var FLAG_TOKENS = /^(?:h|l|hh|ll|n|a|abn|abnormal|normal|high|low|crit|critical|\*+|\^+|\+|↑|↓)$/i;
var NON_UNITS = /* @__PURE__ */ new Set([
  "ref",
  "range",
  "reference",
  "result",
  "normal",
  "value",
  "flag",
  "previous",
  "prev",
  "high",
  "low",
  "and",
  "to",
  "or",
  "the",
  "of",
  "in",
  "on",
  "at",
  "by",
  "per"
]);
function looksLikeUnit(tok) {
  const t = tok.replace(/[(),;]/g, "").trim();
  if (!t) return false;
  if (NON_UNITS.has(t.toLowerCase())) return false;
  if (FLAG_TOKENS.test(t)) return false;
  if (/^\d+(?:\.\d+)?$/.test(t)) return false;
  return /[a-zA-Zµμ%^]/.test(t) && t.length <= 16;
}
function splitRefRange(rest) {
  let refText = "";
  const body = rest.replace(/[([]([^)\]]*?)[)\]]/g, (_m, inner) => {
    if (/\d\s*(?:-|–|—|to)\s*\d/.test(inner) || /^[<>]\s*\d/.test(inner.trim())) {
      refText = refText || inner.trim();
      return " ";
    }
    return ` ${inner} `;
  });
  return { body, refText };
}
function extractValues(rest) {
  const { body } = splitRefRange(rest);
  const matches = [...body.matchAll(NUM)];
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const next = matches[i + 1];
    if (next) {
      const between = body.slice((m.index ?? 0) + m[0].length, next.index ?? 0);
      if (RANGE_SEP.test(between)) {
        i++;
        continue;
      }
    }
    const rawText = m[0].trim();
    const numeric = parseFloat(rawText.replace(/[<>\s]/g, "").replace(",", "."));
    if (Number.isNaN(numeric)) continue;
    const after = body.slice((m.index ?? 0) + m[0].length);
    const tokens = after.trim().split(/\s+/).slice(0, 2);
    let unit = "";
    if (tokens[0] && looksLikeUnit(tokens[0])) {
      unit = tokens[0].replace(/[(),;]/g, "");
      if (tokens[1] && /^\/[a-zA-Z]/.test(tokens[1])) unit += tokens[1];
    }
    out.push({ value: numeric, raw: rawText, unit, index: m.index ?? 0 });
  }
  return out;
}
var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var ROW_PREFIX = /^[\s|*•·.\-–—]*(?:(?:fbc|cbc|u&e|ue|lft|lfts|rft|abg|mcs|bio|chem|haem|heam|test|investigation)\b[\s|:.\-–—]*)?/i;
function matchLabel(line) {
  const prefix = ROW_PREFIX.exec(line)?.[0] ?? "";
  const body = line.slice(prefix.length);
  const lower = body.toLowerCase();
  const tokenStarts = [];
  let inToken = false;
  for (let i = 0; i < body.length; i++) {
    const isSep = /[\s|:]/.test(body[i]);
    if (!isSep && !inToken) {
      tokenStarts.push(i);
      inToken = true;
    } else if (isSep) inToken = false;
  }
  const thirdTokenEnd = tokenStarts[3] ?? body.length;
  for (const { phrase, def } of SYNONYM_INDEX) {
    if (phrase.length <= 2) {
      const m = new RegExp(`^[\\s*\u2022.\\-]*${escapeRe(phrase)}\\b`, "i").exec(body);
      if (m) return { def, endIndex: prefix.length + m[0].length };
      continue;
    }
    if (phrase.length === 3) {
      const re = new RegExp(`\\b${escapeRe(phrase)}\\b`, "i");
      const m = re.exec(body);
      if (m && (m.index ?? 0) < thirdTokenEnd) {
        return { def, endIndex: prefix.length + (m.index ?? 0) + m[0].length };
      }
      continue;
    }
    const idx = lower.indexOf(phrase);
    if (idx >= 0 && idx <= 28) {
      return { def, endIndex: prefix.length + idx + phrase.length };
    }
  }
  return null;
}
var QUALITATIVE = [
  { key: "urinalysis:protein", label: "Urine protein", patterns: [/^\s*(?:urine\s+)?protein\b/i] },
  { key: "urinalysis:blood", label: "Urine blood", patterns: [/^\s*(?:urine\s+)?(?:blood|haemoglobin \(dipstick\))\b/i, /^\s*erythrocytes?\b/i] },
  { key: "urinalysis:leucocytes", label: "Leucocyte esterase", patterns: [/^\s*(?:urine\s+)?(?:leu[ck]ocytes?|leu[ck]ocyte esterase|pus cells)\b/i] },
  { key: "urinalysis:nitrite", label: "Nitrite", patterns: [/^\s*nitrites?\b/i] },
  { key: "urinalysis:glucose", label: "Urine glucose", patterns: [/^\s*(?:urine\s+)?glucose\b/i] },
  { key: "urinalysis:ketones", label: "Urine ketones", patterns: [/^\s*ketones?\b/i] },
  { key: "urinalysis:bilirubin", label: "Urine bilirubin", patterns: [/^\s*(?:urine\s+)?bilirubin\b/i] },
  { key: "urinalysis:urobilinogen", label: "Urobilinogen", patterns: [/^\s*urobilinogen\b/i] },
  { key: "urinalysis:microscopy", label: "Urine microscopy", patterns: [/^\s*(?:urine\s+)?microscopy\b/i, /^\s*casts?\b/i, /^\s*epithelial cells?\b/i] }
];
var QUALITATIVE_VALUE = /(negative|neg\b|nil\b|not detected|absent|trace|positive|pos\b|\+{1,4}|[0-3]\s*\+|present|few|moderate|many|occasional|numerous|large|small|\bnad\b)/i;
function parseLabValues(text, patient2, sourceId, confidence) {
  const analytes = [];
  const percentages = [];
  const observations = [];
  const seen = /* @__PURE__ */ new Set();
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((l) => l.replace(/\s+/g, " ").trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 2) continue;
    const qual = QUALITATIVE.find((q) => q.patterns.some((p) => p.test(line)));
    if (qual && !/\d+\.\d/.test(line)) {
      const vm = QUALITATIVE_VALUE.exec(line);
      if (vm && !observations.some((o) => o.key === qual.key)) {
        observations.push({
          key: qual.key,
          label: qual.label,
          value: vm[0].trim(),
          rawText: line,
          confidence,
          edited: false,
          sourceId
        });
        continue;
      }
      if (qual.key === "urinalysis:microscopy") {
        const tail = line.replace(/^\s*(?:urine\s+)?microscopy\b\s*[:\-]?\s*/i, "").trim();
        if (tail && !observations.some((o) => o.key === qual.key)) {
          observations.push({ key: qual.key, label: qual.label, value: tail, rawText: line, confidence, edited: false, sourceId });
          continue;
        }
      }
    }
    const hit = matchLabel(line);
    if (!hit) continue;
    let rest = line.slice(hit.endIndex);
    if (!/\d/.test(rest) && lines[i + 1] && /^\s*[<>]?\s*[-+]?\d/.test(lines[i + 1])) {
      rest = lines[i + 1];
    }
    if (!/\d/.test(rest)) continue;
    const values = extractValues(rest);
    if (!values.length) continue;
    const def = hit.def;
    let chosen = values[0];
    const isDifferential = ["neut", "lymph", "mono", "eos", "baso"].includes(def.key);
    if (isDifferential && values.length > 1) {
      const abs = values.find((v) => /10[\^*e]?9|10\^9|k\/ul|th\/ul|\/mm3/i.test(v.unit));
      if (abs) chosen = abs;
      else if (/%/.test(values[0].unit) && !/%/.test(values[1].unit)) chosen = values[1];
    }
    if (isDifferential && /%/.test(chosen.unit)) {
      percentages.push({ key: def.key, percent: chosen.value, raw: line });
      continue;
    }
    const conv = toCanonical(def.unitRule, chosen.value, chosen.unit || void 0);
    const plaus = def.plausible;
    if (plaus) {
      let v = conv.value;
      if (plaus.low !== void 0 && v < plaus.low || plaus.high !== void 0 && v > plaus.high) {
        const alt = v / 10;
        const alt2 = v * 10;
        const ok = (x) => (plaus.low === void 0 || x >= plaus.low) && (plaus.high === void 0 || x <= plaus.high);
        if (ok(alt)) v = alt;
        else if (ok(alt2)) v = alt2;
        else continue;
        conv.value = round(v, 4);
      }
    }
    if (seen.has(def.key)) continue;
    seen.add(def.key);
    const ref = refForPatient(def, patient2);
    analytes.push({
      key: def.key,
      label: def.label,
      value: round(conv.value, 4),
      unit: conv.unit || def.unit,
      rawText: line,
      rawValue: chosen.value,
      rawUnit: chosen.unit || void 0,
      confidence,
      edited: false,
      refLow: ref?.low,
      refHigh: ref?.high,
      sourceId
    });
  }
  return { analytes, percentages, observations };
}
function resolvePercentages(result, patient2, sourceId, confidence) {
  const wbc = result.analytes.find((a) => a.key === "wbc");
  if (!wbc) return [];
  const out = [];
  for (const p of result.percentages) {
    if (result.analytes.some((a) => a.key === p.key)) continue;
    const def = ANALYTE_BY_KEY[p.key];
    if (!def) continue;
    const abs = round(p.percent / 100 * wbc.value, 3);
    const ref = refForPatient(def, patient2);
    out.push({
      key: def.key,
      label: `${def.label} (derived from ${p.percent}% \xD7 WBC)`,
      value: abs,
      unit: def.unit,
      rawText: p.raw,
      rawValue: p.percent,
      rawUnit: "%",
      confidence: confidence * 0.9,
      edited: false,
      refLow: ref?.low,
      refHigh: ref?.high,
      sourceId
    });
  }
  return out;
}

// src/parse/classify.ts
var RULES = [
  {
    module: "fbc",
    strong: [/full blood count/i, /complete blood count/i, /\bfbc\b/i, /\bcbc\b/i, /haemogram/i, /differential count/i],
    weak: [/haemoglobin/i, /hemoglobin/i, /\bhb\b/i, /platelet/i, /\bmcv\b/i, /\bmch\b/i, /neutrophil/i, /lymphocyte/i, /packed cell volume/i, /\bpcv\b/i, /white cell/i, /\brdw\b/i, /eosinophil/i]
  },
  {
    module: "coagulation",
    strong: [/coagulation (?:screen|profile|studies)/i, /clotting screen/i, /\bcoag screen\b/i],
    weak: [/prothrombin time/i, /\binr\b/i, /\baptt\b/i, /\bpt\b\s*[:\-]/i, /fibrinogen/i, /d-?\s?dimer/i, /thrombin time/i, /anti-?xa/i]
  },
  {
    module: "renal",
    strong: [/renal (?:function|profile)/i, /urea and electrolytes/i, /\bu&e\b/i, /\bues\b/i, /kidney function/i],
    weak: [/creatinine/i, /\burea\b/i, /\begfr\b/i, /\bgfr\b/i, /cystatin/i, /uric acid/i]
  },
  {
    module: "electrolytes",
    strong: [/electrolytes/i, /urea and electrolytes/i, /\bu&e\b/i, /bone profile/i],
    weak: [/sodium/i, /potassium/i, /chloride/i, /bicarbonate/i, /magnesium/i, /phosphate/i, /\bcalcium\b/i, /osmolality/i]
  },
  {
    module: "lft",
    strong: [/liver (?:function|profile)/i, /\blft'?s?\b/i, /hepatic panel/i],
    weak: [/bilirubin/i, /\balt\b/i, /\bast\b/i, /alkaline phosphatase/i, /\balp\b/i, /\bggt\b/i, /albumin/i, /sgot/i, /sgpt/i, /total protein/i]
  },
  {
    module: "abg",
    strong: [/arterial blood gas/i, /\babg\b/i, /blood gas (?:analysis|report)/i, /venous blood gas/i, /\bvbg\b/i],
    weak: [/\bpo2\b/i, /\bpco2\b/i, /\bpao2\b/i, /\bpaco2\b/i, /base excess/i, /\bhco3\b/i, /\bfio2\b/i, /lactate/i, /\bph\b\s*[:\s]\s*7/i, /carboxyhaemoglobin/i]
  },
  {
    module: "urinalysis",
    strong: [/urinalysis/i, /urine (?:analysis|dipstick|routine)/i, /\bdipstick\b/i, /urine microscopy/i],
    weak: [/specific gravity/i, /leucocyte esterase/i, /\bnitrite\b/i, /urobilinogen/i, /\bketones?\b/i, /albumin[: ]?creatinine ratio/i, /\bcasts?\b/i]
  },
  {
    module: "inflammatory",
    strong: [/inflammatory markers/i, /acute phase/i],
    weak: [/c-?reactive protein/i, /\bcrp\b/i, /\besr\b/i, /erythrocyte sedimentation/i, /procalcitonin/i, /ferritin/i, /transferrin saturation/i, /vitamin b12/i, /\bfolate\b/i]
  },
  {
    module: "cardiac",
    strong: [/cardiac (?:markers|enzymes|biomarkers)/i, /troponin/i],
    weak: [/\bck-?mb\b/i, /creatine kinase/i, /\bbnp\b/i, /nt-?probnp/i, /natriuretic/i]
  },
  {
    module: "ecg",
    strong: [/electrocardiogram/i, /\becg\b/i, /\bekg\b/i, /12[\s-]?lead/i, /rhythm strip/i, /\bsinus rhythm\b/i, /vent(?:ricular)?\.? rate/i],
    weak: [/\bqrs\b/i, /\bqtc?\b/i, /\bpr interval\b/i, /\bp-?r-?t axes\b/i, /\bbpm\b/i, /\batrial fibrillation\b/i, /\bst (?:elevation|depression)\b/i, /bundle branch block/i]
  },
  {
    module: "microbiology",
    strong: [
      /microbiology/i,
      /culture (?:and|&) sensitivit/i,
      /\bm,?\s?c\s?(?:and|&|,)?\s?s\b/i,
      /\bmcs\b/i,
      /wound swab/i,
      /blood culture/i,
      /urine culture/i,
      /sensitivity (?:report|pattern)/i,
      /antibiogram/i
    ],
    weak: [/gram (?:positive|negative|stain)/i, /\bno growth\b/i, /mixed growth/i, /organism/i, /\bisolate[ds]?\b/i, /\bcolonies\b/i, /\bcfu\b/i, /sensitive to/i, /resistant to/i, /\bmrsa\b/i, /\besbl\b/i, /\bspp\.?\b/i, /staphylococcus|streptococcus|escherichia|klebsiella|pseudomonas|enterococcus|proteus|candida|acinetobacter/i]
  }
];
function countLeadLabels(text) {
  const found = /* @__PURE__ */ new Set();
  const tokens = text.split(/[^A-Za-z0-9]+/);
  for (const t of tokens) {
    if (/^(aVR|aVL|aVF)$/i.test(t)) found.add(t.toUpperCase());
    else if (/^V[1-6]$/i.test(t)) found.add(t.toUpperCase());
    else if (/^(I|II|III)$/.test(t)) found.add(t);
  }
  return found.size;
}
function classifyReport(text) {
  const scores = {};
  for (const rule of RULES) {
    let s = 0;
    for (const p of rule.strong) if (p.test(text)) s += 4;
    for (const p of rule.weak) if (p.test(text)) s += 1;
    if (s > 0) scores[rule.module] = s;
  }
  const leadLabels = countLeadLabels(text);
  if (leadLabels >= 4) {
    scores.ecg = (scores.ecg ?? 0) + 4 + Math.min(leadLabels, 8);
  } else if (leadLabels >= 2) {
    scores.ecg = (scores.ecg ?? 0) + 2;
  }
  const modules = Object.entries(scores).filter(([, s]) => s >= 3).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  const primary = modules[0] ?? "other";
  return { modules: modules.length ? modules : ["other"], scores, primary };
}

// src/clinical/types.ts
var emptyPatient = () => ({
  name: "",
  hospitalNumber: "",
  age: null,
  sex: "unspecified",
  weightKg: null,
  heightCm: null,
  ward: "",
  consultant: "",
  diagnosis: "",
  clinicalDetails: "",
  fever: false,
  plannedSurgery: false,
  onAnticoagulant: false,
  anticoagulantName: "",
  pregnant: false,
  knownCKD: false,
  immunosuppressed: false,
  allergies: [],
  baselineCreatinine: null,
  collectedAt: ""
});

// .tmp-diag.ts
var patient = { ...emptyPatient(), sex: "male", age: 30 };
var LAYOUTS = {
  "A: row-major, Investigation column carries FBC": `
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
  "B: label and value on separate lines": `
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
  "C: cell borders read as pipes": `
| FBC | WBC | 4.42 | 10/9 | (4.5- 17.0) |
| | NEUTROPHILS | 68.6 | % | (40 - 75) |
| | HAEMOGLOBIN | 13.0 | g/dl | (11.5 - 15.5) |
| | PLATELET | 187 | 10^9/L | (100- 400) |
| | MPV | 11.0 | Fl | (9 - 13) |
`
};
for (const [name, text] of Object.entries(LAYOUTS)) {
  const cls = classifyReport(text);
  const lab = parseLabValues(text, patient, "doc", 0.73);
  const derived = resolvePercentages(lab, patient, "doc", 0.73);
  const all = [...lab.analytes, ...derived];
  console.log(`
${name}`);
  console.log(`   classified: ${cls.modules.join(", ")}`);
  console.log(`   extracted ${all.length}: ${all.map((a) => `${a.key}=${a.value}`).join(", ") || "(NOTHING)"}`);
  if (lab.percentages.length) console.log(`   deferred %: ${lab.percentages.map((p) => `${p.key}=${p.percent}`).join(", ")}`);
}
