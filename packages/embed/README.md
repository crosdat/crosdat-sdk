# `@crosdat/embed`

Framework-free HTML Custom Element (`<crosdat-clinical-embed>`), imperative DOM mounter (`mountClinicalEmbed`), and origin + nonce verified `postMessage` bridge (`@crosdat/embed/frame`) for CROSDAT runtime clinical modules.

## Installation

```bash
pnpm add @crosdat/embed @crosdat/sdk
```

## Imperative DOM Mounting

```ts
import { mountClinicalEmbed } from '@crosdat/embed';

const embed = mountClinicalEmbed(document.getElementById('chart')!, {
  embedBaseUrl: 'https://embed.crosdat.com',
  module: 'growth-chart',
  sessionToken,
  patientContext: { ageDays: 365, sex: 'FEMALE', weightKg: 8.9, heightCm: 73.2 },
  appearance: { theme: 'neutral-clinical' },
  onClinicalOutput: (result) => console.log(result),
});

// Live context updates without reloading the iframe:
embed.updatePatientContext({ ageDays: 395, sex: 'FEMALE', weightKg: 9.3, heightCm: 74.5 });
```

## Custom Element (`<crosdat-clinical-embed>`)

```ts
import { registerClinicalEmbedElement } from '@crosdat/embed';

registerClinicalEmbedElement();
```

```html
<crosdat-clinical-embed
  embed-base-url="https://embed.crosdat.com"
  module="clinical-calculators"
  target-slug="apgar"
  session-token="eyJ..."
  theme="neutral-clinical"
></crosdat-clinical-embed>
```

Dispatches `crosdat:ready`, `crosdat:output`, `crosdat:alert`, `crosdat:analytics`, and `crosdat:error` DOM `CustomEvent`s.
