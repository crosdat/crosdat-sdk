# CROSDAT SDK

Official TypeScript, Web Component, React, and Model Context Protocol (MCP) SDKs for integrating **CROSDAT Clinical Intelligence**—deterministic paediatric and neonatal clinical decision support, weight-based dosing, continuous IV infusion recipes, neonatal Total Parenteral Nutrition (TPN), WHO and Fenton growth curves, 34 bedside calculators, 6-vocabulary terminology crosswalks, and OSCE clinical learning stations.

## Packages

| Package | Purpose | Runtime Dependencies |
| --- | --- | --- |
| [`@crosdat/sdk`](./packages/sdk) | Typed HTTP + RFC 9449 DPoP client, pluggable `ClinicalTransport`, and request/response DTOs | Zero |
| [`@crosdat/embed`](./packages/embed) | Framework-free `<crosdat-clinical-embed>` Web Component, `mountClinicalEmbed`, and verified `postMessage` bridge | `@crosdat/sdk` |
| [`@crosdat/react`](./packages/react) | `<CrosdatClinicalProvider>`, seven `<*Embed />` components, and `@crosdat/react/headless` zero-DOM hooks | `@crosdat/embed`, `@crosdat/sdk` (`react >= 18` peer) |
| [`@crosdat/mcp`](./packages/mcp) | Model Context Protocol (MCP) server (`crosdat-mcp`) and extensible tool registry for AI clinical agents | `@crosdat/sdk` |

## Architecture & Security Model

1. **Never embed `ck_live_*` API keys in browser code.** Your backend exchanges its server-side API key (`ck_live_*` or `ck_test_*`) via `client.createEmbedSession(...)` for a short-lived browser `sessionToken` bound to the browser's non-extractable WebCrypto ECDSA P-256 public key thumbprint (`cnf.jkt`, RFC 9449 DPoP).
2. **Zero third-party cookies.** Runtime UI embeds receive their initial bootstrap envelope through an ephemeral URL `#fragment` (`#crosdat=...`), which is never transmitted in HTTP `Referer` headers or server access logs and is immediately scrubbed via `history.replaceState` on frame boot.
3. **Origin + nonce verified `postMessage`.** Every message exchanged between the host page and the sandboxed `<iframe>` is validated against both `event.origin` and a per-mount cryptographic `channelNonce`.
4. **Progressive customisation.** Style embedded modules with named presets (`crosdat-light`, `crosdat-dark`, `neutral-clinical`, `high-contrast`), semantic CSS tokens (`AppearanceConfig.variables`), slot classes (`AppearanceConfig.elements`), white-label footer control (`hideBranding`), or build completely custom interfaces using `@crosdat/react/headless`.
5. **De-identified clinical inputs.** SDK methods accept biological parameters (`ageDays`, `sex`, `weightKg`, `heightCm`, `gestationalAgeDays`, `allergyKeys`)—never patient names, medical record numbers, phone numbers, or addresses.

## Quickstart

### 1. Mint a Short-Lived Session on Your Server

```ts
import { createCrosdatClient } from '@crosdat/sdk';

const crosdat = createCrosdatClient({
  baseUrl: 'https://api.crosdat.com/api/v1',
  apiKey: process.env.CROSDAT_API_KEY,
});

export async function createChartEmbedSession(origin: string, dpopJwkThumbprint?: string) {
  return crosdat.createEmbedSession({
    module: 'all',
    origin,
    dpopJwkThumbprint,
  });
}
```

### 2. Mount Clinical UIs or Headless Hooks in React

```tsx
import {
  CrosdatClinicalProvider,
  DosePrescriberEmbed,
  GrowthChartEmbed,
} from '@crosdat/react';

export function PaediatricChart({ sessionToken }: { sessionToken: string }) {
  const patient = { ageDays: 420, sex: 'FEMALE' as const, weightKg: 9.6 };

  return (
    <CrosdatClinicalProvider
      embedBaseUrl="https://embed.crosdat.com"
      apiBaseUrl="https://api.crosdat.com/api/v1"
      sessionToken={sessionToken}
      appearance={{
        theme: 'neutral-clinical',
        variables: { colorPrimary: '#0f766e', density: 'compact' },
      }}
    >
      <GrowthChartEmbed patientContext={patient} />
      <DosePrescriberEmbed
        patientContext={patient}
        medicationKey="amoxicillin"
        onOutput={(rx) => console.log('Calculated regimen:', rx)}
      />
    </CrosdatClinicalProvider>
  );
}
```

### 3. Connect AI Agents via Model Context Protocol (`@crosdat/mcp`)

```json
{
  "mcpServers": {
    "crosdat-clinical": {
      "command": "npx",
      "args": ["-y", "@crosdat/mcp"],
      "env": {
        "CROSDAT_API_KEY": "ck_live_..."
      }
    }
  }
}
```

## Available Embed Modules

- `clerking` (`<ClerkingEmbed />`) — Structured paediatric and neonatal clerking, danger-sign triage, and ranked differentials.
- `growth-chart` (`<GrowthChartEmbed />`) — Interactive WHO Child Growth (0–19 years), CDC (2–20 years), and Fenton Preterm (22–50 weeks) charts (16 charts total).
- `clinical-calculators` (`<ClinicalCalculatorsEmbed />`) — 34 deterministic bedside calculators (Apgar, Ballard, Downes, Silverman-Andersen, Blantyre, pSOFA, Schwartz eGFR, Holliday-Segar, Bhutani, and more).
- `dose-prescriber` (`<DosePrescriberEmbed />`) — Weight-, age-, and indication-specific dosing, max-dose capping, continuous IV infusion recipes, ISMP Tall-Man lettering, and WHO AWaRe stewardship badges.
- `neonatal-tpn` (`<NeonatalTpnEmbed />`) — Neonatal parenteral nutrition compounding, GIR, osmolarity, and calcium-phosphate safety checks.
- `clinical-guide` (`<ClinicalGuideEmbed />`) — Cited clinical playbooks with ICD-11, SNOMED CT GPS, ICD-10, LOINC, RxNorm, and WHO ATC codes.
- `clinical-learning` (`<ClinicalLearningStationEmbed />`) — `PRACTICE` and timed `EXAM` OSCE simulation stations with deterministic 6-domain grading.

## Workspace Commands

```bash
pnpm install
pnpm build
pnpm check-types
pnpm test
```

See [`examples/`](./examples) for runnable vanilla HTML, React EHR, and MCP configuration templates.
