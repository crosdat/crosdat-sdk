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

  it('requests /growth/standards with optional keys query parameter and evaluates longitudinal growthSeries', async () => {
    const urls: string[] = [];
    const fetchFn: typeof fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      urls.push(url);
      if (url.includes('/growth/standards')) {
        return new Response(
          JSON.stringify({
            data: {
              WHO_WEIGHT_FOR_AGE_BOYS_0_5Y: {
                standardKey: 'WHO_WEIGHT_FOR_AGE_BOYS_0_5Y',
                axes: ['ageMonths', 'L', 'M', 'S'],
                data: [],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            standardUsed: 'WHO_CHILD_GROWTH',
            standardFamily: 'DOWN_SYNDROME',
            indicators: [],
            alerts: [],
            citations: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const client = createCrosdatClient({
      baseUrl: 'https://api.crosdat.com/api/v1',
      apiKey: 'ck_test_growth',
      enableDpop: false,
      fetchFn,
    });

    await client.listGrowthStandards();
    const filtered = await client.listGrowthStandards(['WHO_WEIGHT_FOR_AGE_BOYS_0_5Y']);
    expect(filtered.WHO_WEIGHT_FOR_AGE_BOYS_0_5Y?.standardKey).toBe('WHO_WEIGHT_FOR_AGE_BOYS_0_5Y');

    const evalRes = await client.evaluateGrowth({
      sex: 'MALE',
      conditionProfile: 'DOWN_SYNDROME',
      measurements: [
        {
          ageDays: 365,
          weightKg: 8.6,
          heightCm: 72.1,
          headCircumferenceCm: 43.8,
          muacCm: 13.8,
          recordedAt: '2026-01-15T10:00:00Z',
          label: '12-month follow-up',
        },
      ],
    });
    expect(evalRes.standardFamily).toBe('DOWN_SYNDROME');
    expect(urls).toEqual([
      'https://api.crosdat.com/api/v1/growth/standards',
      'https://api.crosdat.com/api/v1/growth/standards?keys=WHO_WEIGHT_FOR_AGE_BOYS_0_5Y',
      'https://api.crosdat.com/api/v1/growth/evaluate',
    ]);
  });
});
