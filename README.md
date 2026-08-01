<div align="center">

# Clinician Assistant

**Offline multi-modal clinical diagnostic analysis**

*Developed by **NEXORA Innovations : Building Solutions***

</div>

---

An installable, fully offline web application that scans diagnostic reports, extracts and validates the values, interprets each modality, correlates findings across modalities, and produces a comprehensive printable clinical report.

**No patient information ever leaves the device.** OCR runs in a local WebAssembly worker; analysis is a local rule engine; exports are written to files the clinician chooses. The application makes no network request at any point during use.

---

## Quick start

```bash
npm install          # also stages the offline OCR runtime and language data
npm run dev          # http://localhost:5173
```

Production build and preview:

```bash
npm run build
npm run preview      # http://localhost:4173
```

Verification:

```bash
npm run verify           # engine — parsing, analysis, correlation
npm run verify:ecg       # ECG waveform pipeline against synthetic ECGs of known truth (53 assertions)
npm run verify:lab       # laboratory table extraction from a rendered replica of a real bordered report
npm run verify:redaction # de-identification: redacted images are read back and must be illegible
npm run verify:pwa       # installability, then cuts the network and checks the app still analyses and scans
npm run smoke            # drives the built app in a browser: live OCR, ECG digitisation, PDF export
```

The browser suites need the app running (`npm run preview`).

### Offline OCR assets

`npm install` runs `scripts/setup-ocr-assets.mjs`, which copies the Tesseract worker and WASM cores out of `node_modules` into `public/ocr/` and downloads the English language data **once**. After that the application is permanently offline.

If the machine was offline during install, run `npm run setup:ocr` later, or download
`https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz`,
decompress it, and place the resulting `eng.traineddata` in `public/ocr/`.

> The language file is stored **uncompressed** deliberately. Many static servers send `Content-Encoding: gzip` for a `.gz` asset, which makes the browser decompress it transparently; Tesseract would then attempt to gunzip already-plain bytes and fail. Shipping it uncompressed removes that server dependency.

---

## Running it and installing it

```bash
npm run build
npm run preview        # HTTPS on https://localhost:4173 and on your LAN address
npm run preview:http   # plain HTTP on port 4174 — for a quick look from a phone
```

`npm run preview` serves over HTTPS using a development certificate generated on first run. That matters: browsers only allow an app to be **installed**, to **store itself for offline use**, and to use the **Web Crypto API** the encrypted archive depends on, from a *secure context* — HTTPS, or `localhost`.

### Desktop — works immediately

Open `https://localhost:4173`. Chrome or Edge shows an install icon in the address bar (or *Install Clinician Assistant* in the ⋮ menu). Safari: *File → Add to Dock*.

Then open **Settings → Offline use and installation** and press **Prepare for offline use**. That downloads and stores the 13 MB recognition engine so scanning works with no network at all. Until you do, the app opens offline but OCR does not.

### Deploying to Vercel (free tier)

This is a static site with no server component, so the Hobby plan is sufficient and the app installs on every device from a proper HTTPS origin.

```bash
npm i -g vercel
vercel            # first run: link the project
vercel --prod
```

Or connect the repository at [vercel.com/new](https://vercel.com/new). `vercel.json` sets the build, the caching, and the security headers; no dashboard configuration is needed.

The build downloads the OCR language data during `npm install` — `public/ocr/` is deliberately not committed. On a hosting build the setup script **fails the deploy** rather than shipping an app whose scanning silently does not work.

Deployment is roughly **22 MB across 31 files**, comfortably inside the free tier. Only the LSTM recognition cores are staged; the combined legacy builds are never loaded by this configuration and would have added 16 MB to every deployment and every device.

The `Content-Security-Policy` header sets `connect-src 'self'`, so the browser itself blocks any request to another host. The claim that no patient data leaves the device stops being a promise about the code and becomes something the browser enforces.

### Phone and tablet

A development certificate is self-signed, so a phone reaching your machine over the network gets a certificate warning — and Chrome will not install an app or register offline storage on a site with an invalid certificate. Three ways round it, best first:

**1 · Host the `dist/` folder (recommended).** Drop `dist/` onto any static host with HTTPS — Netlify Drop, Cloudflare Pages, GitHub Pages, or a hospital web server. Every device then installs it normally, and it keeps working after the laptop is closed. Only the application code is served; patient data is still processed entirely on the device and never transmitted.

**2 · USB port forwarding (Android).** Connect the phone by USB with developer mode on, open `chrome://inspect#devices` on the desktop, add port forwarding `4173 → localhost:4173`, then open `https://localhost:4173` **on the phone**. It is treated as localhost, so it is a secure context and installs properly.

**3 · Trust the development certificate.** Copy `node_modules/.vite/basic-ssl/_cert.pem` to the phone and install it as a CA certificate (Android: *Settings → Security → Encryption & credentials → Install a certificate → CA certificate*). Then `https://<your-lan-ip>:4173` behaves as a proper secure origin.

**Just want to look at it now?** `npm run preview:http` and open the printed `http://<lan-ip>:4174/` address on the phone. Scanning, OCR, ECG digitisation, analysis and PDF export all work. Installation and the encrypted archive do not — plain HTTP is not a secure context. The Settings panel says so on screen rather than failing silently.

### Installing on iPhone or iPad

Safari never offers an automatic prompt. Open the site, tap **Share**, then **Add to Home Screen**. It needs a valid HTTPS certificate, so use option 1 above.

### Verifying it really works offline

```bash
npm run verify:pwa
```

Loads the app, registers the service worker, caches the recognition engine, then **cuts the network entirely** and reloads — checking that the app still starts, still ingests all eight demonstration reports, still digitises and analyses the ECG, and still runs live OCR on a new image.

---

## The NEXORA logo

The credit mark is drawn as inline SVG (`src/brand/NexoraLogo.tsx`) so it scales cleanly on screen, in print, in the HTML export and in the PDF, with no external asset.

To use the original artwork instead, save it as:

```
public/assets/nexora-logo.png
```

The application probes for that exact path on start-up and switches to it automatically wherever the credit appears. If it is absent, the vector rendition is used, so a missing file never breaks the app.

---

## What it does

### 1 · Patient context
Demographics, weight and age (needed for eGFR, creatinine clearance and deficit calculations), baseline creatinine (needed for KDIGO AKI staging), drug allergies, and clinical-context flags — febrile, surgery planned, anticoagulated, pregnant, known CKD, immunosuppressed. These flags switch on specific correlation rules and change reference intervals, so they materially change the analysis.

### 2 · Scan
Photographs, scans, PDFs and plain text. Multiple files at once. Every panel on a page is detected separately, so a combined U&E + LFT + FBC printout is filed under three headings.

- **PDFs with a text layer** are read directly from the text layer — far more accurate than OCR — with table rows reconstructed from glyph positions.
- **Scanned PDFs and photographs** are rasterised and preprocessed (upscale, greyscale, percentile contrast stretch, auto-invert for monitor screenshots, Otsu thresholding) before OCR, with a second single-block pass when confidence is poor.
- A **demonstration data** button loads seven fictitious reports through the identical ingestion path.

### 3 · Review
Every extracted value is shown with its original OCR text, the recognition confidence, the converted value, and the reference interval applied. Values are editable; a clinician correction is marked as such and is never overwritten by a later scan. Analytes can also be added entirely by hand.

The ECG panel exposes a feature checklist covering rhythm, conduction, ischaemia, chamber, repolarisation, electrolyte and device findings. Microbiology susceptibility results can be corrected, which changes the antimicrobial options presented.

### 4 · Analysis

| Module | Highlights |
|---|---|
| **Renal** | CKD-EPI 2021 eGFR, Cockcroft–Gault clearance, KDIGO CKD category, KDIGO AKI stage, urea:creatinine ratio |
| **Electrolytes** | Corrected calcium, anion gap (albumin-corrected), osmolar gap, glucose-corrected sodium, sodium and free-water deficits, replacement guidance with correction-rate limits |
| **Full blood count** | Anaemia with morphological classification, iron deficiency, B12/folate, polycythaemia, white cell abnormalities, platelet disorders, pancytopenia, sepsis / marrow suppression / acute blood loss / chronic disease patterns |
| **Coagulation** | ISTH overt-DIC score, vitamin K antagonist / heparin / DOAC patterns, hepatic vs vitamin K deficiency, hypofibrinogenaemia, explicit bleeding and thrombotic risk, perioperative implications |
| **Liver** | R ratio (hepatocellular / cholestatic / mixed), AST:ALT ratio, conjugated fraction, synthetic function |
| **Blood gas** | Full stepwise acid–base algorithm with Winter's formula and acute/chronic compensation checks, anion gap, A–a gradient, P/F ratio, CO and methaemoglobin |
| **Urinalysis** | Dipstick grading, UTI likelihood, proteinuria staging, haematuria with glomerular discrimination, casts |
| **Inflammatory** | CRP, ESR (age-adjusted), procalcitonin, ferritin, CRP/ESR discordance |
| **Cardiac** | Troponin framed as myocardial injury (not infarction), natriuretic peptides, CK / rhabdomyolysis |
| **ECG** | **Waveform signal analysis** — the trace is digitised from the image and measured (see below) — plus rate, rhythm, axis, PR, QRS, QT/QTc, a 25-feature catalogue covering ischaemia, conduction, chamber, repolarisation, electrolyte and device findings, and a four-tier urgency classification |
| **Microbiology** | Organism catalogue with intrinsic resistance and site-specific significance, contaminant vs pathogen, biofilm and hospital-acquired flags, resistance markers (MRSA, ESBL, AmpC, CRE/CPE, VRE, MDR, PVL), full susceptibility tables, antimicrobial options with **renal dose prompts**, **allergy cross-reactivity checks**, TDM reminders, isolation and stewardship guidance |

Each finding carries interpretation, severity, differential diagnoses, suggested investigations, clinical implications, monitoring recommendations and guideline-aligned practice points.

### 4a · ECG waveform signal analysis

Photograph or scan an ECG and the trace itself is recovered and analysed as a signal — not merely read as text.

**Digitisation.** The printed millimetre grid is located and its spacing measured directly from the distance between adjacent lines, establishing the scale that makes 1 mm mean 0.04 s and 0.1 mV. The image is deskewed. The red grid is separated from the black trace by chroma, panels are located from the isoelectric baselines and assigned to leads using the lead labels found by OCR, and each column of ink is followed to recover a millivolt-versus-time signal per lead. The calibration pulse is measured to confirm the gain, so half- and double-gain recordings are detected rather than silently halving or doubling every amplitude.

**Signal analysis.** Pan-Tompkins QRS detection (bandpass, differentiate, square, integrate, dual adaptive thresholds with refractory period, T-wave discrimination and search-back). Wave delineation from the spatial magnitude of all simultaneous leads, with the T wave offset by the tangent method. From that:

- Heart rate, RR intervals and RR variability
- PR, QRS, QT, and QTc by both Bazett and Fridericia
- Frontal-plane axis from net QRS areas
- ST deviation at the J point and J+60 ms in every lead, against each beat's own PR segment
- Q, R, S, R′ amplitudes and Q wave duration per lead, using standard deflection nomenclature
- Atrial activity by QRST cancellation — subtracting an averaged beat template leaves the residual atrial signal, which is what separates flutter from a fast sinus rhythm
- Rhythm classification: sinus, bradycardia, tachycardia, atrial fibrillation, flutter, SVT, VT, junctional, idioventricular, paced; first degree, Mobitz I, Mobitz II and complete AV block
- Morphology criteria applied as published: STEMI thresholds from the Fourth Universal Definition (including the sex- and age-specific V2–V3 values), reciprocal depression, Wellens-type T inversion, pathological Q waves, LBBB/RBBB, left anterior fascicular block, Sokolow-Lyon and Cornell voltages, right ventricular hypertrophy, low voltage, atrial enlargement, long and short QT, hyperkalaemic and hypokalaemic patterns, pre-excitation, and pericarditis

**Verification.** `npm run verify:ecg` renders synthetic ECGs with exactly known parameters, digitises them back from the pixels, and checks the recovered values — 53 assertions across normal rhythm, bradycardia with first degree block, tachycardia, inferior and anterior ST elevation, broad QRS, long QT, atrial fibrillation, hypertrophy voltages, T inversion, a rhythm strip alone, a noisy low-resolution scan, a half-gain recording, and an image with no grid. Measured against ground truth on a clean 6 px/mm render, heart rate lands within 1 bpm, PR within 15 ms, QRS within 12 ms, QT within 20 ms and axis within 5°.

**What is shown to the clinician.** The recovered signal is drawn in the Review tab with the exact points each measurement was taken from — QRS onset, J point, P onset, T offset — so the digitisation can be checked against the paper before any number derived from it is trusted. Digitisation quality is scored and reported, and every limitation is named.

**Reconciliation.** Where the printout also carries machine measurements, both sets are kept. The printed values are preferred for interpretation — they come from the recorder's analysis of its own raw digital signal and are more accurate than anything recoverable from paper — and any material disagreement is raised as a finding rather than silently resolved. Where the printout carries no measurements at all, the computed values stand alone.

### 5 · Correlation engine
Twenty rules that see across modules and can raise severity above that of any contributing finding:

```
Elevated WBC + positive culture + fever   → possible severe infection, sepsis pathway
Elevated potassium + ECG changes          → life-threatening hyperkalaemia, immediate treatment
Low haemoglobin + elevated creatinine     → renal anaemia assessment
Abnormal INR + planned surgery            → perioperative bleeding risk
Positive culture + renal impairment       → antimicrobial dose adjustment
```

…plus neutropenic sepsis, AKI with hyperkalaemia and acidosis, sepsis with DIC, GI haemorrhage from a disproportionate urea, QT prolongation with electrolyte depletion, troponin with ischaemic ECG, bacteraemia with a biofilm organism, resistance with infection-control actions, rhabdomyolysis, anticoagulation with anaemia, hepatic failure, decompensating respiratory failure, DKA, hyponatraemia with renal impairment, anaemia with hypoxaemia, infection in immunosuppression, pancytopenia with infection, and transfusion assessment.

### 6 · Priority alerts
Six tiers — Normal, Minor, Moderate, Significant, **Critical**, **Life-Threatening** — from explicit action thresholds where they exist, otherwise from graded deviation outside the reference interval. Critical and life-threatening findings are surfaced prominently and lead the report.

### 7 · Report and exports

A comprehensive report containing patient overview, priority alerts, integrated clinical impression, per-module summaries with original OCR values alongside validated values, antimicrobial susceptibility overview, clinical correlations, categorised next steps, a consolidated monitoring schedule, a clinician notes box and an electronic signature block — with hospital branding and the NEXORA credit.

| Format | Notes |
|---|---|
| **PDF** | Real vector text via jsPDF — searchable, selectable, ~90 KB for a 22-page report |
| **HTML** | Single self-contained file with inline styles |
| **A4 print** | Browser print pipeline with a dedicated print stylesheet |
| **Encrypted archive** | AES-256-GCM under a PBKDF2-SHA256 key (310,000 iterations), gzip-compressed, saved to a file you choose |

---

## Case library — a dedicated encrypted folder on each device

Saved cases live in a folder belonging to this application on the device, using the origin private file system. That is the only mechanism that works on phones as well as desktops, and it survives reloads, reboots and going offline.

- **Nothing is written in the clear.** Every case *and the index that lists them* is encrypted with AES-256-GCM under a key derived from a passphrase you set, using PBKDF2-SHA256 at 310,000 rounds. The key is derived once per session, is non-extractable, and lives only in memory. The passphrase is never stored — if it is lost, nobody can open the library.
- **Persistent storage** can be requested so the browser stops treating the library as evictable cache. Installing the app usually makes the browser grant it.
- **A visible folder** can additionally be bound on desktop Chrome and Edge. Saved cases are mirrored there as encrypted `.enc` files you can back up or carry to another machine. The private store stays the primary copy, so a revoked folder permission never loses a case. Mobile browsers, Firefox and Safari do not offer this API; the panel says so instead of failing quietly.
- **Deletion** is offered per case and for the whole library.

`npm run verify:pwa` exercises the whole cycle: create, save, reload the page, reject a wrong passphrase, reopen, restore the patient into the session, delete — and reads back every file the library wrote to confirm **no patient identifier appears in plaintext anywhere on disk**.

## Deploying to Vercel

Import the repository at [vercel.com/new](https://vercel.com/new). `vercel.json` sets the build, caching and security headers, so there is nothing to configure. The OCR runtime is not committed — it is fetched during `npm install` by the postinstall script, which runs on Vercel automatically.

The content security policy restricts `connect-src` to the deployment's own origin, so the browser itself enforces that nothing can be sent to any third party except through the one endpoint described below.

### Optional: assisted extraction

Off unless you configure it, and off in the interface unless the clinician switches it on.

| Environment variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | yes, to enable the feature | Server-side key. Never reaches the browser. |
| `OPENAI_MODEL` | no | Overrides the model preference order, which is otherwise `gpt-5` then `gpt-4o`. |
| `AI_APP_TOKEN` | no | A token the client must present. Raises the effort needed to abuse the endpoint; a value shipped in a browser bundle is not a secret. |

Set these in **Project → Settings → Environment Variables** and redeploy. Leave `OPENAI_API_KEY` unset and the endpoint reports itself unavailable, the interface offers nothing, and the application is exactly as it was.

**Set a spending limit on the OpenAI account.** The endpoint is reachable by anyone who can reach the deployment. It applies a per-instance rate limit and a payload cap, but a shared key on a public endpoint is inherently exposed.

Locally, `npm run dev` and `npm run preview` mount the same function, so the path can be exercised before deploying.

## Privacy model

**Assisted extraction is the one thing that transmits, and it is opt-in twice** — the deployment must be configured with a key, and the clinician must switch it on. When used, an image of the report is sent to a vision model to transcribe values on-device recognition missed. Before anything leaves:

- Identifiers are painted out — name, hospital and record numbers, date of birth, address, telephone, consultant, ward — matched both by field label and against the patient record you entered, with whole rows removed rather than individual words.
- The redacted image is shown to you with a list of what was removed, and you confirm it. If nothing identifiable was found, that is said plainly rather than passed over: it may mean the header was never read.
- The first transmission of a session states what is being sent and to where.

`npm run verify:redaction` renders a report carrying a name, hospital number, date of birth, address, consultant and telephone number, redacts it, then **reads the redacted image back through the recognition engine** — every identifier must be illegible and the clinical values must survive. The same suite confirms that with the feature off, no request leaves the origin at all.

Everything else is unchanged:

- The working session lives **in memory only**. It is never written to `localStorage` or any other automatic store, and is discarded when the tab closes.
- Persistence is always an explicit clinician action: the encrypted case library above, or an exported encrypted archive file. Both use the same scheme, and neither passphrase is recoverable.
- Only non-patient configuration — hospital branding and local reference intervals — is kept unencrypted on the device.
- The browser warns before an unsaved session is lost.
- When deployed with the supplied `vercel.json`, the Content-Security-Policy blocks connections to any other host at the browser level.

---

## Configuration

**Settings** tab:

- Hospital / trust name, department, address, footer note, and an institution crest embedded into the report.
- **Local reference intervals** — override any built-in adult interval with your laboratory's own. An override replaces the sex-specific defaults for that analyte and applies to grading, flags and the report.

---

## Project layout

```
src/
  clinical/            pure analysis engine — no I/O, no DOM
    types.ts           severity tiers, findings, correlations, module results
    referenceRanges.ts analyte dictionary: synonyms, intervals, action thresholds
    units.ts           SI ↔ conventional unit normalisation
    severity.ts        priority alert grading
    context.ts         read-only façade over the extracted dataset
    correlation.ts     cross-modality rule engine
    analyse.ts         orchestrator, impression and next-steps composition
    modules/           one file per diagnostic module
  ecg/                 waveform digitisation and signal analysis
    grid.ts            grid detection, mm scale, deskew, calibration pulse
    layout.ts          panel segmentation from baselines and OCR lead labels
    traceExtract.ts    raster → millivolt signal per lead
    dsp.ts             zero-phase filters, baseline handling, resampling
    qrs.ts             Pan-Tompkins QRS detection
    delineate.ts       P/QRS/T onsets, peaks and offsets
    measure.ts         intervals, axis, ST levels, wave amplitudes
    rhythm.ts          QRST cancellation and rhythm classification
    morphology.ts      published criteria → ECG feature flags
    analyseWaveform.ts orchestrator and quality scoring
    reconcile.ts       computed vs printed measurement comparison
    synth.ts           synthetic ECG renderer used for verification
    worker.ts/client.ts  off-main-thread execution
  ocr/
    ocrEngine.ts       Tesseract worker, local assets only
    preprocess.ts      canvas preprocessing pipeline
    pdf.ts             pdf.js text layer extraction / rasterisation
  parse/
    classify.ts        report type detection
    labParser.ts       numeric extraction, unit conversion, plausibility guards
    ecgParser.ts       measurement block and statement extraction
    microParser.ts     organisms and susceptibility patterns
    pipeline.ts        file → text → classification → parsers
  report/
    reportHtml.ts      report body, shared by preview, print and HTML export
    exportPdf.ts       A4 PDF layout engine
  store/
    session.ts         in-memory session state
    archive.ts         AES-GCM encrypted archive
  ui/                  React panels
  brand/               NEXORA mark
  config/              institution configuration
scripts/
  setup-ocr-assets.mjs stages the offline OCR runtime
  verify.mjs           headless engine verification
  smoke.mjs            browser smoke test with live OCR
```

---

## Scope and limitations

Stated plainly, because they matter clinically:

- **ECG waveform analysis depends entirely on recovering the grid.** Without a legible millimetre grid there is no scale, and the module refuses to analyse rather than guessing — a number without a calibration is worse than no number. Perspective distortion from an angled photograph is not corrected (only rotation is), a torn or folded printout will digitise poorly, and pacing spikes last 1–2 ms and are simply not resolvable below about 12 pixels per millimetre, so their absence never excludes a paced rhythm. Amplitudes are recovered slightly conservatively on sharp peaks. Digitisation quality is scored and every limitation is stated in the report. **The tracing must still be reviewed directly by a competent clinician.**
- **OCR is imperfect.** Every value is presented with its recognition confidence and original text for verification, and low-confidence values are called out explicitly in the next steps. Values outside a plausibility guard are rejected rather than guessed at.
- **Reference intervals are typical adult values.** Paediatric ranges are not modelled. Configure your laboratory's intervals in Settings.
- **AKI staging requires a baseline creatinine.** Without one, acute injury cannot be distinguished from chronic impairment, and the report says so.
- **The application does not prescribe.** Antimicrobial options are decision support derived from the reported susceptibilities, renal function and recorded allergies; they must be confirmed against local guidance before prescribing.

---

## Clinical safety statement

This application provides **clinical decision support only**. It does not diagnose, does not prescribe, and does not replace clinical assessment, local guidelines or specialist advice. All outputs require verification against source documents and review by a competent clinician. The generated report includes an electronic signature block for that purpose and is not suitable for filing in a medical record until countersigned.

---

<div align="center">

**NEXORA Innovations : Building Solutions**

</div>
