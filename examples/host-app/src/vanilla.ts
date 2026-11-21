import { mountClinicalEmbed, registerClinicalEmbedElement, type MountedClinicalEmbed } from '@crosdat/embed';
import { AppearanceThemePreset, BiologicalSex } from '@crosdat/sdk';

registerClinicalEmbedElement();

const statusEl = document.getElementById('vanilla-status')!;
const themeEl = document.getElementById('vanilla-theme') as HTMLSelectElement;
const primaryEl = document.getElementById('vanilla-primary') as HTMLInputElement;
const hideBrandingEl = document.getElementById('vanilla-hide-branding') as HTMLInputElement;
const mintBtnEl = document.getElementById('vanilla-mint-btn') as HTMLButtonElement;
const clerkingRoot = document.getElementById('vanilla-clerking-root')!;
const growthRoot = document.getElementById('vanilla-growth-root')!;
const doseRoot = document.getElementById('vanilla-dose-root')!;
const httpOutputEl = document.getElementById('vanilla-http-output')!;

const embedBaseUrl = `${window.location.protocol}//${window.location.hostname}:18081/embed`;

let doseHandle: MountedClinicalEmbed | null = null;
let wcClerking: HTMLElement | null = null;
let wcGrowth: HTMLElement | null = null;

function applyHostTheme(theme: string, primary: string) {
  document.documentElement.setAttribute('data-host-theme', theme);
  document.documentElement.style.setProperty('--host-accent', primary || '#0f766e');
  const appearance = {
    theme: theme as AppearanceThemePreset,
    hideBranding: hideBrandingEl.checked,
    variables: { colorPrimary: primary || undefined },
  };
  for (const el of [wcClerking, wcGrowth]) {
    if (!el) continue;
    el.setAttribute('theme', theme);
    el.setAttribute('color-primary', primary);
    el.setAttribute('hide-branding', hideBrandingEl.checked ? 'true' : 'false');
  }
  doseHandle?.updateAppearance(appearance);
}

async function runHttpProbe(kind: string) {
  httpOutputEl.textContent = `Calling /__demo/hq (${kind})...`;
  let res: Response;
  if (kind === 'guidelines') {
    res = await fetch('/__demo/hq/v1/guidelines/search?query=sepsis&limit=3');
  } else if (kind === 'calculators') {
    res = await fetch('/__demo/hq/v1/calculators');
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
        weightKg: 1.8,
        dayOfLife: 4,
        gestationalAgeWeeks: 32,
        accessRoute: 'CENTRAL',
      }),
    });
  } else {
    res = await fetch('/__demo/hq/cds-services');
  }
  const json = await res.json().catch(() => ({ status: res.status }));
  httpOutputEl.textContent = `HTTP ${res.status}\n${JSON.stringify(json, null, 2)}`;
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
    statusEl.textContent = `Active demo session minted (${data.apiKeyPrefix ?? 'ck_test_*'})`;
    const theme = themeEl.value;
    const primary = primaryEl.value.trim();

    clerkingRoot.replaceChildren();
    wcClerking = document.createElement('crosdat-clinical-embed');
    wcClerking.setAttribute('embed-base-url', embedBaseUrl);
    wcClerking.setAttribute('module', 'clerking');
    wcClerking.setAttribute('session-token', data.sessionToken);
    wcClerking.setAttribute('theme', theme);
    wcClerking.setAttribute('color-primary', primary);
    wcClerking.setAttribute('hide-branding', hideBrandingEl.checked ? 'true' : 'false');
    clerkingRoot.appendChild(wcClerking);

    growthRoot.replaceChildren();
    wcGrowth = document.createElement('crosdat-clinical-embed');
    wcGrowth.setAttribute('embed-base-url', embedBaseUrl);
    wcGrowth.setAttribute('module', 'growth-chart');
    wcGrowth.setAttribute('session-token', data.sessionToken);
    wcGrowth.setAttribute('theme', theme);
    wcGrowth.setAttribute('color-primary', primary);
    wcGrowth.setAttribute('hide-branding', hideBrandingEl.checked ? 'true' : 'false');
    growthRoot.appendChild(wcGrowth);

    doseHandle?.unmount();
    doseRoot.replaceChildren();
    doseHandle = mountClinicalEmbed(doseRoot, {
      embedBaseUrl,
      module: 'dose-prescriber',
      sessionToken: data.sessionToken,
      targetSlug: 'amoxicillin',
      patientContext: { ageDays: 910, sex: BiologicalSex.FEMALE, weightKg: 13.4 },
      appearance: {
        theme: theme as AppearanceThemePreset,
        hideBranding: hideBrandingEl.checked,
        variables: { colorPrimary: primary || undefined },
      },
      minHeightPx: 460,
    });
  } finally {
    mintBtnEl.disabled = false;
  }
}

themeEl.addEventListener('change', () => applyHostTheme(themeEl.value, primaryEl.value.trim()));
primaryEl.addEventListener('input', () => applyHostTheme(themeEl.value, primaryEl.value.trim()));
hideBrandingEl.addEventListener('change', () => applyHostTheme(themeEl.value, primaryEl.value.trim()));
mintBtnEl.addEventListener('click', () => void mintAndMount());

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-http-probe]')) {
  btn.addEventListener('click', () => void runHttpProbe(btn.dataset.httpProbe!));
}

applyHostTheme(themeEl.value, primaryEl.value.trim());
void mintAndMount();
void runHttpProbe('guidelines');
