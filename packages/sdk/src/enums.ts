/**
 * Biological sex values accepted by anthropometric, dosing, and clinical
 * evaluation endpoints.
 */
export const BiologicalSex = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  INTERSEX: 'INTERSEX',
  UNKNOWN: 'UNKNOWN',
} as const;
export type BiologicalSex = (typeof BiologicalSex)[keyof typeof BiologicalSex];

/**
 * Runtime UI module identifiers exposed by CROSDAT clinical embeds.
 */
export const EmbedModuleKind = {
  CLERKING: 'clerking',
  GROWTH_CHART: 'growth-chart',
  CLINICAL_CALCULATORS: 'clinical-calculators',
  DOSE_PRESCRIBER: 'dose-prescriber',
  NEONATAL_TPN: 'neonatal-tpn',
  CLINICAL_GUIDE: 'clinical-guide',
  CLINICAL_LEARNING: 'clinical-learning',
  EVIDENCE_ASK: 'evidence-ask',
} as const;
export type EmbedModuleKind = (typeof EmbedModuleKind)[keyof typeof EmbedModuleKind];

/**
 * AI assistance integration mode configured by a host application for CROSDAT embeds.
 *
 * - `crosdat-cloud`: Routes evidence Q&A and voice assistance through CROSDAT's managed gateway.
 * - `custom-endpoint`: Routes AI requests to a customer-configured inference endpoint URL.
 * - `host-callbacks`: Delegates AI prompts and voice capture to host-supplied callbacks.
 * - `disabled`: Hides AI assistance triggers while keeping deterministic clinical workflows active.
 */
export const ClinicalAiMode = {
  CROSDAT_CLOUD: 'crosdat-cloud',
  CUSTOM_ENDPOINT: 'custom-endpoint',
  HOST_CALLBACKS: 'host-callbacks',
  DISABLED: 'disabled',
} as const;
export type ClinicalAiMode = (typeof ClinicalAiMode)[keyof typeof ClinicalAiMode];

/**
 * Outcome status returned by citation-locked clinical evidence Q&A queries.
 *
 * - `ANSWERED`: Curated reference evidence supported a cited answer.
 * - `INSUFFICIENT_CURATED_EVIDENCE`: Curated bundle lacked sufficient evidence and abstained safely.
 */
export const EvidenceAnswerStatus = {
  ANSWERED: 'ANSWERED',
  INSUFFICIENT_CURATED_EVIDENCE: 'INSUFFICIENT_CURATED_EVIDENCE',
} as const;
export type EvidenceAnswerStatus =
  (typeof EvidenceAnswerStatus)[keyof typeof EvidenceAnswerStatus];

/**
 * Privacy-tiered telemetry mode configured on a licensee account or embed session.
 */
export const TelemetryMode = {
  OFF: 'off',
  ANONYMOUS_UX: 'anonymous_ux',
  CLINICAL_INSIGHTS: 'clinical_insights',
} as const;
export type TelemetryMode = (typeof TelemetryMode)[keyof typeof TelemetryMode];

/**
 * Built-in visual theme presets supported by CROSDAT runtime UI embeds.
 */
export const AppearanceThemePreset = {
  CROSDAT_LIGHT: 'crosdat-light',
  CROSDAT_DARK: 'crosdat-dark',
  NEUTRAL_DARK: 'neutral-dark',
  NEUTRAL_CLINICAL: 'neutral-clinical',
  HIGH_CONTRAST: 'high-contrast',
} as const;
export type AppearanceThemePreset = (typeof AppearanceThemePreset)[keyof typeof AppearanceThemePreset];

/**
 * Operating mode for a clinical learning (OSCE) station session.
 *
 * - `PRACTICE`: Immediate coaching, rationale hints, and rubric feedback.
 * - `EXAM`: Timed assessment with hidden ground-truth signals until submission.
 */
export const ClinicalLearningMode = {
  PRACTICE: 'PRACTICE',
  EXAM: 'EXAM',
} as const;
export type ClinicalLearningMode = (typeof ClinicalLearningMode)[keyof typeof ClinicalLearningMode];

/**
 * Six competency domains graded in a clinical learning (OSCE) station attempt.
 */
export const ClinicalLearningDomain = {
  HISTORY: 'HISTORY',
  EXAMINATION: 'EXAMINATION',
  INVESTIGATIONS: 'INVESTIGATIONS',
  DIAGNOSIS_REASONING: 'DIAGNOSIS_REASONING',
  PRESCRIBING_STEWARDSHIP: 'PRESCRIBING_STEWARDSHIP',
  SAFETY_RED_FLAGS: 'SAFETY_RED_FLAGS',
} as const;
export type ClinicalLearningDomain = (typeof ClinicalLearningDomain)[keyof typeof ClinicalLearningDomain];

/**
 * WHO 2025 AWaRe antibiotic stewardship classification categories.
 */
export const AwareStewardshipCategory = {
  ACCESS: 'ACCESS',
  WATCH: 'WATCH',
  RESERVE: 'RESERVE',
} as const;
export type AwareStewardshipCategory =
  (typeof AwareStewardshipCategory)[keyof typeof AwareStewardshipCategory];

/**
 * Severity levels attached to clinical alerts, red flags, and dosing warnings.
 */
export const ClinicalAlertSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type ClinicalAlertSeverity =
  (typeof ClinicalAlertSeverity)[keyof typeof ClinicalAlertSeverity];

/**
 * Standard medical terminology system identifiers returned in coded concepts.
 */
export const TerminologySystem = {
  SNOMED_CT: 'snomed',
  ICD_10: 'icd10',
  ICD_11: 'icd11',
  LOINC: 'loinc',
  RXNORM: 'rxnorm',
  WHO_ATC: 'atc',
} as const;
export type TerminologySystem = (typeof TerminologySystem)[keyof typeof TerminologySystem];
