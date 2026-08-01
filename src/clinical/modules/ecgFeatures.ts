/**
 * ECG feature catalogue.
 *
 * Each entry is detected either from the machine/clinician statement lines
 * captured by OCR, or ticked directly by the clinician in the ECG review panel.
 * The engine does not perform waveform signal analysis on a raster image — it
 * interprets the printed measurements and reported statements, and the
 * clinician's own observations. This is stated explicitly in the report.
 */
import type { Severity } from '../types';

export type EcgUrgency = 'routine' | 'same-day' | 'urgent' | 'immediate';

export interface EcgFeatureDef {
  key: string;
  label: string;
  group: 'rhythm' | 'conduction' | 'ischaemia' | 'chamber' | 'repolarisation' | 'device' | 'electrolyte' | 'other';
  /** Patterns matched against OCR statement text. */
  patterns: RegExp[];
  severity: Severity;
  urgency: EcgUrgency;
  interpretation: string;
  differentials: string[];
  investigations: string[];
  implications: string[];
  monitoring: string[];
  guidance: string[];
  tags: string[];
}

const F = (d: EcgFeatureDef): EcgFeatureDef => d;

export const ECG_FEATURES: EcgFeatureDef[] = [
  // ─────────────────────────── ISCHAEMIA ───────────────────────────
  F({
    key: 'stElevation',
    label: 'ST elevation',
    group: 'ischaemia',
    patterns: [/\bst[\s-]*elevation\b/i, /\bstemi\b/i, /\bacute mi\b/i, /\bst elevat/i, /injury pattern/i],
    severity: 'life-threatening',
    urgency: 'immediate',
    interpretation:
      'ST elevation in contiguous leads is the electrocardiographic signature of acute transmural myocardial injury. In the appropriate clinical context this is a ST-elevation myocardial infarction and constitutes a time-critical emergency, with total ischaemic time the principal determinant of myocardial salvage.',
    differentials: ['ST-elevation myocardial infarction', 'Acute pericarditis (widespread concave elevation with PR depression)', 'Left ventricular aneurysm', 'Brugada syndrome', 'Benign early repolarisation', 'Left bundle branch block or paced rhythm', 'Takotsubo cardiomyopathy', 'Hyperkalaemia', 'Prinzmetal angina'],
    investigations: ['Immediate senior and cardiology review — do not delay for biochemistry', 'Serial 12-lead ECGs including posterior and right-sided leads where indicated', 'Troponin (does not delay reperfusion decisions)', 'Chest radiograph', 'Echocardiography', 'Full blood count, renal function, coagulation screen and group and save before intervention'],
    implications: ['Immediate reperfusion is indicated — primary percutaneous coronary intervention where available within the recommended timeframe, otherwise fibrinolysis.', 'Risk of malignant arrhythmia, cardiogenic shock and mechanical complications.'],
    monitoring: ['Continuous cardiac monitoring in a defibrillator-equipped area', 'Continuous observation with immediate access to resuscitation equipment'],
    guidance: ['Follow the local acute coronary syndrome pathway; call the primary PCI centre immediately.', 'Give aspirin and further antiplatelet therapy per protocol unless contraindicated.'],
    tags: ['stemi', 'acs', 'immediate-review', 'ischaemia'],
  }),
  F({
    key: 'stDepression',
    label: 'ST depression',
    group: 'ischaemia',
    patterns: [/\bst[\s-]*depression\b/i, /\bst depress/i, /subendocardial ischa?emia/i, /\bischa?emic st\b/i],
    severity: 'critical',
    urgency: 'urgent',
    interpretation:
      'ST depression indicates subendocardial ischaemia or reciprocal change. Horizontal or downsloping depression of 0.5 mm or more in two contiguous leads is significant. Widespread ST depression with elevation in aVR suggests left main or severe triple-vessel disease.',
    differentials: ['Non-ST-elevation acute coronary syndrome', 'Reciprocal change to a STEMI (including posterior infarction)', 'Left ventricular hypertrophy with strain', 'Digoxin effect', 'Hypokalaemia', 'Tachycardia-related demand ischaemia', 'Bundle branch block'],
    investigations: ['Serial troponin and serial ECGs', 'Posterior leads V7–V9 where anterior ST depression is present, to exclude posterior infarction', 'Potassium and magnesium', 'Echocardiography', 'Urgent cardiology discussion'],
    implications: ['Non-ST-elevation acute coronary syndrome requires risk stratification and, in high-risk patients, early invasive assessment.', 'Widespread depression with aVR elevation identifies a very high-risk subgroup.'],
    monitoring: ['Continuous cardiac monitoring', 'Repeat ECG with any change in symptoms'],
    guidance: ['Risk-stratify with the GRACE score and follow the local NSTEMI pathway.'],
    tags: ['ischaemia', 'acs', 'urgent-review'],
  }),
  F({
    key: 'tInversion',
    label: 'T wave inversion',
    group: 'ischaemia',
    patterns: [/\bt[\s-]*wave inversion\b/i, /\binverted t\b/i, /\bt inversion\b/i, /nonspecific t wave/i, /\bt wave abnormalit/i],
    severity: 'significant',
    urgency: 'same-day',
    interpretation:
      'T wave inversion may reflect myocardial ischaemia, strain or a normal variant depending on the leads involved. Deep symmetrical anterior T wave inversion (Wellens pattern) indicates critical proximal left anterior descending stenosis and carries a high risk of anterior infarction.',
    differentials: ['Myocardial ischaemia', 'Wellens syndrome', 'Pulmonary embolism (right precordial inversion with S1Q3T3)', 'Left or right ventricular strain', 'Cardiomyopathy including arrhythmogenic right ventricular cardiomyopathy', 'Raised intracranial pressure', 'Normal variant — juvenile pattern, leads III, aVR, V1'],
    investigations: ['Serial troponin and ECG', 'Echocardiography', 'Consider CT pulmonary angiography where embolism is plausible', 'Compare with any previous ECG — new change is far more significant'],
    implications: ['Wellens pattern should not be stress tested; it requires angiography.'],
    monitoring: ['Cardiac monitoring where ischaemia is suspected', 'Repeat ECG'],
    guidance: ['Always compare with previous tracings; dynamic change is the key discriminator.'],
    tags: ['ischaemia', 'same-day-review'],
  }),
  F({
    key: 'qWaves',
    label: 'Pathological Q waves',
    group: 'ischaemia',
    patterns: [/pathological q/i, /pathologic q/i, /\bq[\s-]*waves?\b/i, /old (?:anterior|inferior|lateral|septal) (?:mi|infarct)/i, /\binfarct(?:ion)?, ?age indeterminate/i],
    severity: 'moderate',
    urgency: 'routine',
    interpretation:
      'Pathological Q waves (greater than 40 ms wide, or exceeding 25% of the R wave amplitude) indicate established myocardial scar. Their territory identifies the affected coronary distribution.',
    differentials: ['Prior myocardial infarction', 'Hypertrophic cardiomyopathy', 'Infiltrative cardiomyopathy including amyloid and sarcoid', 'Left bundle branch block', 'Pre-excitation (pseudo-Q waves)', 'Lead misplacement'],
    investigations: ['Echocardiography to assess regional wall motion and ventricular function', 'Compare with previous ECGs to establish whether the change is new', 'Review the cardiac history'],
    implications: ['Established scar implies impaired ventricular function and increased arrhythmic risk; secondary prevention should be reviewed.'],
    monitoring: ['Routine unless accompanied by acute changes'],
    guidance: ['Ensure secondary prevention therapy is optimised where ischaemic heart disease is confirmed.'],
    tags: ['prior-infarct'],
  }),

  // ─────────────────────────── CONDUCTION ───────────────────────────
  F({
    key: 'lbbb',
    label: 'Left bundle branch block',
    group: 'conduction',
    patterns: [/left bundle branch block/i, /\blbbb\b/i],
    severity: 'significant',
    urgency: 'same-day',
    interpretation:
      'Left bundle branch block widens the QRS beyond 120 ms with a broad notched R wave in the lateral leads. New left bundle branch block in the context of ischaemic symptoms is treated as an acute coronary syndrome. It also obscures conventional ST segment interpretation — the Sgarbossa criteria are required.',
    differentials: ['Ischaemic heart disease', 'Hypertensive heart disease', 'Aortic valve disease', 'Dilated cardiomyopathy', 'Primary conducting system disease (Lenègre disease)'],
    investigations: ['Compare with previous ECGs to establish whether it is new', 'Troponin', 'Echocardiography to assess ventricular function', 'Urgent cardiology discussion if new with chest pain'],
    implications: ['New left bundle branch block with ischaemic symptoms warrants immediate reperfusion assessment.', 'Left bundle branch block with reduced ejection fraction may be an indication for cardiac resynchronisation therapy.'],
    monitoring: ['Cardiac monitoring where new or symptomatic'],
    guidance: ['Apply the Sgarbossa (or modified Smith-Sgarbossa) criteria to assess for infarction in the presence of left bundle branch block.'],
    tags: ['conduction-abnormality', 'lbbb', 'same-day-review'],
  }),
  F({
    key: 'rbbb',
    label: 'Right bundle branch block',
    group: 'conduction',
    patterns: [/right bundle branch block/i, /\brbbb\b/i, /\bincomplete rbbb\b/i],
    severity: 'moderate',
    urgency: 'routine',
    interpretation:
      'Right bundle branch block produces an RSR′ pattern in V1 with a broad slurred S wave laterally. It is common and often benign in isolation, but new right bundle branch block may indicate right heart strain, ischaemia or pulmonary embolism.',
    differentials: ['Normal variant', 'Right ventricular strain including pulmonary embolism', 'Ischaemic heart disease', 'Congenital heart disease including atrial septal defect', 'Brugada syndrome (with characteristic ST morphology in V1–V2)', 'Chronic lung disease'],
    investigations: ['Compare with previous tracings', 'Echocardiography if new or if right heart strain is suspected', 'Consider pulmonary embolism where clinically indicated'],
    implications: ['Isolated right bundle branch block in an asymptomatic patient rarely requires intervention.', 'Bifascicular block with symptoms of syncope requires assessment for higher-grade block.'],
    monitoring: ['Routine unless new or symptomatic'],
    guidance: ['Right bundle branch block does not prevent interpretation of ST segments in the same way as left bundle branch block.'],
    tags: ['conduction-abnormality', 'rbbb'],
  }),
  F({
    key: 'avb1',
    label: 'First degree AV block',
    group: 'conduction',
    patterns: [/first[\s-]*degree (?:av|a-v|atrioventricular)?\s*block/i, /\b1st degree.*block/i, /prolonged pr/i],
    severity: 'minor',
    urgency: 'routine',
    interpretation: 'PR interval exceeding 200 ms with every P wave conducted. Usually benign, but marked prolongation (over 300 ms) can cause symptoms and may progress in the presence of bifascicular block.',
    differentials: ['Increased vagal tone (athletes)', 'Rate-limiting drugs — beta blockers, non-dihydropyridine calcium channel blockers, digoxin', 'Ischaemia, particularly inferior', 'Age-related conducting system disease', 'Myocarditis including Lyme disease', 'Electrolyte disturbance'],
    investigations: ['Medication review', 'Potassium and magnesium', 'Consider echocardiography if structural disease is suspected'],
    implications: ['Isolated first degree block requires no specific treatment; review rate-limiting drugs if symptomatic or progressive.'],
    monitoring: ['Repeat ECG if symptomatic or if new rate-limiting drugs are started'],
    guidance: ['Take care when adding further AV nodal blocking agents.'],
    tags: ['conduction-abnormality'],
  }),
  F({
    key: 'avb2t1',
    label: 'Second degree AV block, Mobitz type I (Wenckebach)',
    group: 'conduction',
    patterns: [/mobitz (?:type )?(?:i|1)\b/i, /wenckebach/i, /second[\s-]*degree.*type (?:i|1)\b/i],
    severity: 'moderate',
    urgency: 'same-day',
    interpretation: 'Progressive PR prolongation until a P wave fails to conduct. The block is typically at the AV node and is usually benign, though it may be symptomatic if bradycardic.',
    differentials: ['High vagal tone', 'AV nodal blocking drugs', 'Inferior myocardial ischaemia', 'Myocarditis', 'Post cardiac surgery'],
    investigations: ['Medication review', 'Electrolytes', 'Consider ambulatory monitoring if symptomatic', 'Troponin and ECG if ischaemia is suspected'],
    implications: ['Rarely progresses to complete heart block; pacing is seldom required unless symptomatic.'],
    monitoring: ['Cardiac monitoring if symptomatic or bradycardic'],
    guidance: ['Withhold AV nodal blocking drugs where possible if the patient is symptomatic.'],
    tags: ['conduction-abnormality', 'bradyarrhythmia'],
  }),
  F({
    key: 'avb2t2',
    label: 'Second degree AV block, Mobitz type II',
    group: 'conduction',
    patterns: [/mobitz (?:type )?(?:ii|2)\b/i, /second[\s-]*degree.*type (?:ii|2)\b/i, /\b2:1 (?:av )?block/i, /high[\s-]*grade av block/i],
    severity: 'critical',
    urgency: 'urgent',
    interpretation:
      'Intermittent non-conducted P waves without progressive PR prolongation. The block is infranodal and unpredictable, with a substantial risk of progression to complete heart block and asystole.',
    differentials: ['Conducting system disease', 'Anterior myocardial infarction', 'Cardiac surgery', 'Infiltrative disease — amyloid, sarcoid', 'Myocarditis including Lyme disease'],
    investigations: ['Urgent cardiology referral', 'Troponin and echocardiography', 'Electrolytes including potassium, calcium and magnesium', 'Medication review'],
    implications: ['Permanent pacemaker implantation is usually indicated irrespective of symptoms.', 'Temporary pacing may be required while awaiting definitive treatment.'],
    monitoring: ['Continuous cardiac monitoring in a monitored bed with immediate access to external pacing'],
    guidance: ['Avoid AV nodal blocking drugs. Ensure transcutaneous pacing is immediately available.'],
    tags: ['conduction-abnormality', 'bradyarrhythmia', 'pacing-consideration', 'urgent-review'],
  }),
  F({
    key: 'avb3',
    label: 'Complete (third degree) AV block',
    group: 'conduction',
    patterns: [/(?:complete|third[\s-]*degree|3rd degree) (?:av |a-v |atrioventricular )?(?:heart )?block/i, /\bchb\b/i, /av dissociation/i],
    severity: 'life-threatening',
    urgency: 'immediate',
    interpretation:
      'Complete atrioventricular dissociation with an independent escape rhythm. The escape rate and QRS width determine the immediate risk — a broad, slow ventricular escape is unstable and may deteriorate to asystole.',
    differentials: ['Inferior myocardial infarction (usually a narrow, more stable escape)', 'Anterior myocardial infarction (broad, unstable escape — poor prognosis)', 'Degenerative conducting system disease', 'Drug toxicity — digoxin, beta blockers, calcium channel blockers', 'Hyperkalaemia', 'Infiltrative disease', 'Lyme carditis', 'Post cardiac surgery or TAVI'],
    investigations: ['Immediate cardiology referral for temporary and then permanent pacing', 'Urgent potassium and digoxin level', 'Troponin and echocardiography', 'Full medication review'],
    implications: ['Risk of asystole, syncope and sudden death. Reversible causes — hyperkalaemia and drug toxicity — must be excluded immediately as they may obviate pacing.'],
    monitoring: ['Continuous cardiac monitoring with transcutaneous pacing pads applied', 'Continuous observation in a resuscitation-capable area'],
    guidance: ['Follow the adult bradycardia algorithm: atropine, then transcutaneous pacing or isoprenaline/adrenaline infusion pending transvenous pacing.'],
    tags: ['conduction-abnormality', 'bradyarrhythmia', 'pacing-consideration', 'immediate-review'],
  }),
  F({
    key: 'lafb',
    label: 'Left anterior fascicular block',
    group: 'conduction',
    patterns: [/left anterior fascicular block/i, /\blafb\b/i, /left anterior hemiblock/i],
    severity: 'minor',
    urgency: 'routine',
    interpretation: 'Left axis deviation with qR in aVL and a normal or minimally widened QRS. Common and usually of no consequence alone, but relevant when combined with right bundle branch block (bifascicular block).',
    differentials: ['Hypertensive heart disease', 'Ischaemic heart disease', 'Conducting system disease', 'Normal variant in the elderly'],
    investigations: ['Compare with previous tracings', 'Echocardiography if structural disease is suspected'],
    implications: ['With right bundle branch block this constitutes bifascicular block, which warrants attention if syncope occurs.'],
    monitoring: ['Routine'],
    guidance: [],
    tags: ['conduction-abnormality'],
  }),

  // ─────────────────────────── RHYTHM ───────────────────────────
  F({
    key: 'af',
    label: 'Atrial fibrillation',
    group: 'rhythm',
    patterns: [/atrial fibrillation/i, /\bafib\b/i, /\ba\.? ?fib\b/i, /irregularly irregular/i],
    severity: 'significant',
    urgency: 'same-day',
    interpretation:
      'Irregularly irregular rhythm with absent organised P waves. Management addresses three separate questions: rate or rhythm control, stroke prevention, and identification of a precipitant.',
    differentials: ['Hypertensive heart disease', 'Ischaemic heart disease', 'Valvular disease, particularly mitral', 'Thyrotoxicosis', 'Sepsis or acute illness', 'Alcohol', 'Pulmonary embolism', 'Electrolyte disturbance', 'Obstructive sleep apnoea'],
    investigations: ['Thyroid function tests', 'Electrolytes including potassium, magnesium and calcium', 'Full blood count', 'Echocardiography', 'Chest radiograph', 'Assess for sepsis and other acute precipitants'],
    implications: ['Formal stroke risk assessment (CHA₂DS₂-VASc) and bleeding risk assessment (for example ORBIT or HAS-BLED) are required to guide anticoagulation.', 'Haemodynamic instability with atrial fibrillation is an indication for emergency synchronised cardioversion.'],
    monitoring: ['Cardiac monitoring if the ventricular rate is uncontrolled or the patient is unstable', 'Repeat ECG after rate control'],
    guidance: ['Anticoagulation decisions should be based on stroke risk score, not on whether the atrial fibrillation is paroxysmal or persistent.', 'Rate control is first-line for most patients; rhythm control is preferred in newly diagnosed atrial fibrillation, symptoms despite rate control, or heart failure.'],
    tags: ['arrhythmia', 'af', 'anticoagulation-consideration', 'stroke-risk'],
  }),
  F({
    key: 'aflutter',
    label: 'Atrial flutter',
    group: 'rhythm',
    patterns: [/atrial flutter/i, /\bflutter waves?\b/i, /sawtooth/i],
    severity: 'significant',
    urgency: 'same-day',
    interpretation: 'Organised atrial activity at approximately 300 per minute with a sawtooth baseline, usually conducted 2:1 giving a ventricular rate close to 150. A regular rate of exactly 150 should always prompt a search for flutter waves.',
    differentials: ['Same substrate as atrial fibrillation', 'Post cardiac surgery', 'Chronic lung disease', 'Thyrotoxicosis'],
    investigations: ['Vagal manoeuvres or adenosine to unmask flutter waves where the diagnosis is uncertain', 'Thyroid function, electrolytes', 'Echocardiography'],
    implications: ['Carries the same thromboembolic risk as atrial fibrillation and requires the same anticoagulation assessment.', 'Often more resistant to rate control than atrial fibrillation; catheter ablation of the cavotricuspid isthmus is highly effective.'],
    monitoring: ['Cardiac monitoring if rate is uncontrolled'],
    guidance: ['Apply the same anticoagulation criteria as for atrial fibrillation.'],
    tags: ['arrhythmia', 'anticoagulation-consideration', 'stroke-risk'],
  }),
  F({
    key: 'svt',
    label: 'Supraventricular tachycardia',
    group: 'rhythm',
    patterns: [/supraventricular tachycardia/i, /\bsvt\b/i, /\bavnrt\b/i, /\bavrt\b/i, /narrow complex tachycardia/i],
    severity: 'significant',
    urgency: 'urgent',
    interpretation: 'Regular narrow complex tachycardia, typically 150–250 per minute, most commonly AV nodal re-entry. Responds to vagal manoeuvres and adenosine in the majority of cases.',
    differentials: ['AV nodal re-entrant tachycardia', 'AV re-entrant tachycardia (accessory pathway)', 'Atrial tachycardia', 'Atrial flutter with 2:1 conduction', 'Sinus tachycardia at high rates'],
    investigations: ['12-lead ECG during the tachycardia and after termination', 'Electrolytes and thyroid function', 'Consider echocardiography'],
    implications: ['Haemodynamic instability requires immediate synchronised cardioversion.', 'Record a 12-lead during adenosine administration — it is often diagnostic.'],
    monitoring: ['Continuous cardiac monitoring during treatment'],
    guidance: ['Follow the adult tachycardia algorithm: vagal manoeuvres, then adenosine if the complex is narrow and regular, with resuscitation facilities available.'],
    tags: ['arrhythmia', 'tachyarrhythmia', 'urgent-review'],
  }),
  F({
    key: 'vt',
    label: 'Ventricular tachycardia',
    group: 'rhythm',
    patterns: [/ventricular tachycardia/i, /\bvt\b(?!\s*ach)/i, /broad complex tachycardia/i, /wide complex tachycardia/i],
    severity: 'life-threatening',
    urgency: 'immediate',
    interpretation:
      'Broad complex tachycardia of ventricular origin. Any broad complex tachycardia should be treated as ventricular tachycardia until proven otherwise, particularly in a patient with structural heart disease. This is a peri-arrest rhythm.',
    differentials: ['Ventricular tachycardia', 'Supraventricular tachycardia with aberrancy', 'Pre-excited atrial fibrillation', 'Hyperkalaemia', 'Sodium channel blocker toxicity', 'Paced rhythm'],
    investigations: ['Immediate assessment for adverse features — shock, syncope, myocardial ischaemia, heart failure', 'Urgent potassium, magnesium and calcium', 'Troponin', 'Echocardiography once stabilised', 'Review for QT-prolonging and proarrhythmic drugs'],
    implications: ['Pulseless ventricular tachycardia requires immediate defibrillation and advanced life support.', 'Unstable ventricular tachycardia with a pulse requires synchronised cardioversion.'],
    monitoring: ['Continuous cardiac monitoring in a resuscitation area with defibrillator immediately available'],
    guidance: ['Follow the adult tachycardia algorithm. Correct electrolytes — particularly potassium and magnesium — as an integral part of management.'],
    tags: ['arrhythmia', 'tachyarrhythmia', 'immediate-review', 'peri-arrest'],
  }),
  F({
    key: 'sinusBrady',
    label: 'Sinus bradycardia',
    group: 'rhythm',
    patterns: [/sinus bradycardia/i, /\bbradycardia\b/i],
    severity: 'moderate',
    urgency: 'routine',
    interpretation: 'Sinus rhythm at a rate below 60 per minute. Frequently physiological in athletes and during sleep; pathological causes require exclusion when symptomatic or profound.',
    differentials: ['Physiological — athletic conditioning, sleep, high vagal tone', 'Rate-limiting drugs', 'Hypothyroidism', 'Hypothermia', 'Raised intracranial pressure', 'Inferior myocardial ischaemia', 'Sick sinus syndrome', 'Hyperkalaemia'],
    investigations: ['Medication review', 'Thyroid function', 'Electrolytes', 'Consider ambulatory monitoring if symptomatic'],
    implications: ['Treatment is indicated only where there are adverse features or symptoms attributable to the rate.'],
    monitoring: ['Cardiac monitoring if the rate is below 40 or the patient is symptomatic'],
    guidance: ['Follow the adult bradycardia algorithm where adverse features are present.'],
    tags: ['bradyarrhythmia'],
  }),
  F({
    key: 'sinusTach',
    label: 'Sinus tachycardia',
    group: 'rhythm',
    patterns: [/sinus tachycardia/i],
    severity: 'minor',
    urgency: 'routine',
    interpretation: 'Sinus rhythm above 100 per minute. Sinus tachycardia is almost always secondary — the cause should be identified and treated rather than the rate suppressed.',
    differentials: ['Pain, anxiety, fever', 'Hypovolaemia or haemorrhage', 'Sepsis', 'Anaemia', 'Hypoxaemia', 'Pulmonary embolism', 'Thyrotoxicosis', 'Drugs — salbutamol, inotropes, stimulants', 'Alcohol or drug withdrawal', 'Heart failure'],
    investigations: ['Full set of physiological observations', 'Full blood count, CRP, renal function', 'Consider blood gas, chest radiograph and assessment for embolism'],
    implications: ['Persistent unexplained sinus tachycardia in an inpatient is a red flag and should not be dismissed.'],
    monitoring: ['Repeat observations and ECG'],
    guidance: ['Treat the underlying cause; rate-limiting drugs are rarely appropriate as first-line therapy.'],
    tags: ['tachyarrhythmia'],
  }),
  F({
    key: 'paced',
    label: 'Paced rhythm',
    group: 'device',
    patterns: [/paced rhythm/i, /\bpacemaker\b/i, /ventricular pacing/i, /dual chamber pac/i, /\bpacing spikes?\b/i, /\ba-?v paced\b/i],
    severity: 'moderate',
    urgency: 'routine',
    interpretation: 'Pacing spikes are present. Ventricular pacing produces a broad QRS that obscures conventional ST segment interpretation, as with left bundle branch block; the modified Sgarbossa criteria apply when assessing for infarction.',
    differentials: ['Permanent pacemaker', 'Temporary pacing wire', 'Implantable cardioverter defibrillator with pacing function', 'Cardiac resynchronisation device'],
    investigations: ['Confirm the device type and indication from the patient record or device card', 'Device interrogation if malfunction is suspected', 'Chest radiograph to assess lead position', 'Potassium — hyperkalaemia raises the pacing threshold and can cause failure to capture'],
    implications: ['Assess for failure to capture, failure to sense and oversensing.', 'Diathermy, MRI and defibrillation require specific device precautions.'],
    monitoring: ['Cardiac monitoring where malfunction is suspected'],
    guidance: ['Apply the modified Sgarbossa criteria when assessing a paced ECG for acute infarction.'],
    tags: ['paced', 'device'],
  }),

  // ─────────────────────────── CHAMBER ───────────────────────────
  F({
    key: 'lvh',
    label: 'Left ventricular hypertrophy',
    group: 'chamber',
    patterns: [/left ventricular hypertrophy/i, /\blvh\b/i, /voltage criteria for lvh/i],
    severity: 'moderate',
    urgency: 'routine',
    interpretation: 'Voltage criteria for left ventricular hypertrophy, often with associated repolarisation change ("strain"). Electrocardiographic criteria have high specificity but low sensitivity; echocardiography is the definitive assessment.',
    differentials: ['Hypertensive heart disease', 'Aortic stenosis', 'Hypertrophic cardiomyopathy', 'Infiltrative cardiomyopathy (though voltage is often low in amyloid)', 'Athletic remodelling', 'Thin chest wall producing false positive voltage'],
    investigations: ['Echocardiography', 'Blood pressure assessment including ambulatory monitoring', 'Renal function and urinalysis for end-organ damage'],
    implications: ['Left ventricular hypertrophy is an independent cardiovascular risk factor and repolarisation change may mimic or mask ischaemia.'],
    monitoring: ['Blood pressure control and periodic echocardiography'],
    guidance: ['Optimise blood pressure control; regression of hypertrophy improves outcome.'],
    tags: ['chamber-abnormality', 'lvh'],
  }),
  F({
    key: 'rvh',
    label: 'Right ventricular hypertrophy / right heart strain',
    group: 'chamber',
    patterns: [/right ventricular hypertrophy/i, /\brvh\b/i, /right heart strain/i, /right axis deviation/i, /s1q3t3/i],
    severity: 'significant',
    urgency: 'same-day',
    interpretation: 'Features of right ventricular pressure or volume overload. In an acutely breathless patient, new right heart strain raises the possibility of pulmonary embolism.',
    differentials: ['Pulmonary embolism', 'Chronic lung disease with cor pulmonale', 'Pulmonary hypertension', 'Congenital heart disease', 'Mitral stenosis'],
    investigations: ['CT pulmonary angiography where embolism is suspected', 'Echocardiography', 'Arterial blood gas', 'D-dimer where pre-test probability is low or intermediate'],
    implications: ['Right ventricular strain in confirmed pulmonary embolism identifies intermediate-risk disease requiring closer monitoring.'],
    monitoring: ['Cardiac and oxygen saturation monitoring'],
    guidance: ['S1Q3T3 is neither sensitive nor specific for pulmonary embolism — sinus tachycardia is the commonest ECG finding.'],
    tags: ['chamber-abnormality', 'pe-consideration'],
  }),
  F({
    key: 'atrialEnlargement',
    label: 'Atrial enlargement',
    group: 'chamber',
    patterns: [/(?:left|right) atrial (?:enlargement|abnormality|dilat)/i, /\bp[\s-]*mitrale\b/i, /\bp[\s-]*pulmonale\b/i],
    severity: 'minor',
    urgency: 'routine',
    interpretation: 'P wave morphology suggesting atrial enlargement — a broad bifid P wave (P mitrale) indicates left atrial enlargement, and a tall peaked P wave (P pulmonale) indicates right atrial enlargement.',
    differentials: ['Mitral valve disease', 'Hypertensive heart disease with diastolic dysfunction', 'Chronic lung disease and pulmonary hypertension', 'Tricuspid valve disease', 'Congenital heart disease'],
    investigations: ['Echocardiography'],
    implications: ['Left atrial enlargement predisposes to atrial fibrillation.'],
    monitoring: ['Routine'],
    guidance: [],
    tags: ['chamber-abnormality'],
  }),

  // ─────────────────────────── REPOLARISATION / ELECTROLYTE ───────────────────────────
  F({
    key: 'longQt',
    label: 'Prolonged QT interval',
    group: 'repolarisation',
    patterns: [/prolonged qt/i, /\blong qt\b/i, /qtc? prolongation/i],
    severity: 'critical',
    urgency: 'urgent',
    interpretation:
      'QT prolongation predisposes to torsades de pointes. Risk rises steeply above a QTc of 500 ms. Causes are frequently multiple and additive — drugs plus electrolyte disturbance plus bradycardia.',
    differentials: ['QT-prolonging drugs — many antiarrhythmics, antipsychotics, antidepressants, macrolides, fluoroquinolones, antifungals, ondansetron, methadone', 'Hypokalaemia, hypomagnesaemia, hypocalcaemia', 'Bradycardia and complete heart block', 'Congenital long QT syndrome', 'Hypothermia', 'Myocardial ischaemia', 'Raised intracranial pressure'],
    investigations: ['Potassium, magnesium and calcium', 'Full medication review with reference to a QT drug database', 'Thyroid function', 'Family history of sudden death or syncope', 'Cardiology referral where congenital long QT is suspected'],
    implications: ['Torsades de pointes may degenerate to ventricular fibrillation.', 'Correct electrolytes aggressively — potassium to the upper reference range and magnesium replacement even when the level is normal.'],
    monitoring: ['Continuous cardiac monitoring where the QTc exceeds 500 ms', 'Repeat ECG after any culprit drug is stopped and after electrolyte correction'],
    guidance: ['Stop all non-essential QT-prolonging drugs. Intravenous magnesium sulfate is the treatment for torsades de pointes irrespective of the serum magnesium.'],
    tags: ['qt-prolongation-risk', 'arrhythmia-risk', 'urgent-review'],
  }),
  F({
    key: 'hyperkalaemiaEcg',
    label: 'ECG changes associated with hyperkalaemia',
    group: 'electrolyte',
    patterns: [/peaked t/i, /tented t/i, /tall t waves?/i, /hyperkal(?:a)?emi/i, /sine wave/i],
    severity: 'life-threatening',
    urgency: 'immediate',
    interpretation:
      'Tall peaked T waves are the earliest change of hyperkalaemia, progressing through PR prolongation, P wave flattening and loss, QRS widening, and finally a sine wave pattern preceding asystole. ECG changes indicate cardiac membrane instability and mandate immediate treatment.',
    differentials: ['Hyperkalaemia of any cause', 'Acute myocardial injury (hyperacute T waves)', 'Benign early repolarisation'],
    investigations: ['Immediate potassium measurement — a blood gas analyser gives the fastest result', 'Renal function, calcium, magnesium', 'Venous blood gas for acidosis', 'Full medication review'],
    implications: ['ECG changes of hyperkalaemia are an indication for immediate intravenous calcium for myocardial stabilisation, followed by shifting and removal strategies.'],
    monitoring: ['Continuous cardiac monitoring', 'Repeat potassium 1 hour after treatment then 2–4 hourly'],
    guidance: ['Give 10 mL of 10% calcium chloride or 30 mL of 10% calcium gluconate intravenously immediately, then insulin–dextrose and salbutamol, and address removal and the underlying cause.'],
    tags: ['hyperkalaemia', 'electrolyte-ecg', 'immediate-review', 'arrhythmia-risk'],
  }),
  F({
    key: 'hypokalaemiaEcg',
    label: 'ECG changes associated with hypokalaemia',
    group: 'electrolyte',
    patterns: [/\bu waves?\b/i, /prominent u/i, /hypokal(?:a)?emi/i, /flattened t waves?/i],
    severity: 'significant',
    urgency: 'urgent',
    interpretation: 'Flattened T waves, ST depression and prominent U waves with an apparently long QT are characteristic of hypokalaemia, which is arrhythmogenic particularly in the presence of digoxin or ischaemia.',
    differentials: ['Hypokalaemia', 'Hypomagnesaemia', 'Digoxin effect', 'Bradycardia'],
    investigations: ['Potassium and magnesium', 'Venous blood gas', 'Medication review including diuretics', 'Digoxin level if applicable'],
    implications: ['Predisposes to ventricular arrhythmia; correct magnesium alongside potassium.'],
    monitoring: ['Cardiac monitoring during intravenous replacement', 'Repeat ECG after correction'],
    guidance: ['Replace magnesium concurrently — hypokalaemia is refractory to correction while magnesium is depleted.'],
    tags: ['hypokalaemia', 'electrolyte-ecg', 'arrhythmia-risk'],
  }),
  F({
    key: 'hypocalcaemiaEcg',
    label: 'ECG changes associated with hypocalcaemia',
    group: 'electrolyte',
    patterns: [/hypocalc(?:a)?emi/i, /prolonged st segment/i],
    severity: 'significant',
    urgency: 'urgent',
    interpretation: 'Hypocalcaemia prolongs the ST segment and therefore the QT interval, without altering T wave morphology, predisposing to torsades de pointes.',
    differentials: ['Hypocalcaemia of any cause', 'Hypoparathyroidism', 'Vitamin D deficiency', 'Massive transfusion (citrate)', 'Pancreatitis'],
    investigations: ['Calcium with albumin, or ionised calcium', 'Magnesium, phosphate, parathyroid hormone and vitamin D'],
    implications: ['Corrected QT prolongation with arrhythmic risk.'],
    monitoring: ['Cardiac monitoring in severe hypocalcaemia', 'Repeat ECG after replacement'],
    guidance: ['Intravenous calcium gluconate for symptomatic or severe hypocalcaemia; correct magnesium concurrently.'],
    tags: ['hypocalcaemia', 'electrolyte-ecg', 'qt-prolongation-risk'],
  }),
  F({
    key: 'hypercalcaemiaEcg',
    label: 'ECG changes associated with hypercalcaemia',
    group: 'electrolyte',
    patterns: [/hypercalc(?:a)?emi/i, /short(?:ened)? qt/i],
    severity: 'moderate',
    urgency: 'same-day',
    interpretation: 'Hypercalcaemia shortens the ST segment and QT interval; at very high levels an Osborn-like wave and arrhythmia may occur. Digoxin toxicity is potentiated.',
    differentials: ['Hypercalcaemia of any cause', 'Digoxin effect', 'Hyperthermia', 'Congenital short QT syndrome'],
    investigations: ['Calcium with albumin, parathyroid hormone', 'Digoxin level if applicable', 'Renal function'],
    implications: ['Withhold digoxin where hypercalcaemia is significant.'],
    monitoring: ['Repeat ECG after correction'],
    guidance: ['Treat the hypercalcaemia — see the electrolyte section.'],
    tags: ['hypercalcaemia', 'electrolyte-ecg'],
  }),
  F({
    key: 'pericarditis',
    label: 'Features suggestive of pericarditis',
    group: 'other',
    patterns: [/pericarditis/i, /\bpr depression\b/i, /widespread (?:concave )?st elevation/i],
    severity: 'significant',
    urgency: 'same-day',
    interpretation: 'Widespread concave ST elevation with PR segment depression, and reciprocal changes in aVR, is characteristic of acute pericarditis. The principal task is to distinguish this from ST-elevation myocardial infarction.',
    differentials: ['Viral or idiopathic pericarditis', 'Post-infarction pericarditis (Dressler syndrome)', 'Uraemic pericarditis', 'Autoimmune disease', 'Malignancy', 'Tuberculosis', 'ST-elevation myocardial infarction (the critical alternative)'],
    investigations: ['Troponin — elevation indicates myopericarditis', 'Echocardiography to assess for effusion and tamponade', 'Inflammatory markers', 'Renal function', 'Chest radiograph'],
    implications: ['Assess for pericardial effusion and tamponade.', 'Anticoagulation increases the risk of haemorrhagic effusion.'],
    monitoring: ['Repeat echocardiography if an effusion is present', 'Cardiac monitoring where myopericarditis is suspected'],
    guidance: ['NSAIDs with colchicine are the standard treatment for acute idiopathic pericarditis; colchicine reduces recurrence.'],
    tags: ['pericarditis', 'same-day-review'],
  }),
  F({
    key: 'lowVoltage',
    label: 'Low voltage QRS complexes',
    group: 'other',
    patterns: [/low voltage/i, /\blow qrs voltage\b/i],
    severity: 'moderate',
    urgency: 'same-day',
    interpretation: 'QRS amplitude below 5 mm in the limb leads or 10 mm in the precordial leads. Consider anything that increases the distance between the myocardium and the electrodes, or that infiltrates the myocardium.',
    differentials: ['Pericardial effusion', 'Obesity', 'Chronic obstructive pulmonary disease and hyperinflation', 'Pleural effusion', 'Infiltrative cardiomyopathy — amyloidosis', 'Hypothyroidism', 'Extensive myocardial infarction'],
    investigations: ['Echocardiography', 'Chest radiograph', 'Thyroid function', 'Consider amyloid screening where there is low voltage with left ventricular hypertrophy on echocardiography'],
    implications: ['Low voltage with electrical alternans and tachycardia suggests cardiac tamponade.'],
    monitoring: ['Echocardiographic follow-up'],
    guidance: [],
    tags: ['low-voltage'],
  }),
  F({
    key: 'wpw',
    label: 'Pre-excitation (delta wave)',
    group: 'other',
    patterns: [/pre[\s-]*excitation/i, /\bdelta waves?\b/i, /wolff[\s-]*parkinson/i, /\bwpw\b/i],
    severity: 'significant',
    urgency: 'same-day',
    interpretation: 'A short PR interval with a delta wave indicates ventricular pre-excitation via an accessory pathway. The principal danger is pre-excited atrial fibrillation, which can degenerate to ventricular fibrillation.',
    differentials: ['Wolff–Parkinson–White syndrome', 'Other accessory pathway variants'],
    investigations: ['Cardiology referral for risk stratification and consideration of electrophysiological study and ablation', 'Echocardiography (association with Ebstein anomaly)'],
    implications: ['AV nodal blocking drugs (adenosine, verapamil, diltiazem, digoxin, beta blockers) are contraindicated in pre-excited atrial fibrillation as they promote conduction down the accessory pathway.'],
    monitoring: ['Cardiac monitoring if arrhythmic'],
    guidance: ['Pre-excited atrial fibrillation is treated with synchronised cardioversion, or a sodium channel blocker such as flecainide where stable and specialist advice supports it.'],
    tags: ['pre-excitation', 'arrhythmia-risk'],
  }),
];

export const ECG_FEATURE_BY_KEY: Record<string, EcgFeatureDef> = Object.fromEntries(
  ECG_FEATURES.map((f) => [f.key, f]),
);

/** Detect features from free text (machine statements or clinician notes). */
export function detectEcgFeatures(text: string): string[] {
  if (!text) return [];
  const hits = new Set<string>();
  for (const f of ECG_FEATURES) {
    if (f.patterns.some((p) => p.test(text))) hits.add(f.key);
  }
  // Avoid double-reporting: a STEMI statement implies ST elevation only.
  if (hits.has('stElevation') && hits.has('pericarditis') && /stemi|acute mi/i.test(text)) {
    hits.delete('pericarditis');
  }
  return [...hits];
}

export const URGENCY_LABEL: Record<EcgUrgency, string> = {
  routine: 'Routine review',
  'same-day': 'Same-day clinical review',
  urgent: 'Urgent review required',
  immediate: 'IMMEDIATE clinical attention required',
};

export const URGENCY_RANK: Record<EcgUrgency, number> = {
  routine: 0,
  'same-day': 1,
  urgent: 2,
  immediate: 3,
};
