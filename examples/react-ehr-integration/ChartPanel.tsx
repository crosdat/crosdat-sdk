import {
  CrosdatClinicalProvider,
  DosePrescriberEmbed,
  GrowthChartEmbed,
} from '@crosdat/react';
import { useDosePrescriber } from '@crosdat/react/headless';
import type { PatientClinicalContext } from '@crosdat/sdk';

interface PatientChartPanelProps {
  embedBaseUrl: string;
  sessionToken: string;
  patient: PatientClinicalContext;
}

function QuickGentamicinBanner({ patient }: { patient: PatientClinicalContext }) {
  const { data, isLoading, evaluate } = useDosePrescriber();

  return (
    <section>
      <button
        type="button"
        disabled={isLoading}
        onClick={() =>
          void evaluate({
            patient,
            medicationKey: 'gentamicin',
            route: 'IV',
          })
        }
      >
        {isLoading ? 'Calculating…' : 'Preview IV Gentamicin Regimen'}
      </button>
      {data ? (
        <p>
          {data.tallManName ?? data.medicationName}: {data.calculatedSingleDose} {data.doseUnit} (
          {data.frequencyLabel})
        </p>
      ) : null}
    </section>
  );
}

/**
 * Reference React EHR integration combining full runtime `<*Embed />` modules
 * with zero-DOM headless clinical hooks under a single `CrosdatClinicalProvider`.
 */
export function PatientChartPanel({
  embedBaseUrl,
  sessionToken,
  patient,
}: PatientChartPanelProps) {
  return (
    <CrosdatClinicalProvider
      embedBaseUrl={embedBaseUrl}
      sessionToken={sessionToken}
      appearance={{
        theme: 'neutral-clinical',
        variables: { colorPrimary: '#0f766e', density: 'compact' },
      }}
    >
      <QuickGentamicinBanner patient={patient} />
      <GrowthChartEmbed patientContext={patient} />
      <DosePrescriberEmbed patientContext={patient} medicationKey="amoxicillin" />
    </CrosdatClinicalProvider>
  );
}
