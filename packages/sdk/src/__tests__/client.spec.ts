import { describe, expect, it, vi } from 'vitest';
import { CrosdatApiError, createCrosdatClient, verifyDpopProof } from '../index.js';
import type { ClinicalTransport } from '../types.js';

describe('CrosdatClient and HttpClinicalTransport', () => {
  it('attaches RFC 9449 DPoP headers, rotates DPoP-Nonce, and unwraps { data } envelopes', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn: typeof fetch = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          data: {
            medicationKey: 'gentamicin',
            medicationName: 'Gentamicin',
            route: 'IV',
            dosePerKg: 7.5,
            doseBasis: 'mg/kg/dose',
            calculatedSingleDose: 30,
            doseUnit: 'mg',
            cappedAtMaxSingleDose: false,
            frequencyLabel: 'Every 24 hours',
            codes: [],
            alerts: [],
            appliedFacilityOverrides: [],
            citations: [{ sourceId: 'who-pb', title: 'WHO Pocket Book' }],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'DPoP-Nonce': 'next_nonce_99',
          },
        },
      );
    });

    const client = createCrosdatClient({
      baseUrl: 'https://api.crosdat.com/api/v1/',
      sessionToken: 'sess_tok_live',
      fetchFn,
    });

    const first = await client.evaluateDose({
      patient: { ageDays: 120, sex: 'FEMALE', weightKg: 4.0 },
      medicationKey: 'gentamicin',
      route: 'IV',
    });
    expect(first.calculatedSingleDose).toBe(30);

    await client.listCalculators();
    expect(calls).toHaveLength(2);

    const firstHeaders = calls[0]!.init?.headers as Record<string, string>;
    expect(firstHeaders.Authorization).toBe('DPoP sess_tok_live');
    const verifiedFirst = await verifyDpopProof(firstHeaders.DPoP!);
    expect(verifiedFirst.nonce).toBeUndefined();

    const secondHeaders = calls[1]!.init?.headers as Record<string, string>;
    const verifiedSecond = await verifyDpopProof(secondHeaders.DPoP!);
    expect(verifiedSecond.nonce).toBe('next_nonce_99');
  });

  it('retries transient 503 responses and parses structured CrosdatApiError on 429', async () => {
    let count = 0;
    const fetchFn: typeof fetch = vi.fn(async () => {
      count += 1;
      if (count === 1) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return new Response(
        JSON.stringify({
          error: {
            code: 'QUOTA_EXCEEDED',
            message: 'Monthly clinical evaluation quota reached.',
            details: { limit: 10000 },
          },
        }),
        {
          status: 429,
          headers: { 'X-Request-ID': 'req_abc_429' },
        },
      );
    });

    const client = createCrosdatClient({
      baseUrl: 'https://api.crosdat.com/api/v1',
      apiKey: 'ck_test_123',
      enableDpop: false,
      maxRetries: 1,
      fetchFn,
    });

    await expect(
      client.searchGuidelines({ query: 'neonatal hypoglycaemia', limit: 3 }),
    ).rejects.toMatchObject({
      name: 'CrosdatApiError',
      status: 429,
      code: 'QUOTA_EXCEEDED',
      requestId: 'req_abc_429',
      details: { limit: 10000 },
    } satisfies Partial<CrosdatApiError>);
    expect(count).toBe(2);
  });

  it('supports injecting a custom ClinicalTransport across all client methods', async () => {
    const customTransport: ClinicalTransport = {
      createEmbedSession: vi.fn(),
      evaluateDifferentials: vi.fn(),
      evaluateDose: vi.fn(),
      evaluateNeonatalTpn: vi.fn(),
      evaluateGrowth: vi.fn(async () => ({
        standardUsed: 'WHO_CHILD_GROWTH' as const,
        indicators: [
          {
            indicator: 'WEIGHT_FOR_AGE' as const,
            zScore: -1.2,
            percentile: 11.5,
            classification: 'Normal weight',
            loincCode: '77606-2',
          },
        ],
        alerts: [],
        citations: [],
      })),
      listCalculators: vi.fn(async () => []),
      evaluateCalculator: vi.fn(),
      searchGuidelines: vi.fn(),
      startClinicalLearningSession: vi.fn(),
      submitClinicalLearningAttempt: vi.fn(),
    };

    const client = createCrosdatClient({ transport: customTransport });
    const growth = await client.evaluateGrowth({
      sex: 'MALE',
      measurements: [{ ageDays: 180, weightKg: 7.2 }],
    });
    expect(growth.standardUsed).toBe('WHO_CHILD_GROWTH');
    expect(customTransport.evaluateGrowth).toHaveBeenCalledTimes(1);
  });

  it('submits PHI-free clinical feedback to POST /v1/feedback with DPoP and unwraps { data }', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn: typeof fetch = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          data: {
            accepted: true,
            ticketRef: 'FBK-2026-0042',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });

    const client = createCrosdatClient({
      baseUrl: 'https://api.crosdat.com/api/v1/',
      sessionToken: 'sess_tok_feedback',
      fetchFn,
    });

    const result = await client.submitFeedback({
      category: 'CLINICAL_ACCURACY',
      reasonCode: 'FORMULARY_MISMATCH',
      surfaceKey: 'dose-prescriber',
      targetKey: 'amoxicillin',
      message: 'Local hospital stocks 125 mg / 5 mL suspension only.',
      idempotencyKey: 'idem-feedback-1',
      contextMetadata: { bundleVersion: '2026.11' },
    });

    expect(result).toEqual({ accepted: true, ticketRef: 'FBK-2026-0042' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.crosdat.com/api/v1/feedback');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init?.body as string)).toEqual({
      category: 'CLINICAL_ACCURACY',
      reasonCode: 'FORMULARY_MISMATCH',
      surfaceKey: 'dose-prescriber',
      targetKey: 'amoxicillin',
      message: 'Local hospital stocks 125 mg / 5 mL suspension only.',
      idempotencyKey: 'idem-feedback-1',
      contextMetadata: { bundleVersion: '2026.11' },
    });

    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('DPoP sess_tok_feedback');
    const verified = await verifyDpopProof(headers.DPoP!);
    expect(verified.httpMethod).toBe('POST');
    expect(verified.httpUrl).toBe('https://api.crosdat.com/api/v1/feedback');
  });

  it('posts citation-locked evidence queries to POST /evidence/ask with DPoP and Bearer auth', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const sampleResponse = {
      status: 'ANSWERED' as const,
      answerMarkdown: 'Initial parenteral artesunate dose is 3.0 mg/kg for children < 20 kg [1].',
      citations: [
        {
          footnoteIndex: 1,
          passageId: 'who-malaria-p42',
          sourceId: 'who-malaria',
          title: 'WHO Guidelines for Malaria',
          excerpt: 'Children weighing < 20 kg should receive 3.0 mg/kg parenteral artesunate.',
          pageNumber: 42,
          sectionHeading: 'Severe Malaria Dosing',
        },
      ],
      deterministicToolResults: [
        {
          toolName: 'calculate_paediatric_dose',
          summary: 'Artesunate 36 mg IV at 0, 12, and 24 hours',
          payload: { calculatedSingleDose: 36, doseUnit: 'mg' },
        },
      ],
      contentVersion: '2026.11.0',
      modelId: 'crosdat-evidence-v1',
      topEvidenceScore: 0.94,
      latencyMs: 185,
    };

    const fetchFn: typeof fetch = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: sampleResponse }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const dpopClient = createCrosdatClient({
      baseUrl: 'https://api.crosdat.com/api/v1',
      sessionToken: 'sess_tok_evidence',
      fetchFn,
    });

    const dpopResult = await dpopClient.askClinicalEvidence({
      question: 'What is the IV artesunate dose for a 12 kg child with severe malaria?',
      patient: { ageDays: 900, sex: 'FEMALE', weightKg: 12 },
      contextSlugs: ['severe-malaria'],
      maxCitations: 3,
    });

    expect(dpopResult).toEqual(sampleResponse);
    expect(calls[0]!.url).toBe('https://api.crosdat.com/api/v1/evidence/ask');
    expect(calls[0]!.init?.method).toBe('POST');
    const dpopHeaders = calls[0]!.init?.headers as Record<string, string>;
    expect(dpopHeaders.Authorization).toBe('DPoP sess_tok_evidence');
    const verified = await verifyDpopProof(dpopHeaders.DPoP!);
    expect(verified.httpMethod).toBe('POST');
    expect(verified.httpUrl).toBe('https://api.crosdat.com/api/v1/evidence/ask');

    const bearerClient = createCrosdatClient({
      baseUrl: 'https://api.crosdat.com/api/v1',
      apiKey: 'ck_test_evidence',
      enableDpop: false,
      fetchFn,
    });
    await bearerClient.askClinicalEvidence({
      question: 'When is parenteral artesunate de-escalated to oral ACT?',
    });
    const bearerHeaders = calls[1]!.init?.headers as Record<string, string>;
    expect(bearerHeaders.Authorization).toBe('Bearer ck_test_evidence');
    expect(bearerHeaders.DPoP).toBeUndefined();
  });
});
