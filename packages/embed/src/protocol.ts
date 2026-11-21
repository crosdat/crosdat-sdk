import type {
  AppearanceConfig,
  ClinicalAiHostOptions,
  ClinicalFeedbackEvent,
  ClinicalSafetyAlert,
  EmbedModuleKind,
  FacilityClinicalOverridesInput,
  PatientClinicalContext,
  SanitizedAnalyticsEvent,
} from '@crosdat/sdk';

/**
 * Protocol discriminator string stamped on every CROSDAT `postMessage` envelope.
 */
export const CROSDAT_EMBED_CHANNEL = 'crosdat.clinical.embed.v1' as const;

/**
 * Message types sent from the host page (`@crosdat/embed`) into the runtime
 * CROSDAT iframe.
 */
export const HostToFrameMessageKind = {
  UPDATE_APPEARANCE: 'UPDATE_APPEARANCE',
  UPDATE_CONTEXT: 'UPDATE_CONTEXT',
  UPDATE_FACILITY_OVERRIDES: 'UPDATE_FACILITY_OVERRIDES',
  PING: 'PING',
} as const;
export type HostToFrameMessageKind =
  (typeof HostToFrameMessageKind)[keyof typeof HostToFrameMessageKind];

/**
 * Message types emitted from the runtime CROSDAT iframe back to the host page.
 */
export const FrameToHostMessageKind = {
  READY: 'READY',
  RESIZE: 'RESIZE',
  CLINICAL_OUTPUT: 'CLINICAL_OUTPUT',
  SAFETY_ALERT: 'SAFETY_ALERT',
  ANALYTICS_EVENT: 'ANALYTICS_EVENT',
  FEEDBACK: 'FEEDBACK',
  ERROR: 'ERROR',
} as const;
export type FrameToHostMessageKind =
  (typeof FrameToHostMessageKind)[keyof typeof FrameToHostMessageKind];

/**
 * Initial bootstrap configuration serialized into the iframe URL `#fragment`
 * so zero third-party cookies are required and zero credentials appear in
 * server access logs or `Referer` headers.
 */
export interface EmbedBootstrapPayload {
  /** Target clinical UI module (`growth-chart`, `clerking`, `dose-prescriber`, etc.). */
  module: EmbedModuleKind;
  /** Short-lived session token minted for this browser session. */
  sessionToken: string;
  /** Exact parent window origin authorized to communicate over `postMessage`. */
  parentOrigin: string;
  /** Random cryptographic channel nonce required on every `postMessage` packet. */
  channelNonce: string;
  /** Initial appearance configuration. */
  appearance?: AppearanceConfig;
  /** Initial de-identified patient biological context. */
  patientContext?: PatientClinicalContext;
  /** Initial hospital-local clinical overrides. */
  facilityOverrides?: FacilityClinicalOverridesInput;
  /** Optional calculator or scenario slug when pinning a specific item. */
  targetSlug?: string;
  /** Optional API gateway base URL override (`https://api.example.com/api/v1`). */
  apiBaseUrl?: string;
  /** Optional host AI integration options controlling evidence Q&A and voice controls. */
  ai?: ClinicalAiHostOptions;
}

/**
 * Verified message envelope sent from the parent window into the embed frame.
 */
export type HostToFrameMessage =
  | {
      channel: typeof CROSDAT_EMBED_CHANNEL;
      channelNonce: string;
      kind: typeof HostToFrameMessageKind.UPDATE_APPEARANCE;
      appearance: AppearanceConfig;
    }
  | {
      channel: typeof CROSDAT_EMBED_CHANNEL;
      channelNonce: string;
      kind: typeof HostToFrameMessageKind.UPDATE_CONTEXT;
      patientContext: PatientClinicalContext;
    }
  | {
      channel: typeof CROSDAT_EMBED_CHANNEL;
      channelNonce: string;
      kind: typeof HostToFrameMessageKind.UPDATE_FACILITY_OVERRIDES;
      facilityOverrides: FacilityClinicalOverridesInput;
    }
  | {
      channel: typeof CROSDAT_EMBED_CHANNEL;
      channelNonce: string;
      kind: typeof HostToFrameMessageKind.PING;
    };

/**
 * Verified message envelope emitted from the embed frame to the parent window.
 */
export type FrameToHostMessage =
  | {
      channel: typeof CROSDAT_EMBED_CHANNEL;
      channelNonce: string;
      kind: typeof FrameToHostMessageKind.READY;
      module: EmbedModuleKind;
      heightPx: number;
    }
  | {
      channel: typeof CROSDAT_EMBED_CHANNEL;
      channelNonce: string;
      kind: typeof FrameToHostMessageKind.RESIZE;
      heightPx: number;
    }
  | {
      channel: typeof CROSDAT_EMBED_CHANNEL;
      channelNonce: string;
      kind: typeof FrameToHostMessageKind.CLINICAL_OUTPUT;
      module: EmbedModuleKind;
      payload: unknown;
    }
  | {
      channel: typeof CROSDAT_EMBED_CHANNEL;
      channelNonce: string;
      kind: typeof FrameToHostMessageKind.SAFETY_ALERT;
      alert: ClinicalSafetyAlert;
    }
  | {
      channel: typeof CROSDAT_EMBED_CHANNEL;
      channelNonce: string;
      kind: typeof FrameToHostMessageKind.ANALYTICS_EVENT;
      event: SanitizedAnalyticsEvent;
    }
  | {
      channel: typeof CROSDAT_EMBED_CHANNEL;
      channelNonce: string;
      kind: typeof FrameToHostMessageKind.FEEDBACK;
      event: ClinicalFeedbackEvent;
    }
  | {
      channel: typeof CROSDAT_EMBED_CHANNEL;
      channelNonce: string;
      kind: typeof FrameToHostMessageKind.ERROR;
      code: string;
      message: string;
    };

/**
 * Encodes an {@link EmbedBootstrapPayload} into a URL `#fragment` string (`#crosdat=...`).
 *
 * @param payload - Bootstrap configuration to pass to the runtime iframe.
 * @returns URL hash fragment starting with `#crosdat=`.
 */
export function encodeBootstrapFragment(payload: EmbedBootstrapPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `#crosdat=${encoded}`;
}

/**
 * In-memory cache of the consumed bootstrap payload keyed by the runtime `Window`
 * instance and path+search so React StrictMode double-invocations on the same
 * loaded iframe document receive the decoded payload even after `#crosdat=`
 * has been scrubbed from `window.location.hash`.
 */
const consumedBootstrapByWindow = new WeakMap<
  Window,
  { pathKey: string; payload: EmbedBootstrapPayload }
>();

/**
 * Reads and decodes `#crosdat=...` from a window location hash and immediately
 * scrubs the hash from `window.history` so tokens do not linger in the address bar.
 * Subsequent calls on the same `Window` and path (for example under React
 * `StrictMode`) return the already-decoded in-memory payload without persisting
 * credentials to Web Storage.
 *
 * @param win - Target `Window` inside the runtime embed iframe.
 * @returns Decoded {@link EmbedBootstrapPayload}, or `null` if no bootstrap hash is present.
 */
export function consumeBootstrapFragment(win: Window = window): EmbedBootstrapPayload | null {
  const pathKey = `${win.location?.pathname ?? ''}${win.location?.search ?? ''}`;
  const rawHash = win.location.hash;
  if (!rawHash || !rawHash.startsWith('#crosdat=')) {
    const cached = consumedBootstrapByWindow.get(win);
    return cached && cached.pathKey === pathKey ? cached.payload : null;
  }
  const token = rawHash.slice('#crosdat='.length);
  const normalized = token.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as EmbedBootstrapPayload;
  consumedBootstrapByWindow.set(win, { pathKey, payload: parsed });

  if (win.history?.replaceState) {
    win.history.replaceState(null, '', pathKey);
  }
  return parsed;
}
