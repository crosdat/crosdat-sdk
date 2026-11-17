import {
  createDpopKeyPair,
  signDpopProof,
  type DpopKeyMaterial,
} from './dpop.js';
import { CrosdatApiError } from './errors.js';
import type {
  CalculatorEvaluationInput,
  CalculatorEvaluationResult,
  CalculatorSummary,
  ClinicalLearningGradeReport,
  ClinicalLearningSessionView,
  ClinicalTransport,
  CreateEmbedSessionInput,
  DifferentialEvaluationResult,
  DoseEvaluationInput,
  DoseEvaluationResult,
  EmbedSessionCredentials,
  EvaluateDifferentialsInput,
  GrowthEvaluationInput,
  GrowthEvaluationResult,
  GuidelineSearchInput,
  GuidelineSearchResult,
  NeonatalTpnEvaluationInput,
  NeonatalTpnEvaluationResult,
  StartClinicalLearningSessionInput,
  SubmitClinicalLearningAttemptInput,
} from './types.js';

/**
 * Configuration options for {@link HttpClinicalTransport} and {@link createCrosdatClient}.
 */
export interface HttpClinicalTransportOptions {
  /**
   * Base URL of the CROSDAT Clinical API gateway (for example
   * `https://api.crosdat.com/api/v1`). Trailing slashes are stripped automatically.
   */
  baseUrl: string;
  /**
   * Server-to-server licensee API key (`ck_live_*` or `ck_test_*`).
   * Never embed long-lived `ck_live_*` secret keys in public browser bundles;
   * mint short-lived DPoP-bound `sessionToken`s from your backend instead.
   */
  apiKey?: string;
  /**
   * Short-lived browser session bearer token minted via `createEmbedSession`.
   */
  sessionToken?: string;
  /**
   * Optional pre-generated WebCrypto DPoP keypair. When `enableDpop` is true
   * and no keypair is supplied, one is generated lazily on first request.
   */
  dpopKeyMaterial?: DpopKeyMaterial;
  /**
   * Enables automatic RFC 9449 `DPoP` proof header signing on every HTTP request.
   * Defaults to `true` when authenticating with a browser `sessionToken`.
   */
  enableDpop?: boolean;
  /**
   * Custom `fetch` implementation for testing, proxies, or edge runtimes.
   */
  fetchFn?: typeof fetch;
  /**
   * Maximum retry attempts on transient `429` / `502` / `503` / `504` responses.
   * Defaults to `2`.
   */
  maxRetries?: number;
  /**
   * Preferred BCP-47 content locale sent in `Accept-Language` (defaults to `'en'`).
   */
  locale?: string;
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/**
 * Default HTTPS + RFC 9449 DPoP implementation of {@link ClinicalTransport}.
 */
export class HttpClinicalTransport implements ClinicalTransport {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private sessionToken?: string;
  private dpopKeyPromise?: Promise<DpopKeyMaterial>;
  private readonly enableDpop: boolean;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;
  private readonly locale: string;
  private dpopNonce?: string;

  /**
   * Creates an HTTP transport targeting a CROSDAT Clinical Intelligence gateway.
   *
   * @param options - Gateway URL, credentials, DPoP settings, and retry policy.
   */
  constructor(options: HttpClinicalTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/g, '');
    this.apiKey = options.apiKey;
    this.sessionToken = options.sessionToken;
    this.enableDpop = options.enableDpop ?? Boolean(options.sessionToken);
    if (options.dpopKeyMaterial) {
      this.dpopKeyPromise = Promise.resolve(options.dpopKeyMaterial);
    }
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = options.maxRetries ?? 2;
    this.locale = options.locale ?? 'en';
  }

  /**
   * Updates the active short-lived session bearer token used for subsequent requests.
   *
   * @param token - Fresh JWT bearer token returned by session renewal.
   */
  public setSessionToken(token: string): void {
    this.sessionToken = token;
  }

  /**
   * Returns the active WebCrypto DPoP key material, generating it lazily if needed.
   *
   * @returns Non-extractable ECDSA P-256 keypair and RFC 7638 thumbprint.
   */
  public getOrCreateDpopKeyMaterial(): Promise<DpopKeyMaterial> {
    if (!this.dpopKeyPromise) {
      this.dpopKeyPromise = createDpopKeyPair();
    }
    return this.dpopKeyPromise;
  }

  private async request<TResponse>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<TResponse> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const bearer = this.sessionToken ?? this.apiKey;

    for (let attempt = 0; ; attempt += 1) {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Accept-Language': this.locale,
        'X-Request-ID': globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${attempt}`,
      };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      if (this.enableDpop) {
        const keyMaterial = await this.getOrCreateDpopKeyMaterial();
        if (bearer) {
          headers.Authorization = `DPoP ${bearer}`;
        }
        headers.DPoP = await signDpopProof({
          keyMaterial,
          httpMethod: method,
          httpUrl: url,
          accessToken: bearer,
          nonce: this.dpopNonce,
        });
      } else if (bearer) {
        headers.Authorization = `Bearer ${bearer}`;
      }

      const response = await this.fetchFn(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      const nextNonce = response.headers.get('DPoP-Nonce');
      if (nextNonce) {
        this.dpopNonce = nextNonce;
      }

      if (response.ok) {
        const raw = (await response.json()) as { data?: TResponse } | TResponse;
        if (raw && typeof raw === 'object' && 'data' in raw && raw.data !== undefined) {
          return raw.data;
        }
        return raw as TResponse;
      }

      if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
        const delayMs = 200 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      let errorCode = `HTTP_${response.status}`;
      let errorMessage = `CROSDAT API request failed with status ${response.status}`;
      let details: Record<string, unknown> | undefined;

      try {
        const errJson = (await response.json()) as {
          error?: { code?: string; message?: string; details?: Record<string, unknown> };
          code?: string;
          message?: string;
        };
        errorCode = errJson.error?.code ?? errJson.code ?? errorCode;
        errorMessage = errJson.error?.message ?? errJson.message ?? errorMessage;
        details = errJson.error?.details;
      } catch {
        // Non-JSON error body; retain status fallback message.
      }

      throw new CrosdatApiError({
        status: response.status,
        code: errorCode,
        message: errorMessage,
        requestId:
          response.headers.get('X-Request-ID') ?? response.headers.get('X-Trace-Id') ?? undefined,
        details,
      });
    }
  }

  /** @inheritdoc */
  public async createEmbedSession(input: CreateEmbedSessionInput): Promise<EmbedSessionCredentials> {
    let payload = input;
    if (this.enableDpop && !input.dpopJwkThumbprint) {
      const keyMaterial = await this.getOrCreateDpopKeyMaterial();
      payload = { ...input, dpopJwkThumbprint: keyMaterial.thumbprint };
    }
    return this.request<EmbedSessionCredentials>('POST', '/sessions', payload);
  }

  /** @inheritdoc */
  public evaluateDifferentials(
    input: EvaluateDifferentialsInput,
  ): Promise<DifferentialEvaluationResult> {
    return this.request<DifferentialEvaluationResult>('POST', '/clerking/evaluate', input);
  }

  /** @inheritdoc */
  public evaluateDose(input: DoseEvaluationInput): Promise<DoseEvaluationResult> {
    return this.request<DoseEvaluationResult>('POST', '/dosing/evaluate', input);
  }

  /** @inheritdoc */
  public evaluateNeonatalTpn(
    input: NeonatalTpnEvaluationInput,
  ): Promise<NeonatalTpnEvaluationResult> {
    return this.request<NeonatalTpnEvaluationResult>('POST', '/tpn/evaluate', input);
  }

  /** @inheritdoc */
  public evaluateGrowth(input: GrowthEvaluationInput): Promise<GrowthEvaluationResult> {
    return this.request<GrowthEvaluationResult>('POST', '/growth/evaluate', input);
  }

  /** @inheritdoc */
  public listCalculators(): Promise<CalculatorSummary[]> {
    return this.request<CalculatorSummary[]>('GET', '/calculators');
  }

  /** @inheritdoc */
  public evaluateCalculator(
    input: CalculatorEvaluationInput,
  ): Promise<CalculatorEvaluationResult> {
    return this.request<CalculatorEvaluationResult>(
      'POST',
      `/calculators/${encodeURIComponent(input.calculatorSlug)}/evaluate`,
      input,
    );
  }

  /** @inheritdoc */
  public searchGuidelines(input: GuidelineSearchInput): Promise<GuidelineSearchResult> {
    const params = new URLSearchParams({ query: input.query });
    if (input.ageDays !== undefined) params.set('ageDays', String(input.ageDays));
    if (input.limit !== undefined) params.set('limit', String(input.limit));
    return this.request<GuidelineSearchResult>('GET', `/guidelines/search?${params.toString()}`);
  }

  /** @inheritdoc */
  public startClinicalLearningSession(
    input: StartClinicalLearningSessionInput,
  ): Promise<ClinicalLearningSessionView> {
    return this.request<ClinicalLearningSessionView>('POST', '/clinical-learning/sessions', input);
  }

  /** @inheritdoc */
  public submitClinicalLearningAttempt(
    input: SubmitClinicalLearningAttemptInput,
  ): Promise<ClinicalLearningGradeReport> {
    return this.request<ClinicalLearningGradeReport>(
      'POST',
      `/clinical-learning/sessions/${encodeURIComponent(input.attemptId)}/submit`,
      input,
    );
  }
}

/**
 * High-level CROSDAT Clinical Intelligence SDK client wrapping any
 * {@link ClinicalTransport} (HTTP + DPoP by default, or a custom transport
 * for sandboxes, edge adapters, and automated tests).
 */
export class CrosdatClient implements ClinicalTransport {
  public readonly transport: ClinicalTransport;

  /**
   * Creates a `CrosdatClient` from either HTTP options or a custom transport.
   *
   * @param optionsOrTransport - HTTP gateway options or a custom `ClinicalTransport`.
   */
  constructor(optionsOrTransport: HttpClinicalTransportOptions | { transport: ClinicalTransport }) {
    this.transport =
      'transport' in optionsOrTransport
        ? optionsOrTransport.transport
        : new HttpClinicalTransport(optionsOrTransport);
  }

  /** @inheritdoc */
  public createEmbedSession(input: CreateEmbedSessionInput): Promise<EmbedSessionCredentials> {
    return this.transport.createEmbedSession(input);
  }

  /** @inheritdoc */
  public evaluateDifferentials(
    input: EvaluateDifferentialsInput,
  ): Promise<DifferentialEvaluationResult> {
    return this.transport.evaluateDifferentials(input);
  }

  /** @inheritdoc */
  public evaluateDose(input: DoseEvaluationInput): Promise<DoseEvaluationResult> {
    return this.transport.evaluateDose(input);
  }

  /** @inheritdoc */
  public evaluateNeonatalTpn(
    input: NeonatalTpnEvaluationInput,
  ): Promise<NeonatalTpnEvaluationResult> {
    return this.transport.evaluateNeonatalTpn(input);
  }

  /** @inheritdoc */
  public evaluateGrowth(input: GrowthEvaluationInput): Promise<GrowthEvaluationResult> {
    return this.transport.evaluateGrowth(input);
  }

  /** @inheritdoc */
  public listCalculators(): Promise<CalculatorSummary[]> {
    return this.transport.listCalculators();
  }

  /** @inheritdoc */
  public evaluateCalculator(
    input: CalculatorEvaluationInput,
  ): Promise<CalculatorEvaluationResult> {
    return this.transport.evaluateCalculator(input);
  }

  /** @inheritdoc */
  public searchGuidelines(input: GuidelineSearchInput): Promise<GuidelineSearchResult> {
    return this.transport.searchGuidelines(input);
  }

  /** @inheritdoc */
  public startClinicalLearningSession(
    input: StartClinicalLearningSessionInput,
  ): Promise<ClinicalLearningSessionView> {
    return this.transport.startClinicalLearningSession(input);
  }

  /** @inheritdoc */
  public submitClinicalLearningAttempt(
    input: SubmitClinicalLearningAttemptInput,
  ): Promise<ClinicalLearningGradeReport> {
    return this.transport.submitClinicalLearningAttempt(input);
  }
}

/**
 * Factory helper returning a configured {@link CrosdatClient}.
 *
 * @param options - HTTP gateway configuration or custom transport wrapper.
 * @returns Ready-to-use `CrosdatClient` instance.
 */
export function createCrosdatClient(
  options: HttpClinicalTransportOptions | { transport: ClinicalTransport },
): CrosdatClient {
  return new CrosdatClient(options);
}
