import type {
  AppearanceThemePreset,
  AwareStewardshipCategory,
  BiologicalSex,
  ClinicalAlertSeverity,
  ClinicalLearningDomain,
  ClinicalLearningMode,
  EmbedModuleKind,
  TelemetryMode,
  TerminologySystem,
} from './enums.js';

/**
 * Verified standard terminology concept attached to a clinical finding,
 * diagnosis, investigation, or medication.
 */
export interface CodedTerm {
  /** Vocabulary key (`snomed`, `icd10`, `icd11`, `loinc`, `rxnorm`, `atc`). */
  system: TerminologySystem;
  /** Canonical system URI (for example `http://snomed.info/sct`). */
  systemUri: string;
  /** Verified concept code in the target vocabulary. */
  code: string;
  /** Unmodified display term from the authoritative terminology release. */
  display: string;
  /** Optional term type (such as RxNorm `IN`, `MIN`, `SCD`, `SCDF`). */
  tty?: string;
  /** Semantic fit between the CROSDAT concept and the external code. */
  match?: 'EXACT' | 'BROADER' | 'NARROWER';
}

/**
 * Evidence provenance attached to every clinical output returned by CROSDAT.
 */
export interface ClinicalBasisCitation {
  /** Stable identifier of the cited clinical authority within the bundle. */
  sourceId: string;
  /** Human-readable guideline title and edition (for example WHO Pocket Book). */
  title: string;
  /** Specific chapter, section, or page locator within the cited authority. */
  section?: string;
  /** Bundle content version and SHA-256 digest used to compute the output. */
  bundleVersion?: string;
  /** Required third-party terminology notice when SNOMED CT GPS codes are present. */
  terminologyNotice?: string;
}

/**
 * Structured clinical warning or safety notice returned alongside calculations.
 */
export interface ClinicalSafetyAlert {
  /** Stable machine-readable alert code. */
  code: string;
  /** Alert severity tier (`INFO`, `WARNING`, `CRITICAL`). */
  severity: ClinicalAlertSeverity;
  /** Plain-English clinical message suitable for bedside display. */
  message: string;
  /** Supporting guideline citation when sourced from a reference threshold. */
  citation?: ClinicalBasisCitation;
}

/**
 * Provenance record stamped whenever a hospital's local facility clinical
 * override modifies formulary availability, drug substitution, or lab bounds.
 */
export interface AppliedFacilityOverride {
  /** Category of facility override applied (`FORMULARY`, `SUBSTITUTION`, `INVESTIGATION`). */
  kind: 'FORMULARY' | 'SUBSTITUTION' | 'INVESTIGATION';
  /** Target medication or investigation key affected by the local rule. */
  targetKey: string;
  /** Plain-English summary of what changed locally and why. */
  summary: string;
  /** Authorising committee or facility policy label when recorded. */
  approvedBy?: string;
}

/**
 * Hospital-local clinical customisation overlay supplied per facility.
 */
export interface FacilityClinicalOverridesInput {
  /** Optional facility identifier for audit provenance. */
  facilityId?: string;
  /**Formulary stock status and preferred formulations keyed by medication key. */
  formulary?: Record<
    string,
    {
      inStock: boolean;
      stockedFormulationIds?: string[];
      preferredFormulationId?: string;
      localNote?: string;
    }
  >;
  /** Pharmacy-and-Therapeutics approved substitutions when a drug is unavailable. */
  substitutions?: Array<{
    unavailableDrugKey: string;
    substituteDrugKey: string;
    rationale: string;
    approvedByCommittee?: string;
  }>;
  /** Local laboratory availability, turnaround time, and reference range overrides. */
  investigations?: Record<
    string,
    {
      availableLocally: boolean;
      turnaroundHours?: number;
      localUnit?: string;
      lowNormal?: number;
      highNormal?: number;
    }
  >;
}

/**
 * Design-token variables accepted by `AppearanceConfig.variables` for theming
 * embedded CROSDAT clinical modules without writing custom CSS stylesheets.
 */
export interface AppearanceVariables {
  /** Primary brand accent colour (CSS colour value, e.g. `#0f766e`). */
  colorPrimary?: string;
  /** Surface background colour. */
  colorBackground?: string;
  /** Card/panel container colour. */
  colorSurface?: string;
  /** Primary body text colour. */
  colorText?: string;
  /** Muted secondary label colour. */
  colorTextMuted?: string;
  /** Danger / critical alert accent colour. */
  colorDanger?: string;
  /** Warning alert accent colour. */
  colorWarning?: string;
  /** Border colour token. */
  colorBorder?: string;
  /** Primary UI font family stack. */
  fontFamily?: string;
  /** Monospace font family stack for doses, lab values, and scores. */
  fontFamilyMono?: string;
  /** Base border radius CSS length (for example `0.5rem` or `6px`). */
  borderRadius?: string;
  /** Base spacing scale multiplier (`compact`, `comfortable`, `touch`). */
  density?: 'compact' | 'comfortable' | 'touch';
}

/**
 * Progressive developer customisation contract for CROSDAT UI embeds.
 */
export interface AppearanceConfig {
  /** Named base preset (`crosdat-light`, `crosdat-dark`, `neutral-clinical`, `high-contrast`). */
  theme?: AppearanceThemePreset;
  /** Semantic CSS design tokens injected onto the embed root. */
  variables?: AppearanceVariables;
  /** Semantic slot class overrides keyed by documented element slot names. */
  elements?: Record<string, string>;
  /**
   * Hides the "Powered by CROSDAT" footer badge when enabled on an eligible
   * white-label commercial plan. Clinical source citations remain accessible.
   */
  hideBranding?: boolean;
  /** Suppress inline clinical feedback triggers inside embedded workbenches. */
  hideFeedback?: boolean;
  /** Optional string overrides for button labels and headings. */
  labels?: Record<string, string>;
}

/**
 * PHI-free analytics event emitted to the host application's optional
 * `onAnalyticsEvent` callback.
 */
export interface SanitizedAnalyticsEvent {
  /** Snake-case event name (for example `dose_calculated`). */
  eventName: string;
  /** Module that produced the event. */
  module: EmbedModuleKind;
  /** ISO-8601 timestamp when the event occurred. */
  occurredAt: string;
  /** Non-PHI metadata (content keys, durations, counts—never patient identifiers). */
  metadata: Record<string, string | number | boolean>;
}

/**
 * PHI-free clinical feedback submission payload sent to `POST /v1/feedback`.
 */
export interface SubmitEmbedFeedbackInput {
  /** Feedback category (for example `CLINICAL_ACCURACY`, `USABILITY`, `MISSING_GUIDELINE`). */
  category: string;
  /** Structured reason code within the chosen category. */
  reasonCode: string;
  /** UI surface key where the feedback trigger was invoked. */
  surfaceKey: string;
  /** Optional medication, calculator, playbook, or catalog key targeted by the report. */
  targetKey?: string;
  /** Plain-text clinician feedback message (must be PHI-free). */
  message: string;
  /** Optional client-generated idempotency key to prevent duplicate submissions. */
  idempotencyKey?: string;
  /** Optional non-PHI contextual metadata (versions, surface state, content keys). */
  contextMetadata?: Record<string, unknown>;
}

/**
 * Confirmation returned after accepting a PHI-free clinical feedback submission.
 */
export interface SubmitEmbedFeedbackResult {
  /** Always `true` when the feedback report has been accepted for triage. */
  accepted: true;
  /** Stable ticket reference identifier for tracking the submitted feedback. */
  ticketRef: string;
}

/**
 * PHI-free clinical feedback event emitted from an embedded CROSDAT module to
 * the host application.
 */
export interface ClinicalFeedbackEvent {
  /** Embedded module where the feedback was submitted. */
  module: EmbedModuleKind;
  /** Feedback category selected by the clinician. */
  category: string;
  /** Structured reason code within the category. */
  reasonCode: string;
  /** UI surface key where the feedback trigger was invoked. */
  surfaceKey: string;
  /** Optional medication, calculator, playbook, or catalog key targeted by the report. */
  targetKey?: string;
  /** Ticket reference identifier returned by the gateway when persisted. */
  ticketRef?: string;
  /** Optional non-PHI contextual metadata attached to the event. */
  contextMetadata?: Record<string, unknown>;
}

/**
 * Patient biological context (de-identified: age, sex, weight, gestation—never
 * patient names, hospital numbers, addresses, or phone numbers).
 */
export interface PatientClinicalContext {
  /** Chronological age in days (`0` for newborn on day of birth). */
  ageDays: number;
  /** Biological sex used to select sex-specific reference curves and bounds. */
  sex: BiologicalSex;
  /** Latest measured body weight in kilograms when known. */
  weightKg?: number;
  /** Measured stature/length in centimetres when known. */
  heightCm?: number;
  /** Head circumference in centimetres when known. */
  headCircumferenceCm?: number;
  /** Gestational age at birth in completed weeks + days (total days) for neonates. */
  gestationalAgeDays?: number;
  /** Recorded drug allergy keys (`UPPER_SNAKE_CASE` catalog/medication keys). */
  allergyKeys?: string[];
}

// -- Thin-Slice Clerking & Differentials --------------------------------------

/**
 * Request payload to mint a short-lived browser embed or thin-slice session.
 */
export interface CreateEmbedSessionInput {
  /** Target embed module or `'all'` for multi-module sessions. */
  module: EmbedModuleKind | 'all';
  /** Browser origin where the embed will be framed (verified against allowed origins). */
  origin: string;
  /** Base64url RFC 7638 SHA-256 thumbprint of the browser's WebCrypto DPoP public key. */
  dpopJwkThumbprint?: string;
  /** Initial de-identified patient context when launching for an active patient. */
  patientContext?: PatientClinicalContext;
  /** Optional facility clinical overrides for this session. */
  facilityOverrides?: FacilityClinicalOverridesInput;
  /** Requested telemetry mode (bounded by the licensee account ceiling). */
  telemetryMode?: TelemetryMode;
}

/**
 * Short-lived DPoP-bound session credentials returned by `/v1/sessions`.
 */
export interface EmbedSessionCredentials {
  /** Unique session identifier. */
  sessionId: string;
  /** Short-lived JWT bearer token bound to `dpopJwkThumbprint` when provided. */
  sessionToken: string;
  /** ISO-8601 expiration timestamp. */
  expiresAt: string;
  /** Runtime embed host URL for mounting `<iframe>` modules. */
  embedBaseUrl: string;
  /** Effective white-label entitlement resolved from the licensee's billing plan. */
  allowWhiteLabel: boolean;
  /** Effective telemetry mode active for this session. */
  telemetryMode: TelemetryMode;
}

/**
 * Stateless thin-slice differential & triage evaluation request.
 */
export interface EvaluateDifferentialsInput {
  /** De-identified patient demographics and anthropometry. */
  patient: PatientClinicalContext;
  /** Active presenting complaint slugs (for example `['paediatric-fever']`). */
  complaintSlugs: string[];
  /** Catalog keys positively recorded as present (`UPPER_SNAKE_CASE`). */
  presentKeys: string[];
  /** Catalog keys explicitly recorded as absent (`UPPER_SNAKE_CASE`). */
  absentKeys?: string[];
  /** Quantitative observation values keyed by catalog key (e.g. `{ AXILLARY_TEMP_C: 39.2 }`). */
  measurements?: Record<string, number | string>;
  /** Optional hospital-local clinical overrides. */
  facilityOverrides?: FacilityClinicalOverridesInput;
}

/**
 * Single ranked differential diagnosis candidate returned in a thin slice.
 */
export interface RankedDifferentialCandidate {
  /** Canonical clinical playbook slug. */
  playbookSlug: string;
  /** Human-readable condition title. */
  title: string;
  /** Relative likelihood tier (`HIGH`, `MODERATE`, `CONSIDER`). */
  likelihoodTier: 'HIGH' | 'MODERATE' | 'CONSIDER';
  /** Supporting bedside findings that matched this candidate. */
  supportingFindings: string[];
  /** High-yield unasked questions that would sharpen or rule out this condition. */
   discriminatingQuestions: Array<{
    key: string;
    prompt: string;
    valueType: 'BOOLEAN' | 'NUMBER' | 'CHOICE';
    options?: Array<{ value: string; label: string }>;
  }>;
  /** Standard terminology codes (`ICD-11`, `SNOMED CT`, `ICD-10`). */
  codes: CodedTerm[];
  /** Supporting guideline citations. */
  citations: ClinicalBasisCitation[];
}

/**
 * Thin-slice triage, follow-up question, and ranked differential response.
 * Raw rule ASTs and proprietary scoring weights are never included.
 */
export interface DifferentialEvaluationResult {
  /** Emergency / priority triage status derived from recorded danger signs. */
  triagePriority: 'EMERGENCY' | 'PRIORITY' | 'NON_URGENT';
  /** Triggered danger-sign alerts requiring immediate bedside action. */
  redFlags: ClinicalSafetyAlert[];
  /** Ranked differential candidates with next discriminating questions. */
  differentials: RankedDifferentialCandidate[];
  /** Recommended bedside investigations given current findings. */
  recommendedInvestigations: Array<{
    investigationKey: string;
    label: string;
    rationale: string;
    availableLocally: boolean;
    codes: CodedTerm[];
    citations: ClinicalBasisCitation[];
  }>;
  /** Provenance of any hospital-local overrides applied. */
  appliedFacilityOverrides: AppliedFacilityOverride[];
  /** Bundle version & mandatory terminology attribution notices. */
  citations: ClinicalBasisCitation[];
}

// -- Paediatric & Neonatal Dosing + Infusions ---------------------------------

/**
 * Request to compute a weight-, age-, and indication-specific medication dose.
 */
export interface DoseEvaluationInput {
  /** De-identified patient context (`weightKg` and `ageDays` required for weight-based dosing). */
  patient: PatientClinicalContext;
  /** Canonical medication key or slug (for example `'amoxicillin'` or `'gentamicin'`). */
  medicationKey: string;
  /** Optional clinical indication or playbook slug to select indication-specific regimens. */
  indication?: string;
  /** Preferred administration route (`ORAL`, `IV`, `IM`, `RECTAL`, `NEBULISED`, etc.). */
  route?: string;
  /** Specific formulation identifier when overriding the default stocked strength. */
  formulationId?: string;
  /** Optional hospital-local formulary and substitution overrides. */
  facilityOverrides?: FacilityClinicalOverridesInput;
}

/**
 * Deterministic paediatric/neonatal dose & practical administration output.
 */
export interface DoseEvaluationResult {
  /** Resolved medication key (may reflect an approved substitution when out of stock). */
  medicationKey: string;
  /** Display name including ISMP Tall-Man lettering metadata where applicable. */
  medicationName: string;
  /** Tall-Man highlighted display string (for example `DOBUTamine`). */
  tallManName?: string;
  /** WHO 2025 AWaRe antibiotic stewardship category when systemic antibacterial. */
  awareCategory?: AwareStewardshipCategory;
  /** Selected administration route. */
  route: string;
  /** Dose per kilogram (`mg/kg/dose` or `mg/kg/day` as specified by `doseBasis`). */
  dosePerKg: number;
  /** Unit of the per-kg rule (for example `mg/kg/dose`). */
  doseBasis: string;
  /** Calculated single administration mass/amount after max-dose capping. */
  calculatedSingleDose: number;
  /** Unit of `calculatedSingleDose` (for example `mg`, `mcg`, `units`). */
  doseUnit: string;
  /** True when `calculatedSingleDose` was clamped at the adult/ceiling maximum. */
  cappedAtMaxSingleDose: boolean;
  /** Practical measurable volume in `mL` (or tablet fraction) for the chosen formulation. */
  administrationVolumeMl?: number;
  /** Strength description of the matched formulation (for example `250 mg / 5 mL`). */
  formulationLabel?: string;
  /** Dosing interval / frequency instruction (for example `Every 12 hours`). */
  frequencyLabel: string;
  /** Recommended treatment duration when specified by the guideline. */
  durationLabel?: string;
  /** Optional continuous IV infusion preparation recipe when applicable. */
  infusionRecipe?: {
    diluent: string;
    finalVolumeMl: number;
    drugAmountAdded: number;
    drugUnit: string;
    infusionRateMlPerHour: number;
    deliveredRateLabel: string;
  };
  /** Standard terminology codes (`RxNorm`, `SNOMED CT`, `WHO ATC`). */
  codes: CodedTerm[];
  /** Prescribing safety alerts (allergy cross-checks, neonatal warnings, renal notes). */
  alerts: ClinicalSafetyAlert[];
  /** Hospital-local formulary or substitution overrides applied. */
  appliedFacilityOverrides: AppliedFacilityOverride[];
  /** Authoritative source citations for the selected regimen. */
  citations: ClinicalBasisCitation[];
}

// -- Neonatal Total Parenteral Nutrition (TPN) --------------------------------

/**
 * Input parameters for neonatal Total Parenteral Nutrition (TPN) compounding.
 */
export interface NeonatalTpnEvaluationInput {
  /** Neonatal patient context (`weightKg` and `ageDays` required). */
  patient: PatientClinicalContext;
  /** Venous access route (`PERIPHERAL` caps osmolarity vs. `CENTRAL`). */
  accessRoute: 'PERIPHERAL' | 'CENTRAL';
  /** Total daily fluid target in `mL/kg/day`. */
  totalFluidMlPerKgDay: number;
  /** Enteral feed volume in `mL/kg/day` subtracted from total fluid target. */
  enteralFeedsMlPerKgDay?: number;
  /** Amino acid target in `g/kg/day`. */
  aminoAcidsGPerKgDay: number;
  /** Intravenous lipid emulsion target in `g/kg/day`. */
  lipidsGPerKgDay: number;
  /** Target glucose infusion rate (GIR) in `mg/kg/min` (or dextrose % target). */
  targetGirMgKgMin: number;
  /** Sodium requirement in `mmol/kg/day`. */
  sodiumMmolPerKgDay?: number;
  /** Potassium requirement in `mmol/kg/day`. */
  potassiumMmolPerKgDay?: number;
  /** Calcium requirement in `mmol/kg/day`. */
  calciumMmolPerKgDay?: number;
  /** Phosphate requirement in `mmol/kg/day`. */
  phosphateMmolPerKgDay?: number;
  /** Magnesium requirement in `mmol/kg/day`. */
  magnesiumMmolPerKgDay?: number;
}

/**
 * Deterministic neonatal TPN compounding table, delivered nutrients, and
 * calcium-phosphate / osmolarity safety warnings.
 */
export interface NeonatalTpnEvaluationResult {
  /** Engine specification version used to compute the bag. */
  engineVersion: string;
  /** Net parenteral aqueous + lipid volume in `mL/day`. */
  parenteralVolumeMlPerDay: number;
  /** Aqueous bag infusion rate in `mL/hour`. */
  aqueousRateMlPerHour: number;
  /** Separate syringe-driver lipid infusion rate in `mL/hour`. */
  lipidRateMlPerHour: number;
  /** Estimated aqueous bag osmolarity in `mOsm/L`. */
  estimatedOsmolarityMosmPerL: number;
  /** Delivered total energy in `kcal/kg/day`. */
  deliveredKcalPerKgDay: number;
  /** Delivered glucose infusion rate in `mg/kg/min`. */
  deliveredGirMgKgMin: number;
  /** Ordered pharmacy compounding lines with additive volumes in `mL`. */
  compoundingLines: Array<{
    ingredientKey: string;
    label: string;
    stockConcentrationLabel: string;
    volumeMl: number;
  }>;
  /** Non-blocking clinical advisory warnings (osmolarity, Ca-PO4 precipitation, GIR). */
  warnings: ClinicalSafetyAlert[];
  /** Guideline citations (ESPGHAN / NICE / WHO neonatal nutrition). */
  citations: ClinicalBasisCitation[];
}

// -- Anthropometric Growth Z-Scores -------------------------------------------

/**
 * Single anthropometric measurement point for WHO (0–19y) or Fenton (preterm)
 * growth evaluation.
 */
export interface GrowthMeasurementPoint {
  /** ISO-8601 date or age in days at measurement. */
  ageDays: number;
  /** Postmenstrual age in days for preterm infants evaluated on Fenton curves. */
  postmenstrualAgeDays?: number;
  /** Weight in kilograms. */
  weightKg?: number;
  /** Length (recumbent) or standing height in centimetres. */
  heightCm?: number;
  /** Occipitofrontal head circumference in centimetres. */
  headCircumferenceCm?: number;
  /** Mid-upper arm circumference in centimetres. */
  muacCm?: number;
}

/**
 * Request to evaluate one or longitudinal anthropometric measurements.
 */
export interface GrowthEvaluationInput {
  /** Biological sex (`MALE` or `FEMALE` required for LMS lookup). */
  sex: BiologicalSex;
  /** Gestational age at birth in total days (triggers Fenton preterm curves when `<259` days). */
  gestationalAgeDays?: number;
  /** One or more chronological measurements. */
  measurements: GrowthMeasurementPoint[];
}

/**
 * Computed z-scores, percentiles, and nutritional classifications.
 */
export interface GrowthEvaluationResult {
  /** Growth reference standard selected (`WHO_CHILD_GROWTH` or `FENTON_PRETERM`). */
  standardUsed: 'WHO_CHILD_GROWTH' | 'FENTON_PRETERM';
  /** Per-indicator z-score results for the latest measurement. */
  indicators: Array<{
    indicator:
      | 'WEIGHT_FOR_AGE'
      | 'LENGTH_HEIGHT_FOR_AGE'
      | 'WEIGHT_FOR_LENGTH_HEIGHT'
      | 'BMI_FOR_AGE'
      | 'HEAD_CIRCUMFERENCE_FOR_AGE'
      | 'MUAC_FOR_AGE';
    zScore: number;
    percentile: number;
    classification: string;
    loincCode: string;
  }>;
  /** Nutritional danger alerts (for example Severe Acute Malnutrition `WLZ < -3`). */
  alerts: ClinicalSafetyAlert[];
  /** Authoritative standard citations. */
  citations: ClinicalBasisCitation[];
}

// -- Clinical Calculators -----------------------------------------------------

/**
 * Summary metadata for one bedside clinical calculator.
 */
export interface CalculatorSummary {
  /** Stable URL-safe calculator slug (for example `'apgar'`, `'blantyre-coma-scale'`). */
  slug: string;
  /** Human-readable calculator title. */
  title: string;
  /** Clinical category (`NEONATAL`, `NEUROLOGICAL`, `RESPIRATORY`, `FLUIDS_RENAL`, `SEPSIS`, etc.). */
  category: string;
  /** Input field definitions. */
  inputs: Array<{
    key: string;
    label: string;
    type: 'NUMBER' | 'CHOICE' | 'BOOLEAN';
    unit?: string;
    options?: Array<{ value: string | number; label: string }>;
  }>;
}

/**
 * Request to execute one of the 34 deterministic bedside calculators.
 */
export interface CalculatorEvaluationInput {
  /** Calculator slug (for example `'ballard-maturational'`, `'downes-rds'`, `'psofa'`). */
  calculatorSlug: string;
  /** Key-value map of calculator inputs. */
  inputs: Record<string, number | string | boolean>;
  /** Optional patient context for age/sex-dependent calculators (such as Schwartz eGFR). */
  patient?: PatientClinicalContext;
}

/**
 * Deterministic calculator score, clinical band interpretation, and citations.
 */
export interface CalculatorEvaluationResult {
  /** Calculator slug evaluated. */
  calculatorSlug: string;
  /** Calculator title. */
  title: string;
  /** Computed primary numeric score or value. */
  score: number;
  /** Unit of `score` when dimensional (for example `mL/min/1.73m2` or `points`). */
  unit?: string;
  /** Clinical risk/severity band label (for example `Severe respiratory distress`). */
  interpretation: string;
  /** Recommended bedside action if defined by the scoring guideline. */
  recommendedAction?: string;
  /** Safety alerts when inputs are out of physiological bounds or critical. */
  alerts: ClinicalSafetyAlert[];
  /** Guideline citations. */
  citations: ClinicalBasisCitation[];
}

// -- Guideline Search ---------------------------------------------------------

/**
 * Request to search curated clinical guidelines and playbooks with citations.
 */
export interface GuidelineSearchInput {
  /** Clinical search phrase (never include patient-identifiable information). */
  query: string;
  /** Optional age filter in days. */
  ageDays?: number;
  /** Maximum passages to return (default `5`, max `20`). */
  limit?: number;
}

/**
 * Cited passage snippet returned from the curated clinical reference corpus.
 */
export interface GuidelineSearchResult {
  /** Matching excerpts ordered by clinical relevance. */
  hits: Array<{
    slug: string;
    kind: 'clinicalPlaybook' | 'presentingComplaint' | 'medication' | 'investigation' | 'medicalStandard';
    title: string;
    excerpt: string;
    codes: CodedTerm[];
    citation: ClinicalBasisCitation;
  }>;
}

// -- Clinical Learning (OSCE) Mode --------------------------------------------

/**
 * Request to start a `PRACTICE` or `EXAM` clinical learning station session.
 */
export interface StartClinicalLearningSessionInput {
  /** Scenario slug (for example `'neonatal-sepsis-hypoglycaemia'`). */
  scenarioSlug: string;
  /** Station mode (`PRACTICE` or timed `EXAM` with server-held `truthSignals`). */
  mode: ClinicalLearningMode;
}

/**
 * Learner-safe scenario view returned when a station opens (`truthSignals` and
 * grading keys are stripped by the server in `EXAM` mode).
 */
export interface ClinicalLearningSessionView {
  /** Server-tracked attempt session ID. */
  attemptId: string;
  /** Scenario slug. */
  scenarioSlug: string;
  /** Scenario title. */
  title: string;
  /** Operating mode (`PRACTICE` or `EXAM`). */
  mode: ClinicalLearningMode;
  /** Time limit in seconds (`EXAM` mode). */
  timeLimitSeconds: number;
  /** Opening bedside vignette presented to the learner. */
  patientVignette: string;
  /** De-identified patient vitals and anthropometry at presentation. */
  patient: PatientClinicalContext;
  /** Initial presenting complaint slug. */
  complaintSlug: string;
  /** Structured bedside hints exposed only during `PRACTICE` mode. */
  practiceHints?: string[];
  /** Post-review teaching pearls included in `PRACTICE` mode. */
  teachingPearls?: string[];
  /** Baseline bedside vitals recorded at scenario presentation. */
  vitals?: Record<string, number | undefined>;
  /** Initial history keys pre-revealed by the scenario. */
  revealedHistoryKeys?: string[];
  /** Initial physical exam keys pre-revealed by the scenario. */
  revealedExamKeys?: string[];
}

// -- Runtime Embed Catalog Summaries ------------------------------------------

/** LMS growth standard table keyed by standard id (`WHO_WEIGHT_FOR_AGE_BOYS_0_5Y`, etc.). */
export type GrowthStandardsMap = Record<
  string,
  {
    standardKey: string;
    axes: string[];
    data: Array<Record<string, number | string>>;
    sources?: Array<{ id: string; citation?: string; title?: string; year?: number; section?: string }>;
  }
>;

/** Presenting complaint metadata for structured clerking UIs. */
export interface ClerkingComplaintSummary {
  slug: string;
  title: string;
  category: string;
  ageBands: string[];
  keyQuestions: string[];
  redFlagKeys: string[];
  associatedSymptomKeys: string[];
}

/** Curated medication summary for interactive dose prescribers. */
export interface DosingMedicationSummary {
  key: string;
  slug: string;
  name: string;
  genericName: string;
  category: string;
  defaultRoutes: string[];
  defaultFrequencies: string[];
  ageBands: string[];
}

/** Playbook / guideline catalog entry surfaced as browseable clinical hints. */
export interface GuidelineCatalogEntry {
  slug: string;
  title: string;
  category: string;
  ageBands: string[];
  summary: string;
}

/** Clinical learning OSCE scenario summary for station selection. */
export interface ClinicalLearningScenarioSummary {
  slug: string;
  title: string;
  difficulty: string;
  ageBand: string;
  specialty: string;
  presentingComplaintSlug?: string;
}

/**
 * Learner's submitted clinical workup, reasoning matrix, and manual paediatric
 * prescription calculations for deterministic 6-domain grading.
 */
export interface SubmitClinicalLearningAttemptInput {
  /** Attempt session ID (or scenario slug when grading locally). */
  attemptId: string;
  /** Scenario slug. */
  scenarioSlug: string;
  /** History questions asked by the learner (`UPPER_SNAKE_CASE` keys). */
  historyKeysAsked: string[];
  /** Physical examination signs checked by the learner (`UPPER_SNAKE_CASE` keys). */
  examKeysChecked: string[];
  /** Bedside/lab investigations ordered (`UPPER_SNAKE_CASE` or investigation slugs). */
  investigationsOrdered: string[];
  /** Selected primary and differential playbook slugs. */
  selectedDifferentials: Array<{
    playbookSlug: string;
    rank: 'PRIMARY' | 'DIFFERENTIAL';
    supportingKeysCited: string[];
  }>;
  /** Manual paediatric prescriptions written (`mg/kg` -> `mL` calculation check). */
  prescriptionsWritten: Array<{
    medicationKey: string;
    route: string;
    doseMgPerKgEntered: number;
    singleDoseMgEntered: number;
    volumeMlEntered?: number;
    frequencyLabel: string;
  }>;
  /** Danger signs explicitly escalated by the learner. */
  redFlagsRecognised: string[];
  /** Elapsed station duration in seconds. */
  elapsedSeconds: number;
}

/**
 * Deterministic 6-domain OSCE grading report with guideline citations.
 */
export interface ClinicalLearningGradeReport {
  /** Scenario slug graded. */
  scenarioSlug: string;
  /** Overall percentage score (`0`–`100`). */
  overallScore: number;
  /** True when overall score >= passing threshold AND no critical safety failure occurred. */
  passed: boolean;
  /** Per-domain breakdown across all 6 clinical competency domains. */
  domainScores: Array<{
    domain: ClinicalLearningDomain;
    score: number;
    maxScore: number;
    feedback: string[];
  }>;
  /** Critical danger signs or dosing errors missed by the learner. */
  criticalSafetyGaps: string[];
  /** WHO AWaRe antibiotic stewardship feedback on the learner's prescriptions. */
  stewardshipFeedback: string[];
  /** Authoritative guideline citations explaining each rubric item. */
  citations: ClinicalBasisCitation[];
}

// -- Pluggable Transport Interface --------------------------------------------

/**
 * Transport abstraction underlying `CrosdatClient` and `@crosdat/mcp`.
 *
 * Defaults to `HttpClinicalTransport` (HTTPS + RFC 9449 DPoP against the
 * CROSDAT Clinical API). Custom implementations can be injected for unit
 * testing, sandboxes, or custom network adapters.
 */
export interface ClinicalTransport {
  /** Mints a short-lived browser embed or thin-slice session. */
  createEmbedSession(input: CreateEmbedSessionInput): Promise<EmbedSessionCredentials>;
  /** Evaluates triage priority, follow-up questions, and ranked differentials. */
  evaluateDifferentials(input: EvaluateDifferentialsInput): Promise<DifferentialEvaluationResult>;
  /** Calculates a weight-, age-, and route-specific paediatric/neonatal dose. */
  evaluateDose(input: DoseEvaluationInput): Promise<DoseEvaluationResult>;
  /** Calculates a neonatal TPN bag compounding table and osmolarity checks. */
  evaluateNeonatalTpn(input: NeonatalTpnEvaluationInput): Promise<NeonatalTpnEvaluationResult>;
  /** Computes WHO or Fenton anthropometric z-scores and percentiles. */
  evaluateGrowth(input: GrowthEvaluationInput): Promise<GrowthEvaluationResult>;
  /** Lists available bedside clinical calculators. */
  listCalculators(): Promise<CalculatorSummary[]>;
  /** Evaluates a single bedside clinical calculator. */
  evaluateCalculator(input: CalculatorEvaluationInput): Promise<CalculatorEvaluationResult>;
  /** Searches curated clinical guidelines and returns cited excerpts. */
  searchGuidelines(input: GuidelineSearchInput): Promise<GuidelineSearchResult>;
  /** Starts a `PRACTICE` or `EXAM` clinical learning station session. */
  startClinicalLearningSession(
    input: StartClinicalLearningSessionInput,
  ): Promise<ClinicalLearningSessionView>;
  /** Grades a submitted clinical learning station attempt across 6 domains. */
  submitClinicalLearningAttempt(
    input: SubmitClinicalLearningAttemptInput,
  ): Promise<ClinicalLearningGradeReport>;
  /** Lists WHO and CDC LMS growth chart standards bundled by the gateway. */
  listGrowthStandards?(): Promise<GrowthStandardsMap>;
  /** Lists structured presenting complaints for interactive clerking UIs. */
  listClerkingComplaints?(): Promise<ClerkingComplaintSummary[]>;
  /** Lists curated paediatric/neonatal medications for interactive dosing. */
  listDosingMedications?(): Promise<DosingMedicationSummary[]>;
  /** Lists curated clinical playbooks and guideline hints. */
  listGuidelineCatalog?(): Promise<GuidelineCatalogEntry[]>;
  /** Lists available OSCE clinical learning scenarios. */
  listClinicalLearningScenarios?(): Promise<ClinicalLearningScenarioSummary[]>;
  /** Submits PHI-free clinical feedback from an embedded workbench or SDK client. */
  submitFeedback?(input: SubmitEmbedFeedbackInput): Promise<SubmitEmbedFeedbackResult>;
}
