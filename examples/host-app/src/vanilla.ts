import { mountClinicalEmbed, registerClinicalEmbedElement, type MountedClinicalEmbed } from '@crosdat/embed';
import { AppearanceThemePreset, BiologicalSex, type ClinicalFeedbackEvent } from '@crosdat/sdk';

registerClinicalEmbedElement();

declare global {
  interface Window {
    __crosdatHostEvents?: Array<{ kind: string; module?: string; detail: unknown }>;
  }
}

const statusEl = document.getElementById('vanilla-status')!;
const themeEl = document.getElementById('vanilla-theme') as HTMLSelectElement;
const primaryEl = document.getElementById('vanilla-primary') as HTMLInputElement;
const hideBrandingEl = document.getElementById('vanilla-hide-branding') as HTMLInputElement;
const hideFeedbackEl = document.getElementById('vanilla-hide-feedback') as HTMLInputElement;
const mintBtnEl = document.getElementById('vanilla-mint-btn') as HTMLButtonElement;
const clerkingRoot = document.getElementById('vanilla-clerking-root')!;
const growthRoot = document.getElementById('vanilla-growth-root')!;
const doseRoot = document.getElementById('vanilla-dose-root')!;
const calculatorsRoot = document.getElementById('vanilla-calculators-root')!;
const tpnRoot = document.getElementById('vanilla-tpn-root')!;
const guideRoot = document.getElementById('vanilla-guide-root')!;
const learningRoot = document.getElementById('vanilla-learning-root')!;
const httpOutputEl = document.getElementById('vanilla-http-output')!;

const urlParams = new URLSearchParams(window.location.search);
const embedBaseUrl =
  urlParams.get('embedBaseUrl') ?? `${window.location.protocol}//${window.location.hostname}:18081/embed`;
const apiBaseUrl = urlParams.get('apiBaseUrl') ?? 'http://127.0.0.1:18080/api/v1';

let doseHandle: MountedClinicalEmbed | null = null;
let tpnHandle: MountedClinicalEmbed | null = null;
let learningHandle: MountedClinicalEmbed | null = null;
let wcClerking: HTMLElement | null = null;
let wcGrowth: HTMLElement | null = null;
let wcCalculators: HTMLElement | null = null;
let wcGuide: HTMLElement | null = null;

function recordVanillaFeedback(module: string, detail: ClinicalFeedbackEvent) {
  window.__crosdatHostEvents = [
    ...(window.__crosdatHostEvents ?? []),
    { kind: 'feedback', module, detail },
  ];
  statusEl.textContent = `Feedback submitted (${module}${detail.ticketRef ? ` · ${detail.ticketRef}` : ''})`;
}

function applyHostTheme(theme: string, primary: string) {
  document.documentElement.setAttribute('data-host-theme', theme);
  document.documentElement.style.setProperty('--host-accent', primary || '#0f766e');
  const appearance = {
    theme: theme as AppearanceThemePreset,
    hideBranding: hideBrandingEl.checked,
    hideFeedback: hideFeedbackEl.checked,
    variables: { colorPrimary: primary || undefined },
  };
  for (const el of [wcClerking, wcGrowth, wcCalculators, wcGuide]) {
    if (!el) continue;
    el.setAttribute('theme', theme);
    el.setAttribute('color-primary', primary);
    el.setAttribute('hide-branding', hideBrandingEl.checked ? 'true' : 'false');
    el.setAttribute('hide-feedback', hideFeedbackEl.checked ? 'true' : 'false');
  }
  doseHandle?.updateAppearance(appearance);
  tpnHandle?.updateAppearance(appearance);
  learningHandle?.updateAppearance(appearance);
}

async function runHttpProbe(kind: string) {
  httpOutputEl.textContent = `Calling /__demo/hq (${kind})...`;
  let res: Response;
  if (kind === 'guidelines') {
    res = await fetch('/__demo/hq/v1/guidelines/search?query=sepsis&limit=3');
  } else if (kind === 'calculators') {
    res = await fetch('/__demo/hq/v1/calculators');
  } else if (kind === 'clerking') {
    res = await fetch('/__demo/hq/v1/clerking/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient: { ageDays: 910, sex: BiologicalSex.FEMALE },
        complaintSlugs: ['paediatric-fever'],
        presentKeys: ['FEVER'],
        absentKeys: [],
      }),
    });
  } else if (kind === 'growth') {
    res = await fetch('/__demo/hq/v1/growth/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sex: BiologicalSex.FEMALE,
        measurements: [{ ageDays: 910, weightKg: 13.4, heightCm: 92 }],
      }),
    });
  } else if (kind === 'dosing') {
    res = await fetch('/__demo/hq/v1/dosing/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient: { ageDays: 910, sex: BiologicalSex.FEMALE, weightKg: 13.4 },
        medicationKey: 'amoxicillin',
        route: 'ORAL',
      }),
    });
  } else if (kind === 'tpn') {
    res = await fetch('/__demo/hq/v1/tpn/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
    });
  } else if (kind === 'smart') {
    res = await fetch('/__demo/hq/.well-known/smart-configuration');
  } else {
    res = await fetch('/__demo/hq/cds-services');
  }
  const json = await res.json().catch(() => ({ status: res.status }));
  httpOutputEl.textContent = `HTTP ${res.status}\n${JSON.stringify(json, null, 2)}`;
}

function createWcEmbed(
  module: string,
  sessionToken: string,
  theme: string,
  primary: string,
): HTMLElement {
  const el = document.createElement('crosdat-clinical-embed');
  el.setAttribute('embed-base-url', embedBaseUrl);
  el.setAttribute('api-base-url', apiBaseUrl);
  el.setAttribute('module', module);
  el.setAttribute('session-token', sessionToken);
  el.setAttribute('theme', theme);
  el.setAttribute('color-primary', primary);
  el.setAttribute('hide-branding', hideBrandingEl.checked ? 'true' : 'false');
  el.setAttribute('hide-feedback', hideFeedbackEl.checked ? 'true' : 'false');
  el.addEventListener('crosdat:feedback', (event) => {
    recordVanillaFeedback(module, (event as CustomEvent<ClinicalFeedbackEvent>).detail);
  });
  return el;
}

async function mintAndMount() {
  mintBtnEl.disabled = true;
  statusEl.textContent = 'Minting embed session token...';
  try {
    const res = await fetch('/__demo/mint-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: window.location.origin, module: 'all' }),
    });
    const data = (await res.json()) as { sessionToken?: string; apiKeyPrefix?: string; error?: string };
    if (!res.ok || !data.sessionToken) {
      statusEl.textContent = `Mint failed: ${data.error ?? `HTTP ${res.status}`}`;
      return;
    }
    statusEl.textContent = `Active demo session minted (${data.apiKeyPrefix ?? 'ck_test_*'}) · All 7 embeds ready`;
    const theme = themeEl.value;
    const primary = primaryEl.value.trim();
    const appearance = {
      theme: theme as AppearanceThemePreset,
      hideBranding: hideBrandingEl.checked,
      hideFeedback: hideFeedbackEl.checked,
      variables: { colorPrimary: primary || undefined },
    };

    clerkingRoot.replaceChildren();
    wcClerking = createWcEmbed('clerking', data.sessionToken, theme, primary);
    clerkingRoot.appendChild(wcClerking);

    growthRoot.replaceChildren();
    wcGrowth = createWcEmbed('growth-chart', data.sessionToken, theme, primary);
    growthRoot.appendChild(wcGrowth);

    calculatorsRoot.replaceChildren();
    wcCalculators = createWcEmbed('clinical-calculators', data.sessionToken, theme, primary);
    calculatorsRoot.appendChild(wcCalculators);

    guideRoot.replaceChildren();
    wcGuide = createWcEmbed('clinical-guide', data.sessionToken, theme, primary);
    guideRoot.appendChild(wcGuide);

    doseHandle?.unmount();
    doseRoot.replaceChildren();
    doseHandle = mountClinicalEmbed(doseRoot, {
      embedBaseUrl,
      apiBaseUrl,
      module: 'dose-prescriber',
      sessionToken: data.sessionToken,
      targetSlug: 'amoxicillin',
      patientContext: { ageDays: 910, sex: BiologicalSex.FEMALE, weightKg: 13.4 },
      appearance,
      minHeightPx: 460,
      onFeedback: (event) => recordVanillaFeedback('dose-prescriber', event),
    });

    tpnHandle?.unmount();
    tpnRoot.replaceChildren();
    tpnHandle = mountClinicalEmbed(tpnRoot, {
      embedBaseUrl,
      apiBaseUrl,
      module: 'neonatal-tpn',
      sessionToken: data.sessionToken,
      patientContext: {
        ageDays: 4,
        sex: BiologicalSex.FEMALE,
        weightKg: 1.8,
        gestationalAgeDays: 224,
      },
      appearance,
      minHeightPx: 480,
      onFeedback: (event) => recordVanillaFeedback('neonatal-tpn', event),
    });

    learningHandle?.unmount();
    learningRoot.replaceChildren();
    learningHandle = mountClinicalEmbed(learningRoot, {
      embedBaseUrl,
      apiBaseUrl,
      module: 'clinical-learning',
      sessionToken: data.sessionToken,
      appearance,
      minHeightPx: 460,
      onFeedback: (event) => recordVanillaFeedback('clinical-learning', event),
    });
  } finally {
    mintBtnEl.disabled = false;
  }
}

themeEl.addEventListener('change', () => applyHostTheme(themeEl.value, primaryEl.value.trim()));
primaryEl.addEventListener('input', () => applyHostTheme(themeEl.value, primaryEl.value.trim()));
hideBrandingEl.addEventListener('change', () => applyHostTheme(themeEl.value, primaryEl.value.trim()));
hideFeedbackEl.addEventListener('change', () => applyHostTheme(themeEl.value, primaryEl.value.trim()));
mintBtnEl.addEventListener('click', () => void mintAndMount());

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-http-probe]')) {
  btn.addEventListener('click', () => void runHttpProbe(btn.dataset.httpProbe!));
}

applyHostTheme(themeEl.value, primaryEl.value.trim());
void mintAndMount();
void runHttpProbe('guidelines');
