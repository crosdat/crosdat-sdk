import { mountClinicalEmbed, type MountedClinicalEmbed } from '@crosdat/embed';
import {
  EmbedModuleKind,
  type AppearanceConfig,
  type ClinicalSafetyAlert,
  type FacilityClinicalOverridesInput,
  type PatientClinicalContext,
} from '@crosdat/sdk';
import { useEffect, useRef } from 'react';
import { useCrosdatClinical } from './provider.js';

/**
 * Shared props supported across all seven CROSDAT React `<*Embed />` components.
 */
export interface BaseClinicalEmbedProps<TOutput = unknown> {
  /** Optional container CSS class name on the host wrapper `<div>`. */
  className?: string;
  /** Accessible `title` applied to the underlying runtime `<iframe>`. */
  iframeTitle?: string;
  /** Minimum height in pixels prior to first dynamic resize (default `420`). */
  minHeightPx?: number;
  /** Per-embed appearance overrides merged over provider defaults. */
  appearance?: AppearanceConfig;
  /** De-identified patient biological context passed into the module. */
  patientContext?: PatientClinicalContext;
  /** Per-embed facility clinical overrides merged over provider defaults. */
  facilityOverrides?: FacilityClinicalOverridesInput;
  /** Fired once the runtime module inside the frame is interactive. */
  onReady?: (info: { module: EmbedModuleKind; heightPx: number }) => void;
  /** Fired whenever the module emits a clinical calculation or signed output. */
  onOutput?: (output: TOutput) => void;
  /** Fired whenever a clinical danger sign or dosing alert triggers. */
  onSafetyAlert?: (alert: ClinicalSafetyAlert) => void;
  /** Fired when a runtime error occurs inside the embedded module. */
  onError?: (error: { code: string; message: string }) => void;
}

interface InternalModuleEmbedProps<TOutput> extends BaseClinicalEmbedProps<TOutput> {
  module: EmbedModuleKind;
  targetSlug?: string;
}

function ClinicalModuleEmbedFrame<TOutput>({
  module,
  targetSlug,
  className,
  iframeTitle,
  minHeightPx,
  appearance,
  patientContext,
  facilityOverrides,
  onReady,
  onOutput,
  onSafetyAlert,
  onError,
}: InternalModuleEmbedProps<TOutput>) {
  const ctx = useCrosdatClinical();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef<MountedClinicalEmbed | null>(null);

  const mergedAppearance: AppearanceConfig | undefined =
    ctx.appearance || appearance
      ? {
          ...ctx.appearance,
          ...appearance,
          variables: { ...ctx.appearance?.variables, ...appearance?.variables },
          elements: { ...ctx.appearance?.elements, ...appearance?.elements },
          labels: { ...ctx.appearance?.labels, ...appearance?.labels },
        }
      : undefined;

  const effectiveOverrides = facilityOverrides ?? ctx.facilityOverrides;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const handle = mountClinicalEmbed(el, {
      embedBaseUrl: ctx.embedBaseUrl,
      module,
      sessionToken: ctx.sessionToken,
      targetSlug,
      appearance: mergedAppearance,
      patientContext,
      facilityOverrides: effectiveOverrides,
      iframeTitle,
      minHeightPx,
      onReady,
      onClinicalOutput: (payload) => onOutput?.(payload as TOutput),
      onSafetyAlert,
      onAnalyticsEvent: ctx.onAnalyticsEvent,
      onError,
    });
    mountedRef.current = handle;
    lastAppearanceJsonRef.current = mergedAppearance ? JSON.stringify(mergedAppearance) : undefined;
    lastContextJsonRef.current = patientContext ? JSON.stringify(patientContext) : undefined;
    lastOverridesJsonRef.current = effectiveOverrides ? JSON.stringify(effectiveOverrides) : undefined;

    return () => {
      handle.unmount();
      mountedRef.current = null;
      lastAppearanceJsonRef.current = undefined;
      lastContextJsonRef.current = undefined;
      lastOverridesJsonRef.current = undefined;
    };
  }, [ctx.embedBaseUrl, ctx.sessionToken, module, targetSlug]);

  const lastAppearanceJsonRef = useRef<string | undefined>(undefined);
  const lastContextJsonRef = useRef<string | undefined>(undefined);
  const lastOverridesJsonRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!mountedRef.current || !mergedAppearance) return;
    const serialized = JSON.stringify(mergedAppearance);
    if (serialized === lastAppearanceJsonRef.current) return;
    lastAppearanceJsonRef.current = serialized;
    mountedRef.current.updateAppearance(mergedAppearance);
  }, [mergedAppearance]);

  useEffect(() => {
    if (!mountedRef.current || !patientContext) return;
    const serialized = JSON.stringify(patientContext);
    if (serialized === lastContextJsonRef.current) return;
    lastContextJsonRef.current = serialized;
    mountedRef.current.updatePatientContext(patientContext);
  }, [patientContext]);

  useEffect(() => {
    if (!mountedRef.current || !effectiveOverrides) return;
    const serialized = JSON.stringify(effectiveOverrides);
    if (serialized === lastOverridesJsonRef.current) return;
    lastOverridesJsonRef.current = serialized;
    mountedRef.current.updateFacilityOverrides(effectiveOverrides);
  }, [effectiveOverrides]);

  return <div ref={containerRef} className={className} data-crosdat-embed={module} />;
}

/**
 * Embedded structured paediatric & neonatal clerking wizard.
 *
 * @param props - Patient context, appearance customisation, and output callbacks.
 * @returns Runtime clerking embed frame.
 */
export function ClerkingEmbed(props: BaseClinicalEmbedProps) {
  return <ClinicalModuleEmbedFrame {...props} module={EmbedModuleKind.CLERKING} />;
}

/**
 * Embedded interactive WHO (0–19y) & Fenton (22–50w preterm) growth chart viewer.
 *
 * @param props - Patient anthropometry, appearance customisation, and callbacks.
 * @returns Runtime growth chart embed frame.
 */
export function GrowthChartEmbed(props: BaseClinicalEmbedProps) {
  return <ClinicalModuleEmbedFrame {...props} module={EmbedModuleKind.GROWTH_CHART} />;
}

/**
 * Props for {@link ClinicalCalculatorsEmbed}, allowing an optional pinned `calculatorSlug`.
 */
export interface ClinicalCalculatorsEmbedProps extends BaseClinicalEmbedProps {
  /** Optional calculator slug to pin a single calculator instead of the full workbench. */
  calculatorSlug?: string;
}

/**
 * Embedded bedside clinical calculators workbench (or single pinned calculator).
 *
 * @param props - Calculator selection, patient context, appearance, and callbacks.
 * @returns Runtime clinical calculators embed frame.
 */
export function ClinicalCalculatorsEmbed({
  calculatorSlug,
  ...rest
}: ClinicalCalculatorsEmbedProps) {
  return (
    <ClinicalModuleEmbedFrame
      {...rest}
      module={EmbedModuleKind.CLINICAL_CALCULATORS}
      targetSlug={calculatorSlug}
    />
  );
}

/**
 * Props for {@link DosePrescriberEmbed}, allowing an optional initial `medicationKey`.
 */
export interface DosePrescriberEmbedProps extends BaseClinicalEmbedProps {
  /** Optional medication key or slug to open directly in the prescriber. */
  medicationKey?: string;
}

/**
 * Embedded paediatric/neonatal weight-based dose & continuous IV infusion prescriber.
 *
 * @param props - Medication selection, patient weight/age, appearance, and callbacks.
 * @returns Runtime dose prescriber embed frame.
 */
export function DosePrescriberEmbed({ medicationKey, ...rest }: DosePrescriberEmbedProps) {
  return (
    <ClinicalModuleEmbedFrame
      {...rest}
      module={EmbedModuleKind.DOSE_PRESCRIBER}
      targetSlug={medicationKey}
    />
  );
}

/**
 * Embedded neonatal Total Parenteral Nutrition (TPN) compounding & safety workbench.
 *
 * @param props - Neonatal patient context, appearance customisation, and callbacks.
 * @returns Runtime neonatal TPN embed frame.
 */
export function NeonatalTpnEmbed(props: BaseClinicalEmbedProps) {
  return <ClinicalModuleEmbedFrame {...props} module={EmbedModuleKind.NEONATAL_TPN} />;
}

/**
 * Props for {@link ClinicalGuideEmbed}, specifying an optional `playbookSlug`.
 */
export interface ClinicalGuideEmbedProps extends BaseClinicalEmbedProps {
  /** Playbook or guideline slug to display on open. */
  playbookSlug?: string;
}

/**
 * Embedded clinical playbook, guideline citation, and 6-vocabulary code drawer.
 *
 * @param props - Playbook slug, appearance customisation, and callbacks.
 * @returns Runtime clinical guide embed frame.
 */
export function ClinicalGuideEmbed({ playbookSlug, ...rest }: ClinicalGuideEmbedProps) {
  return (
    <ClinicalModuleEmbedFrame
      {...rest}
      module={EmbedModuleKind.CLINICAL_GUIDE}
      targetSlug={playbookSlug}
    />
  );
}

/**
 * Props for {@link ClinicalLearningStationEmbed}, specifying a `scenarioSlug`.
 */
export interface ClinicalLearningStationEmbedProps extends BaseClinicalEmbedProps {
  /** Clinical learning scenario slug (for example `'neonatal-sepsis-hypoglycaemia'`). */
  scenarioSlug?: string;
}

/**
 * Embedded `PRACTICE` / timed `EXAM` clinical learning (OSCE) station.
 *
 * @param props - Scenario slug, appearance customisation, and grading callbacks.
 * @returns Runtime clinical learning station embed frame.
 */
export function ClinicalLearningStationEmbed({
  scenarioSlug,
  ...rest
}: ClinicalLearningStationEmbedProps) {
  return (
    <ClinicalModuleEmbedFrame
      {...rest}
      module={EmbedModuleKind.CLINICAL_LEARNING}
      targetSlug={scenarioSlug}
    />
  );
}
