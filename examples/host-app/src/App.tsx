import { registerClinicalEmbedElement } from '@crosdat/embed';
import {
  ClerkingEmbed,
  ClinicalCalculatorsEmbed,
  ClinicalGuideEmbed,
  ClinicalLearningStationEmbed,
  CrosdatClinicalProvider,
  DosePrescriberEmbed,
  GrowthChartEmbed,
  NeonatalTpnEmbed,
} from '@crosdat/react';
import {
  AppearanceThemePreset,
  BiologicalSex,
  type AppearanceConfig,
  type SanitizedAnalyticsEvent,
} from '@crosdat/sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

registerClinicalEmbedElement();

declare global {
  interface Window {
    __crosdatHostEvents?: Array<{ kind: string; module?: string; detail: unknown }>;
  }
}

const THEME_LABELS: Array<{ value: AppearanceThemePreset; label: string }> = [
  { value: AppearanceThemePreset.NEUTRAL_DARK, label: 'Plain Dark' },
  { value: AppearanceThemePreset.CROSDAT_DARK, label: 'crosdat Dark' },
  { value: AppearanceThemePreset.CROSDAT_LIGHT, label: 'crosdat Light' },
  { value: AppearanceThemePreset.NEUTRAL_CLINICAL, label: 'Neutral Clinical' },
  { value: AppearanceThemePreset.HIGH_CONTRAST, label: 'High Contrast' },
];

type DemoViewMode = 'all-embeds' | 'http-api';

export function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const urlToken = params.get('token') ?? '';
  const [viewMode, setViewMode] = useState<DemoViewMode>('all-embeds');
  const [embedBaseUrl, setEmbedBaseUrl] = useState(
    params.get('embedBaseUrl') ?? `${window.location.protocol}//${window.location.hostname}:18081/embed`,
  );
  const [apiBaseUrl, setApiBaseUrl] = useState(
    params.get('apiBaseUrl') ?? 'http://127.0.0.1:18080/api/v1',
  );
  const [sessionToken, setSessionToken] = useState(urlToken);
  const [draftToken, setDraftToken] = useState(urlToken);
  const [mintStatus, setMintStatus] = useState<string>(
    urlToken ? 'Using ?token= from URL query parameter' : 'Minting live demo session...',
  );
  const [isMinting, setIsMinting] = useState(false);
  const [theme, setTheme] = useState<AppearanceThemePreset>(
    (params.get('theme') as AppearanceThemePreset) || AppearanceThemePreset.NEUTRAL_DARK,
  );
  const [primaryColor, setPrimaryColor] = useState(params.get('primary') ?? '#0f766e');
  const [hideBranding, setHideBranding] = useState(params.get('hideBranding') === 'true');
  const [hideFeedback, setHideFeedback] = useState(params.get('hideFeedback') === 'true');
  const [events, setEvents] = useState<Array<{ kind: string; module?: string; detail: unknown }>>([]);
  const [httpOutput, setHttpOutput] = useState<string>('Run a headless HTTP gateway call to inspect live HQ output.');
  const [httpBusy, setHttpBusy] = useState(false);
  const wcRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-host-theme', theme);
    document.documentElement.style.setProperty('--host-accent', primaryColor || '#0f766e');
  }, [theme, primaryColor]);

  const pushEvent = (kind: string, module: string | undefined, detail: unknown) => {
    const entry = { kind, module, detail };
    window.__crosdatHostEvents = [...(window.__crosdatHostEvents ?? []), entry];
    setEvents((prev) => [...prev.slice(-30), entry]);
  };

  const handleMintFreshSession = useCallback(async () => {
    setIsMinting(true);
    setMintStatus('Minting embed session token from HQ /api/v1/sessions...');
    try {
      const res = await fetch('/__demo/mint-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: window.location.origin,
          module: 'all',
        }),
      });
      const json = (await res.json()) as {
        sessionToken?: string;
        origin?: string;
        apiKeyPrefix?: string;
        error?: string;
      };
      if (!res.ok || !json.sessionToken) {
        setMintStatus(`Mint failed: ${json.error ?? `HTTP ${res.status}`}`);
        return;
      }
      setDraftToken(json.sessionToken);
      setSessionToken(json.sessionToken);
      setMintStatus(
        `Active demo session minted (${json.apiKeyPrefix ?? 'ck_test_*'}) for ${json.origin ?? window.location.origin}`,
      );
    } catch (err) {
      setMintStatus(`Mint error: ${(err as Error).message}`);
    } finally {
      setIsMinting(false);
    }
  }, []);

  useEffect(() => {
    if (!urlToken) {
      void handleMintFreshSession();
    }
  }, [handleMintFreshSession, urlToken]);

  useEffect(() => {
    const el = wcRef.current;
    if (!el) return undefined;
    const onWcReady = (e: Event) => pushEvent('wc:ready', 'growth-chart', (e as CustomEvent).detail);
    const onWcFeedback = (e: Event) => pushEvent('feedback', 'growth-chart', (e as CustomEvent).detail);
    const onWcError = (e: Event) => pushEvent('wc:error', 'growth-chart', (e as CustomEvent).detail);
    el.addEventListener('crosdat:ready', onWcReady);
    el.addEventListener('crosdat:feedback', onWcFeedback);
    el.addEventListener('crosdat:error', onWcError);
    return () => {
      el.removeEventListener('crosdat:ready', onWcReady);
      el.removeEventListener('crosdat:feedback', onWcFeedback);
      el.removeEventListener('crosdat:error', onWcError);
    };
  }, [sessionToken]);

  const callHeadlessGateway = async (endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown) => {
    setHttpBusy(true);
    try {
      const res = await fetch(`/__demo/hq/${endpoint.replace(/^\/+/, '')}`, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      setHttpOutput(`${method} /api/${endpoint} -> HTTP ${res.status}\n${JSON.stringify(data, null, 2)}`);
    } catch (err) {
      setHttpOutput(`Request error: ${(err as Error).message}`);
    } finally {
      setHttpBusy(false);
    }
  };

  const patientContext = useMemo(
    () => ({
      ageDays: 910,
      sex: BiologicalSex.FEMALE,
      weightKg: 13.4,
      heightCm: 92,
      gestationalAgeDays: 273,
    }),
    [],
  );

  const appearance: AppearanceConfig = useMemo(
    () => ({
      theme,
      hideBranding,
      hideFeedback,
      variables: { colorPrimary: primaryColor || undefined },
    }),
    [theme, hideBranding, hideFeedback, primaryColor],
  );

  const handleAnalytics = useCallback((ev: SanitizedAnalyticsEvent) => {
    pushEvent('analytics', ev.module, ev);
  }, []);

  return (
    <div className="host-shell">
      <header className="host-header">
        <div className="host-title-group">
          <h1>crosdat SDK External Host Demo</h1>
          <p className="host-subtitle">
            Standalone host app showing React embeds, framework-free Web Components, and headless HQ HTTP reference content calls.
          </p>
        </div>
        <nav className="host-nav-pills">
          <a className="host-link-btn" href="/vanilla.html">
            Open Vanilla HTML + Plain CSS Demo
          </a>
          <button
            type="button"
            className={`host-btn ${viewMode === 'all-embeds' ? 'primary' : ''}`}
            onClick={() => setViewMode('all-embeds')}
          >
            All Embeds (React + WC)
          </button>
          <button
            type="button"
            className={`host-btn ${viewMode === 'http-api' ? 'primary' : ''}`}
            onClick={() => setViewMode('http-api')}
          >
            Headless HTTP Reference API
          </button>
        </nav>
      </header>

      <div className="host-toolbar">
        <span className="host-badge" data-testid="demo-status">
          {mintStatus}
        </span>
        <label className="host-field">
          Embed base
          <input className="host-input" value={embedBaseUrl} onChange={(e) => setEmbedBaseUrl(e.target.value)} size={28} />
        </label>
        <label className="host-field">
          API base
          <input className="host-input" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} size={28} />
        </label>
        <label className="host-field">
          Session token
          <input
            className="host-input"
            value={draftToken}
            onChange={(e) => setDraftToken(e.target.value)}
            placeholder="Minting or paste token..."
            size={24}
          />
        </label>
        <label className="host-field">
          Theme
          <select
            className="host-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as AppearanceThemePreset)}
          >
            {THEME_LABELS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="host-field">
          Primary
          <input className="host-input" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} size={10} />
        </label>
        <label className="host-field">
          <input type="checkbox" checked={hideBranding} onChange={(e) => setHideBranding(e.target.checked)} />
          Hide footer branding
        </label>
        <label className="host-field">
          <input type="checkbox" checked={hideFeedback} onChange={(e) => setHideFeedback(e.target.checked)} />
          Hide feedback
        </label>
        <button type="button" className="host-btn" onClick={() => setSessionToken(draftToken.trim())}>
          Mount Embeds
        </button>
        <button type="button" className="host-btn primary" disabled={isMinting} onClick={() => void handleMintFreshSession()}>
          {isMinting ? 'Minting...' : 'Mint Fresh Session'}
        </button>
      </div>

      {viewMode === 'http-api' ? (
        <section className="host-panel">
          <div className="host-panel-head">
            <h2>Headless HQ HTTP Gateway (/api/v1/*)</h2>
            <div className="host-nav-pills">
              <button type="button" className="host-btn" disabled={httpBusy} onClick={() => void callHeadlessGateway('v1/guidelines/search?query=sepsis&limit=3')}>
                Guidelines Search
              </button>
              <button type="button" className="host-btn" disabled={httpBusy} onClick={() => void callHeadlessGateway('v1/calculators')}>
                List Calculators
              </button>
              <button
                type="button"
                className="host-btn"
                disabled={httpBusy}
                onClick={() =>
                  void callHeadlessGateway('v1/clerking/evaluate', 'POST', {
                    patient: { ageDays: 910, sex: BiologicalSex.FEMALE },
                    complaintSlugs: ['paediatric-fever'],
                    presentKeys: ['FEVER'],
                    absentKeys: [],
                  })
                }
              >
                Evaluate Clerking
              </button>
              <button
                type="button"
                className="host-btn"
                disabled={httpBusy}
                onClick={() =>
                  void callHeadlessGateway('v1/dosing/evaluate', 'POST', {
                    patient: { ageDays: 910, sex: BiologicalSex.FEMALE, weightKg: 13.4 },
                    medicationKey: 'amoxicillin',
                    route: 'ORAL',
                  })
                }
              >
                Evaluate Dose
              </button>
              <button
                type="button"
                className="host-btn"
                disabled={httpBusy}
                onClick={() =>
                  void callHeadlessGateway('v1/growth/evaluate', 'POST', {
                    sex: BiologicalSex.FEMALE,
                    measurements: [{ ageDays: 910, weightKg: 13.4, heightCm: 92 }],
                  })
                }
              >
                Evaluate Growth
              </button>
              <button
                type="button"
                className="host-btn"
                disabled={httpBusy}
                onClick={() =>
                  void callHeadlessGateway('v1/tpn/evaluate', 'POST', {
                    patient: {
                      ageDays: 4,
                      sex: BiologicalSex.FEMALE,
                      weightKg: 1.8,
                      gestationalAgeDays: 224,
                    },
                    accessRoute: 'CENTRAL',
                    totalFluidMlPerKgDay: 120,
                    targetGirMgKgMin: 8,
                    aminoAcidsGPerKgDay: 3.0,
                    lipidsGPerKgDay: 2.0,
                  })
                }
              >
                Evaluate TPN
              </button>
              <button type="button" className="host-btn" disabled={httpBusy} onClick={() => void callHeadlessGateway('cds-services')}>
                CDS Discovery
              </button>
              <button type="button" className="host-btn" disabled={httpBusy} onClick={() => void callHeadlessGateway('.well-known/smart-configuration')}>
                SMART Config
              </button>
            </div>
          </div>
          <pre className="host-code" data-testid="http-gateway-output">
            {httpOutput}
          </pre>
        </section>
      ) : !sessionToken ? (
        <p data-testid="no-token">Minting or awaiting ?token=... to mount crosdat runtime embeds.</p>
      ) : (
        <CrosdatClinicalProvider
          embedBaseUrl={embedBaseUrl}
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          appearance={appearance}
          onAnalyticsEvent={handleAnalytics}
        >
          <section className="host-panel" data-testid="embed-clerking" style={{ marginBottom: 16 }}>
            <div className="host-panel-head">
              <h2>React: ClerkingEmbed (Full Interactive Workbench)</h2>
              <span className="host-badge">module: clerking</span>
            </div>
            <ClerkingEmbed
              iframeTitle="crosdat Clinical Clerking"
              patientContext={patientContext}
              minHeightPx={680}
              onReady={(info) => pushEvent('react:ready', info.module, info)}
              onOutput={(out) => pushEvent('react:output', 'clerking', out)}
              onSafetyAlert={(al) => pushEvent('react:alert', 'clerking', al)}
              onFeedback={(event) => pushEvent('feedback', 'clerking', event)}
              onError={(err) => pushEvent('react:error', 'clerking', err)}
            />
          </section>

          <div className="host-grid">
            <section className="host-panel" data-testid="embed-growth-chart">
              <div className="host-panel-head">
                <h2>React: GrowthChartEmbed</h2>
                <span className="host-badge">module: growth-chart</span>
              </div>
              <GrowthChartEmbed
                iframeTitle="WHO Growth Chart"
                patientContext={patientContext}
                minHeightPx={480}
                onReady={(info) => pushEvent('react:ready', info.module, info)}
                onOutput={(out) => pushEvent('react:output', 'growth-chart', out)}
                onSafetyAlert={(al) => pushEvent('react:alert', 'growth-chart', al)}
                onFeedback={(event) => pushEvent('feedback', 'growth-chart', event)}
                onError={(err) => pushEvent('react:error', 'growth-chart', err)}
              />
            </section>

            <section className="host-panel" data-testid="embed-dose-prescriber">
              <div className="host-panel-head">
                <h2>React: DosePrescriberEmbed</h2>
                <span className="host-badge">module: dose-prescriber</span>
              </div>
              <DosePrescriberEmbed
                iframeTitle="Dose Prescriber"
                medicationKey="amoxicillin"
                patientContext={patientContext}
                minHeightPx={480}
                onReady={(info) => pushEvent('react:ready', info.module, info)}
                onOutput={(out) => pushEvent('react:output', 'dose-prescriber', out)}
                onSafetyAlert={(al) => pushEvent('react:alert', 'dose-prescriber', al)}
                onFeedback={(event) => pushEvent('feedback', 'dose-prescriber', event)}
                onError={(err) => pushEvent('react:error', 'dose-prescriber', err)}
              />
            </section>

            <section className="host-panel" data-testid="embed-clinical-calculators">
              <div className="host-panel-head">
                <h2>React: ClinicalCalculatorsEmbed</h2>
                <span className="host-badge">module: clinical-calculators</span>
              </div>
              <ClinicalCalculatorsEmbed
                iframeTitle="Clinical Calculators"
                patientContext={patientContext}
                minHeightPx={480}
                onReady={(info) => pushEvent('react:ready', info.module, info)}
                onOutput={(out) => pushEvent('react:output', 'clinical-calculators', out)}
                onFeedback={(event) => pushEvent('feedback', 'clinical-calculators', event)}
                onError={(err) => pushEvent('react:error', 'clinical-calculators', err)}
              />
            </section>

            <section className="host-panel" data-testid="embed-neonatal-tpn">
              <div className="host-panel-head">
                <h2>React: NeonatalTpnEmbed</h2>
                <span className="host-badge">module: neonatal-tpn</span>
              </div>
              <NeonatalTpnEmbed
                iframeTitle="Neonatal TPN"
                patientContext={{ ageDays: 4, sex: BiologicalSex.FEMALE, weightKg: 1.8, gestationalAgeDays: 224 }}
                minHeightPx={480}
                onReady={(info) => pushEvent('react:ready', info.module, info)}
                onOutput={(out) => pushEvent('react:output', 'neonatal-tpn', out)}
                onFeedback={(event) => pushEvent('feedback', 'neonatal-tpn', event)}
                onError={(err) => pushEvent('react:error', 'neonatal-tpn', err)}
              />
            </section>

            <section className="host-panel" data-testid="embed-clinical-guide">
              <div className="host-panel-head">
                <h2>React: ClinicalGuideEmbed</h2>
                <span className="host-badge">module: clinical-guide</span>
              </div>
              <ClinicalGuideEmbed
                iframeTitle="Clinical Guide"
                patientContext={patientContext}
                minHeightPx={480}
                onReady={(info) => pushEvent('react:ready', info.module, info)}
                onOutput={(out) => pushEvent('react:output', 'clinical-guide', out)}
                onFeedback={(event) => pushEvent('feedback', 'clinical-guide', event)}
                onError={(err) => pushEvent('react:error', 'clinical-guide', err)}
              />
            </section>

            <section className="host-panel" data-testid="embed-clinical-learning">
              <div className="host-panel-head">
                <h2>React: ClinicalLearningStationEmbed</h2>
                <span className="host-badge">module: clinical-learning</span>
              </div>
              <ClinicalLearningStationEmbed
                iframeTitle="Clinical Learning Station"
                minHeightPx={480}
                onReady={(info) => pushEvent('react:ready', info.module, info)}
                onOutput={(out) => pushEvent('react:output', 'clinical-learning', out)}
                onFeedback={(event) => pushEvent('feedback', 'clinical-learning', event)}
                onError={(err) => pushEvent('react:error', 'clinical-learning', err)}
              />
            </section>

            <section className="host-panel" data-testid="embed-web-component">
              <div className="host-panel-head">
                <h2>Web Component: &lt;crosdat-clinical-embed&gt;</h2>
                <span className="host-badge">Framework-free Custom Element</span>
              </div>
              {/* @ts-expect-error custom element */}
              <crosdat-clinical-embed
                ref={wcRef}
                embed-base-url={embedBaseUrl}
                api-base-url={apiBaseUrl}
                module="growth-chart"
                session-token={sessionToken}
                theme={theme}
                color-primary={primaryColor}
                hide-branding={hideBranding ? 'true' : 'false'}
                hide-feedback={hideFeedback ? 'true' : 'false'}
              />
            </section>
          </div>
        </CrosdatClinicalProvider>
      )}

      <section className="host-panel">
        <div className="host-panel-head">
          <h2>Host PostMessage Event Log</h2>
          <span className="host-badge">{events.length} events</span>
        </div>
        <pre className="host-code" data-testid="host-event-log">
          {JSON.stringify(events, null, 2)}
        </pre>
      </section>
    </div>
  );
}
