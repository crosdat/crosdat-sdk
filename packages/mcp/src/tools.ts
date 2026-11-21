import type {
  AskClinicalEvidenceInput,
  CalculatorEvaluationInput,
  ClinicalTransport,
  DoseEvaluationInput,
  EvaluateDifferentialsInput,
  FacilityClinicalOverridesInput,
  GrowthEvaluationInput,
  GuidelineSearchInput,
  NeonatalTpnEvaluationInput,
} from '@crosdat/sdk';

/**
 * Canonical tool names exposed by the stateless CROSDAT Clinical Knowledge MCP server.
 */
export const ClinicalMcpToolName = {
  SEARCH_GUIDELINES: 'search_guidelines',
  ASK_CLINICAL_EVIDENCE: 'ask_clinical_evidence',
  EVALUATE_TRIAGE_AND_DIFFERENTIALS: 'evaluate_triage_and_differentials',
  CALCULATE_PAEDIATRIC_DOSE: 'calculate_paediatric_dose',
  CALCULATE_NEONATAL_TPN: 'calculate_neonatal_tpn',
  COMPUTE_GROWTH_ZSCORE: 'compute_growth_zscore',
  RUN_CLINICAL_CALCULATOR: 'run_clinical_calculator',
} as const;
export type ClinicalMcpToolName =
  (typeof ClinicalMcpToolName)[keyof typeof ClinicalMcpToolName];

/**
 * JSON Schema descriptor advertised in MCP `tools/list` responses.
 */
export interface McpJsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Single content block inside an MCP `CallToolResult`.
 */
export interface McpTextContent {
  type: 'text';
  text: string;
}

/**
 * Result returned by an MCP tool invocation.
 */
export interface McpCallToolResult {
  content: McpTextContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Registered MCP tool definition supporting both schema discovery and execution.
 */
export interface McpToolDefinition<TArgs = Record<string, unknown>> {
  /** Unique snake_case tool identifier. */
  name: string;
  /** Human-readable clinical description instructing the LLM when and how to call the tool. */
  description: string;
  /** JSON Schema validating the tool's input arguments. */
  inputSchema: McpJsonSchema;
  /** Async handler executing the deterministic tool calculation. */
  handler: (args: TArgs) => Promise<McpCallToolResult>;
}

const PATIENT_CONTEXT_SCHEMA = {
  type: 'object',
  description:
    'De-identified biological context (age in days, biological sex, weight, stature, gestation). Never send patient names, hospital numbers, or contact details.',
  properties: {
    ageDays: { type: 'number', minimum: 0, description: 'Chronological age in days.' },
    sex: { type: 'string', enum: ['MALE', 'FEMALE', 'INTERSEX', 'UNKNOWN'] },
    weightKg: { type: 'number', exclusiveMinimum: 0, description: 'Body weight in kilograms.' },
    heightCm: { type: 'number', exclusiveMinimum: 0, description: 'Length or height in cm.' },
    headCircumferenceCm: { type: 'number', exclusiveMinimum: 0 },
    gestationalAgeDays: {
      type: 'number',
      minimum: 140,
      maximum: 315,
      description: 'Gestational age at birth in total days (for neonates/preterm).',
    },
    allergyKeys: {
      type: 'array',
      items: { type: 'string' },
      description: 'Known allergy catalog keys in UPPER_SNAKE_CASE.',
    },
  },
  required: ['ageDays', 'sex'],
} as const;

function toStructuredToolResult(value: unknown): McpCallToolResult {
  const structured =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { result: value };
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: structured,
  };
}

/**
 * Builds the 7 stateless reference clinical knowledge MCP tool definitions
 * backed by any {@link ClinicalTransport}.
 *
 * @param transport - Underlying HTTP + DPoP or custom `ClinicalTransport`.
 * @param defaultOverrides - Optional facility clinical overrides injected by default.
 * @returns Array of 7 deterministic clinical MCP tool definitions.
 */
export function buildReferenceClinicalMcpTools(
  transport: ClinicalTransport,
  defaultOverrides?: FacilityClinicalOverridesInput,
): McpToolDefinition[] {
  return [
    {
      name: ClinicalMcpToolName.SEARCH_GUIDELINES,
      description:
        'Searches curated paediatric and neonatal clinical guidelines, playbooks, and medication monographs. Always call this before citing clinical thresholds or management steps.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Clinical topic or question (never include patient-identifiable data).',
          },
          ageDays: {
            type: 'number',
            minimum: 0,
            description: 'Optional patient age in days to filter age-appropriate guidelines.',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 20,
            description: 'Maximum number of cited passages to return (default 5).',
          },
        },
        required: ['query'],
      },
      handler: async (raw) => {
        const input = raw as unknown as GuidelineSearchInput;
        if (!input || typeof input.query !== 'string' || input.query.trim().length === 0) {
          throw new Error('search_guidelines requires a non-empty `query` string.');
        }
        const res = await transport.searchGuidelines(input);
        return toStructuredToolResult(res);
      },
    },
    {
      name: ClinicalMcpToolName.ASK_CLINICAL_EVIDENCE,
      description:
        'Answers a clinical question using citation-locked curated paediatric and neonatal guidelines, returning inline [n] citations and deterministic tool calculations or abstaining safely when evidence is insufficient.',
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description:
              'Clinical question or guideline query (never include patient-identifiable data).',
          },
          patient: PATIENT_CONTEXT_SCHEMA,
          contextSlugs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional active presenting complaint or playbook slugs to scope retrieval.',
          },
          maxCitations: {
            type: 'number',
            minimum: 1,
            maximum: 20,
            description: 'Maximum number of cited passages to include in the answer.',
          },
        },
        required: ['question'],
      },
      handler: async (raw) => {
        const input = raw as unknown as AskClinicalEvidenceInput;
        if (!input || typeof input.question !== 'string' || input.question.trim().length === 0) {
          throw new Error('ask_clinical_evidence requires a non-empty `question` string.');
        }
        if (!transport.askClinicalEvidence) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'ask_clinical_evidence is not supported by the active ClinicalTransport.',
              },
            ],
          };
        }
        const res = await transport.askClinicalEvidence({
          ...input,
          facilityOverrides: input.facilityOverrides ?? defaultOverrides,
        });
        return toStructuredToolResult(res);
      },
    },
    {
      name: ClinicalMcpToolName.EVALUATE_TRIAGE_AND_DIFFERENTIALS,
      description:
        'Evaluates emergency/priority triage danger signs, next discriminating bedside questions, and ranked differential diagnoses with ICD-11, SNOMED CT, and LOINC codes.',
      inputSchema: {
        type: 'object',
        properties: {
          patient: PATIENT_CONTEXT_SCHEMA,
          complaintSlugs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Active presenting complaint slugs (for example ["paediatric-fever"]).',
          },
          presentKeys: {
            type: 'array',
            items: { type: 'string' },
            description: 'Observed symptoms or signs in UPPER_SNAKE_CASE.',
          },
          absentKeys: {
            type: 'array',
            items: { type: 'string' },
            description: 'Explicitly excluded symptoms or signs in UPPER_SNAKE_CASE.',
          },
          measurements: {
            type: 'object',
            description: 'Quantitative bedside measurements keyed by catalog key.',
          },
        },
        required: ['patient', 'complaintSlugs', 'presentKeys'],
      },
      handler: async (raw) => {
        const input = raw as unknown as EvaluateDifferentialsInput;
        const res = await transport.evaluateDifferentials({
          ...input,
          facilityOverrides: input.facilityOverrides ?? defaultOverrides,
        });
        return toStructuredToolResult(res);
      },
    },
    {
      name: ClinicalMcpToolName.CALCULATE_PAEDIATRIC_DOSE,
      description:
        'Computes deterministic weight-, age-, and indication-specific paediatric or neonatal drug doses, max-dose caps, measurable mL volumes, continuous IV infusion recipes, and WHO AWaRe stewardship categories. Never perform mental arithmetic for paediatric doses—always call this tool.',
      inputSchema: {
        type: 'object',
        properties: {
          patient: PATIENT_CONTEXT_SCHEMA,
          medicationKey: {
            type: 'string',
            description: 'Canonical medication slug or key (for example "gentamicin" or "amoxicillin").',
          },
          indication: {
            type: 'string',
            description: 'Optional clinical indication or playbook slug.',
          },
          route: {
            type: 'string',
            description: 'Preferred route (ORAL, IV, IM, RECTAL, NEBULISED).',
          },
          formulationId: {
            type: 'string',
            description: 'Optional formulation identifier.',
          },
        },
        required: ['patient', 'medicationKey'],
      },
      handler: async (raw) => {
        const input = raw as unknown as DoseEvaluationInput;
        const res = await transport.evaluateDose({
          ...input,
          facilityOverrides: input.facilityOverrides ?? defaultOverrides,
        });
        return toStructuredToolResult(res);
      },
    },
    {
      name: ClinicalMcpToolName.CALCULATE_NEONATAL_TPN,
      description:
        'Computes a neonatal Total Parenteral Nutrition (TPN) compounding bag, infusion rates, glucose infusion rate (GIR), osmolarity, and calcium-phosphate safety alerts.',
      inputSchema: {
        type: 'object',
        properties: {
          patient: PATIENT_CONTEXT_SCHEMA,
          accessRoute: { type: 'string', enum: ['PERIPHERAL', 'CENTRAL'] },
          totalFluidMlPerKgDay: { type: 'number', exclusiveMinimum: 0 },
          enteralFeedsMlPerKgDay: { type: 'number', minimum: 0 },
          aminoAcidsGPerKgDay: { type: 'number', minimum: 0 },
          lipidsGPerKgDay: { type: 'number', minimum: 0 },
          targetGirMgKgMin: { type: 'number', exclusiveMinimum: 0 },
          sodiumMmolPerKgDay: { type: 'number', minimum: 0 },
          potassiumMmolPerKgDay: { type: 'number', minimum: 0 },
          calciumMmolPerKgDay: { type: 'number', minimum: 0 },
          phosphateMmolPerKgDay: { type: 'number', minimum: 0 },
          magnesiumMmolPerKgDay: { type: 'number', minimum: 0 },
        },
        required: [
          'patient',
          'accessRoute',
          'totalFluidMlPerKgDay',
          'aminoAcidsGPerKgDay',
          'lipidsGPerKgDay',
          'targetGirMgKgMin',
        ],
      },
      handler: async (raw) => {
        const input = raw as unknown as NeonatalTpnEvaluationInput;
        const res = await transport.evaluateNeonatalTpn(input);
        return toStructuredToolResult(res);
      },
    },
    {
      name: ClinicalMcpToolName.COMPUTE_GROWTH_ZSCORE,
      description:
        'Computes exact WHO Child Growth (0-19 years) or Fenton Preterm (22-50 weeks) z-scores, percentiles, LOINC codes, and malnutrition alerts.',
      inputSchema: {
        type: 'object',
        properties: {
          sex: { type: 'string', enum: ['MALE', 'FEMALE', 'INTERSEX', 'UNKNOWN'] },
          gestationalAgeDays: {
            type: 'number',
            description: 'Gestational age at birth in total days (selects Fenton curves when < 259).',
          },
          measurements: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ageDays: { type: 'number', minimum: 0 },
                postmenstrualAgeDays: { type: 'number' },
                weightKg: { type: 'number', exclusiveMinimum: 0 },
                heightCm: { type: 'number', exclusiveMinimum: 0 },
                headCircumferenceCm: { type: 'number', exclusiveMinimum: 0 },
                muacCm: { type: 'number', exclusiveMinimum: 0 },
              },
              required: ['ageDays'],
            },
          },
        },
        required: ['sex', 'measurements'],
      },
      handler: async (raw) => {
        const input = raw as unknown as GrowthEvaluationInput;
        const res = await transport.evaluateGrowth(input);
        return toStructuredToolResult(res);
      },
    },
    {
      name: ClinicalMcpToolName.RUN_CLINICAL_CALCULATOR,
      description:
        'Executes one of the 34 deterministic bedside clinical calculators (such as apgar, ballard-maturational, downes-rds, silverman-andersen, blantyre-coma-scale, paediatric-gcs, psofa, holiday-segar-fluids, bedside-schwartz-egfr, bhutani-bilirubin).',
      inputSchema: {
        type: 'object',
        properties: {
          calculatorSlug: {
            type: 'string',
            description: 'URL-safe calculator slug to evaluate.',
          },
          inputs: {
            type: 'object',
            description: 'Key-value map of calculator input parameters.',
          },
          patient: PATIENT_CONTEXT_SCHEMA,
        },
        required: ['calculatorSlug', 'inputs'],
      },
      handler: async (raw) => {
        const input = raw as unknown as CalculatorEvaluationInput;
        const res = await transport.evaluateCalculator(input);
        return toStructuredToolResult(res);
      },
    },
  ];
}
