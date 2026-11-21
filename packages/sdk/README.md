# `@crosdat/sdk`

Zero-dependency TypeScript client, RFC 9449 DPoP proof signer/verifier, and typed domain contracts for the CROSDAT Clinical Intelligence API.

## Installation

```bash
pnpm add @crosdat/sdk
```

## Highlights

- **RFC 9449 DPoP Proof-of-Possession (`@crosdat/sdk/dpop`)** — Generates non-extractable WebCrypto ECDSA P-256 keypairs (`createDpopKeyPair`), computes RFC 7638 JWK SHA-256 thumbprints (`computeJwkThumbprint`), signs per-request `dpop+jwt` proofs with `ath` and `DPoP-Nonce` rotation (`signDpopProof`), and verifies proofs cryptographically (`verifyDpopProof`).
- **Complete Clinical Surface** — Typed methods for `createEmbedSession`, `evaluateDifferentials`, `evaluateDose`, `evaluateNeonatalTpn`, `evaluateGrowth`, `listCalculators`, `evaluateCalculator`, `searchGuidelines`, `askClinicalEvidence` (`POST /evidence/ask`), `startClinicalLearningSession`, and `submitClinicalLearningAttempt`.
- **Host AI & Evidence Contracts** — Exports `EmbedModuleKind.EVIDENCE_ASK`, `ClinicalAiMode`, `EvidenceAnswerStatus`, and `ClinicalAiHostOptions` for configuring citation-locked Q&A and voice assistance.
- **Pluggable `ClinicalTransport`** — Inject a custom transport for unit tests, sandboxes, or custom network adapters without mocking `fetch`.

## Usage

```ts
import { createCrosdatClient } from '@crosdat/sdk';

const client = createCrosdatClient({
  baseUrl: 'https://api.crosdat.com/api/v1',
  apiKey: process.env.CROSDAT_API_KEY,
});

const dose = await client.evaluateDose({
  patient: { ageDays: 180, sex: 'MALE', weightKg: 7.4 },
  medicationKey: 'gentamicin',
  route: 'IV',
});

console.log(dose.calculatedSingleDose, dose.doseUnit, dose.frequencyLabel);

const evidence = await client.askClinicalEvidence({
  question: 'What is the initial IV artesunate dose for children under 20 kg?',
  patient: { ageDays: 900, sex: 'FEMALE', weightKg: 12 },
});

console.log(evidence.status, evidence.answerMarkdown, evidence.citations);
```
