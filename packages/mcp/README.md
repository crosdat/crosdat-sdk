# `@crosdat/mcp`

Model Context Protocol (MCP) server and extensible tool registry grounding AI clinical agents in deterministic CROSDAT paediatric and neonatal calculations rather than free-text mental arithmetic.

## Exposed Reference Clinical Tools

1. `search_guidelines` — Retrieves cited excerpts from curated paediatric/neonatal guidelines, playbooks, and monographs.
2. `ask_clinical_evidence` — Answers clinical questions with citation-locked curated reference evidence, inline `[n]` citations, and deterministic tool calculations (`POST /evidence/ask`).
3. `evaluate_triage_and_differentials` — Evaluates emergency/priority danger signs, next discriminating bedside questions, and ranked differentials with ICD-11, SNOMED CT, and LOINC codes.
4. `calculate_paediatric_dose` — Computes weight-, age-, and indication-specific doses, max-dose ceilings, measurable `mL` volumes, continuous IV infusion recipes, and WHO AWaRe categories.
5. `calculate_neonatal_tpn` — Computes neonatal parenteral nutrition compounding volumes, GIR, osmolarity, and calcium-phosphate safety alerts.
6. `compute_growth_zscore` — Computes WHO Child Growth (0–19y) and Fenton Preterm (22–50w) z-scores and percentiles.
7. `run_clinical_calculator` — Runs any of the 34 deterministic bedside clinical calculators.

## Transports & Protocol Versions

- **MCP Revisions**: Negotiates `2025-06-18` (Streamable-HTTP), `2025-03-26`, and `2024-11-05` (`SUPPORTED_MCP_PROTOCOL_VERSIONS`), stamping the `MCP-Protocol-Version` header and extracting W3C `traceparent` from `params._meta` or HTTP headers.
- **Streamable-HTTP (`handleMcpHttpRequest`)**: Framework-agnostic adapter returning `{ status, headers, body }` for stateless `POST` JSON-RPC requests and `202` notifications.

## Standalone CLI (`crosdat-mcp`)

```bash
CROSDAT_API_KEY="ck_live_..." npx @crosdat/mcp
```

## Programmatic Composition

Downstream servers can compose additional domain-specific tools onto `ClinicalKnowledgeMcpServer` without duplicating the 7 reference clinical tools:

```ts
import { createCrosdatClient } from '@crosdat/sdk';
import {
  createClinicalKnowledgeMcpServer,
  handleMcpHttpRequest,
  runMcpStdioServer,
} from '@crosdat/mcp';

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
