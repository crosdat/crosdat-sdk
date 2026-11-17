# `@crosdat/react`

React components (`<CrosdatClinicalProvider>` + seven `<*Embed />` components) and zero-DOM headless clinical hooks (`@crosdat/react/headless`) for React 18 and React 19 applications.

## Installation

```bash
pnpm add @crosdat/react @crosdat/sdk
```

## Managed Runtime Embeds (`@crosdat/react`)

- `<ClerkingEmbed />`
- `<GrowthChartEmbed />`
- `<ClinicalCalculatorsEmbed calculatorSlug="..." />`
- `<DosePrescriberEmbed medicationKey="..." />`
- `<NeonatalTpnEmbed />`
- `<ClinicalGuideEmbed playbookSlug="..." />`
- `<ClinicalLearningStationEmbed scenarioSlug="..." />`

## Zero-DOM Headless Hooks (`@crosdat/react/headless`)

Build completely bespoke EHR forms and clinical workflows while delegating deterministic medical calculations, max-dose caps, z-scores, and 6-vocabulary terminology attribution to CROSDAT:

- `useClerkingSession()`
- `useDosePrescriber()`
- `useGrowthChart()`
- `useClinicalCalculator()`
- `useNeonatalTpn()`
- `useClinicalLearningStation()`

```tsx
import { useDosePrescriber } from '@crosdat/react/headless';

export function CustomOrderRow({ weightKg }: { weightKg: number }) {
  const { data, isLoading, evaluate } = useDosePrescriber();

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          void evaluate({
            patient: { ageDays: 600, sex: 'MALE', weightKg },
            medicationKey: 'ceftriaxone',
            route: 'IV',
          })
        }
      >
        Compute Dose
      </button>
      {isLoading ? <span>Computing…</span> : null}
      {data ? <strong>{data.calculatedSingleDose} {data.doseUnit}</strong> : null}
    </div>
  );
}
```
