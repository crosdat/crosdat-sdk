# `@crosdat/mcp`

Model Context Protocol (MCP) server and extensible tool registry grounding AI clinical agents in deterministic CROSDAT paediatric and neonatal calculations rather than free-text mental arithmetic.

## Exposed Reference Clinical Tools

1. `search_guidelines` — Retrieves cited excerpts from curated paediatric/neonatal guidelines, playbooks, and monographs.
2. `evaluate_triage_and_differentials` — Evaluates emergency/priority danger signs, next discriminating bedside questions, and ranked differentials with ICD-11, SNOMED CT, and LOINC codes.
3. `calculate_paediatric_dose` — Computes weight-, age-, and indication-specific doses, max-dose ceilings, measurable `mL` volumes, continuous IV infusion recipes, and WHO AWaRe categories.
4. `calculate_neonatal_tpn` — Computes neonatal parenteral nutrition compounding volumes, GIR, osmolarity, and calcium-phosphate safety alerts.
5. `compute_growth_zscore` — Computes WHO Child Growth (0–19y) and Fenton Preterm (22–50w) z-scores and percentiles.
6. `run_clinical_calculator` — Runs any of the 34 deterministic bedside clinical calculators.

## Standalone CLI (`crosdat-mcp`)

```bash
CROSDAT_API_KEY="ck_live_..." npx @crosdat/mcp
```

## Programmatic Composition

Downstream servers can compose additional domain-specific tools onto `ClinicalKnowledgeMcpServer` without duplicating the 6 reference clinical tools:

```ts
import { createCrosdatClient } from '@crosdat/sdk';
import { createClinicalKnowledgeMcpServer, runMcpStdioServer } from '@crosdat/mcp';

const client = createCrosdatClient({
  baseUrl: 'https://api.crosdat.com/api/v1',
  apiKey: process.env.CROSDAT_API_KEY,
});

const server = createClinicalKnowledgeMcpServer({ transport: client }).registerTool({
  name: 'get_formulary_policy_note',
  description: 'Fetches local antimicrobial stewardship contact hours.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => ({
    content: [{ type: 'text', text: 'Stewardship pharmacist on call 08:00–20:00.' }],
  }),
});

runMcpStdioServer(server);
```
