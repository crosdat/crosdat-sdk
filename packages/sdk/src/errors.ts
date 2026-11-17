/**
 * Structured HTTP error thrown by `HttpClinicalTransport` when the CROSDAT API
 * gateway returns a non-2xx status code.
 */
export class CrosdatApiError extends Error {
  /** HTTP status code returned by the gateway (for example `401`, `429`). */
  public readonly status: number;
  /** Stable machine-readable CROSDAT error code when present in response JSON. */
  public readonly code: string;
  /** Optional server correlation identifier (`X-Request-ID` / `X-Trace-Id`). */
  public readonly requestId?: string;
  /** Structured field or validation details returned by the API. */
  public readonly details?: Record<string, unknown>;

  /**
   * Constructs a typed API error instance.
   *
   * @param args - Status, error code, message, and optional correlation metadata.
   */
  constructor(args: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = 'CrosdatApiError';
    this.status = args.status;
    this.code = args.code;
    this.requestId = args.requestId;
    this.details = args.details;
  }
}
