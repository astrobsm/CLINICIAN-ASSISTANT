import { useState } from 'react';
import { Card, Field, Toggle } from './common';
import type { PatientContext, Sex } from '../clinical/types';

export function PatientPanel({
  patient,
  setPatient,
}: {
  patient: PatientContext;
  setPatient: (p: Partial<PatientContext>) => void;
}) {
  const [allergyDraft, setAllergyDraft] = useState('');

  const numeric = (v: string): number | null => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const addAllergy = () => {
    const value = allergyDraft.trim();
    if (!value) return;
    if (!patient.allergies.some((a) => a.toLowerCase() === value.toLowerCase())) {
      setPatient({ allergies: [...patient.allergies, value] });
    }
    setAllergyDraft('');
  };

  return (
    <div className="grid two">
      <Card title="Patient identification">
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Patient name">
            <input type="text" value={patient.name} onChange={(e) => setPatient({ name: e.target.value })} placeholder="Surname, Forename" autoComplete="off" />
          </Field>
          <Field label="Hospital number">
            <input type="text" value={patient.hospitalNumber} onChange={(e) => setPatient({ hospitalNumber: e.target.value })} placeholder="e.g. H1234567" autoComplete="off" />
          </Field>
          <Field label="Age (years)" hint="Required for eGFR and dosing">
            <input type="number" min={0} max={130} value={patient.age ?? ''} onChange={(e) => setPatient({ age: numeric(e.target.value) })} />
          </Field>
          <Field label="Sex" hint="Sets sex-specific reference intervals">
            <select value={patient.sex} onChange={(e) => setPatient({ sex: e.target.value as Sex })}>
              <option value="unspecified">Not recorded</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Weight (kg)" hint="Required for creatinine clearance">
            <input type="number" min={0} max={400} step="0.1" value={patient.weightKg ?? ''} onChange={(e) => setPatient({ weightKg: numeric(e.target.value) })} />
          </Field>
          <Field label="Height (cm)">
            <input type="number" min={0} max={260} value={patient.heightCm ?? ''} onChange={(e) => setPatient({ heightCm: numeric(e.target.value) })} />
          </Field>
          <Field label="Clinical location / ward">
            <input type="text" value={patient.ward} onChange={(e) => setPatient({ ward: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Consultant">
            <input type="text" value={patient.consultant} onChange={(e) => setPatient({ consultant: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Sample / report date">
            <input type="text" value={patient.collectedAt} onChange={(e) => setPatient({ collectedAt: e.target.value })} placeholder="e.g. 01/08/2026 09:15" autoComplete="off" />
          </Field>
          <Field label="Baseline creatinine (µmol/L)" hint="Enables KDIGO AKI staging">
            <input type="number" min={0} max={3000} value={patient.baselineCreatinine ?? ''} onChange={(e) => setPatient({ baselineCreatinine: numeric(e.target.value) })} />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Working diagnosis">
            <input type="text" value={patient.diagnosis} onChange={(e) => setPatient({ diagnosis: e.target.value })} autoComplete="off" />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Clinical details" hint="Presenting problem and relevant history">
            <textarea value={patient.clinicalDetails} onChange={(e) => setPatient({ clinicalDetails: e.target.value })} rows={3} />
          </Field>
        </div>
      </Card>

      <div className="grid" style={{ gap: 16 }}>
        <Card title="Clinical context">
          <p className="small muted" style={{ marginTop: 0 }}>
            These flags switch on specific correlation rules — for example fever plus a positive culture, or abnormal
            coagulation with planned surgery. Setting them accurately materially changes the analysis.
          </p>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Toggle label="Febrile" checked={patient.fever} onChange={(v) => setPatient({ fever: v })} />
            <Toggle label="Surgery planned" checked={patient.plannedSurgery} onChange={(v) => setPatient({ plannedSurgery: v })} />
            <Toggle label="Anticoagulated" checked={patient.onAnticoagulant} onChange={(v) => setPatient({ onAnticoagulant: v })} />
            <Toggle label="Pregnant" checked={patient.pregnant} onChange={(v) => setPatient({ pregnant: v })} />
            <Toggle label="Known CKD" checked={patient.knownCKD} onChange={(v) => setPatient({ knownCKD: v })} />
            <Toggle label="Immunosuppressed" checked={patient.immunosuppressed} onChange={(v) => setPatient({ immunosuppressed: v })} />
          </div>
          {patient.onAnticoagulant && (
            <div style={{ marginTop: 12 }}>
              <Field label="Anticoagulant" hint="Name the agent — DOACs are interpreted differently from warfarin and heparin">
                <input
                  type="text"
                  list="anticoag-list"
                  value={patient.anticoagulantName}
                  onChange={(e) => setPatient({ anticoagulantName: e.target.value })}
                  placeholder="e.g. apixaban, warfarin, enoxaparin"
                  autoComplete="off"
                />
              </Field>
              <datalist id="anticoag-list">
                {['warfarin', 'apixaban', 'rivaroxaban', 'edoxaban', 'dabigatran', 'enoxaparin', 'dalteparin', 'unfractionated heparin', 'fondaparinux'].map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </div>
          )}
        </Card>

        <Card title="Drug allergies">
          <p className="small muted" style={{ marginTop: 0 }}>
            Entered allergies are checked against every susceptible antimicrobial the microbiology module suggests,
            including class cross-reactivity.
          </p>
          <div className="btn-row">
            <input
              type="text"
              value={allergyDraft}
              onChange={(e) => setAllergyDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAllergy(); } }}
              placeholder="e.g. penicillin"
              style={{ flex: 1, minWidth: 160 }}
              autoComplete="off"
            />
            <button className="btn" onClick={addAllergy}>Add</button>
          </div>
          <div className="chips" style={{ marginTop: 10 }}>
            {patient.allergies.length === 0 && <span className="small faint">None recorded</span>}
            {patient.allergies.map((a) => (
              <span key={a} className="chip accent">
                {a}
                <button
                  className="btn small"
                  style={{ border: 'none', background: 'transparent', padding: '0 0 0 4px' }}
                  onClick={() => setPatient({ allergies: patient.allergies.filter((x) => x !== a) })}
                  aria-label={`Remove ${a}`}
                >×</button>
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
