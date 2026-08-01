import { useEffect, useState } from 'react';
import { NexoraLogo } from './brand/NexoraLogo';
import { applyRangeOverrides, loadInstitution, type InstitutionConfig } from './config/institution';
import { useSession } from './store/session';
import { AnalysisPanel } from './ui/AnalysisPanel';
import { PatientPanel } from './ui/PatientPanel';
import { ReportPanel } from './ui/ReportPanel';
import { ReviewPanel } from './ui/ReviewPanel';
import { ScanPanel } from './ui/ScanPanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { InstallBanner } from './ui/InstallBanner';
import { SEVERITY_LABEL, severityRank } from './clinical/types';
import { alertingFindings } from './clinical/analyse';

type TabId = 'patient' | 'scan' | 'review' | 'analysis' | 'report' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'patient', label: 'Patient' },
  { id: 'scan', label: 'Scan' },
  { id: 'review', label: 'Review' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'report', label: 'Report' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const session = useSession();
  const [tab, setTab] = useState<TabId>('patient');
  const [institution, setInstitution] = useState<InstitutionConfig>(() => {
    const cfg = loadInstitution();
    applyRangeOverrides(cfg.rangeOverrides);
    return cfg;
  });

  const { analysis, extraction, documents } = session;
  const alertCount =
    alertingFindings(analysis.modules, 'critical').length +
    analysis.correlations.filter((c) => severityRank(c.severity) >= severityRank('critical')).length;

  // Warn before losing an unsaved session.
  useEffect(() => {
    const hasData = documents.length > 0 || extraction.analytes.length > 0 || !!session.patient.name;
    if (!hasData) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [documents.length, extraction.analytes.length, session.patient.name]);

  const counts: Record<TabId, number | null> = {
    patient: null,
    scan: documents.length || null,
    review: extraction.analytes.length + extraction.observations.length + extraction.micro.length + extraction.ecg.length || null,
    analysis: alertCount || null,
    report: null,
    settings: null,
  };

  return (
    <div className="app">
      <header className="app-header">
        <NexoraLogo size={38} />
        <div className="brand-divider" />
        <div className="app-title">
          <h1>Clinician Assistant</h1>
          <div className="sub">Multi-modal clinical diagnostic analysis · credit: NEXORA Innovations</div>
        </div>
        <div className="offline-pill" title="All processing is performed locally. No patient information leaves this device.">
          <span className="dot" />
          Offline · on-device analysis
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {counts[t.id] !== null && (
              <span
                className="badge"
                style={t.id === 'analysis' && alertCount > 0
                  ? { background: 'rgba(255,45,111,.2)', borderColor: 'var(--lifethreat)', color: '#ff8fb4' }
                  : undefined}
              >
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main>
        <InstallBanner />
        {tab === 'patient' && <PatientPanel patient={session.patient} setPatient={session.setPatient} />}
        {tab === 'scan' && (
          <ScanPanel
            documents={documents}
            busy={session.busy}
            progress={session.progress}
            addFiles={session.addFiles}
            removeDocument={session.removeDocument}
            session={session}
          />
        )}
        {tab === 'review' && <ReviewPanel session={session} />}
        {tab === 'analysis' && <AnalysisPanel analysis={analysis} />}
        {tab === 'report' && <ReportPanel session={session} institution={institution} />}
        {tab === 'settings' && (
          <SettingsPanel institution={institution} setInstitution={setInstitution} onClearSession={session.clearAll} />
        )}
      </main>

      <footer className="app-footer no-print">
        <NexoraLogo size={30} />
        <div>
          <div style={{ color: 'var(--text-dim)', fontWeight: 600 }}>
            Clinician Assistant — developed by NEXORA Innovations : Building Solutions
          </div>
          <div>
            Clinical decision support only. Does not diagnose or prescribe. Verify all values against source documents;
            all outputs require review by a competent clinician.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div>Session severity: {SEVERITY_LABEL[analysis.overallSeverity]}</div>
          <div>{documents.length} document{documents.length === 1 ? '' : 's'} · {extraction.analytes.length} values</div>
        </div>
      </footer>
    </div>
  );
}
