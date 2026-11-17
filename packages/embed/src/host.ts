import type {
  AppearanceConfig,
  ClinicalSafetyAlert,
  EmbedModuleKind,
  FacilityClinicalOverridesInput,
  PatientClinicalContext,
  SanitizedAnalyticsEvent,
} from '@crosdat/sdk';
import {
  CROSDAT_EMBED_CHANNEL,
  FrameToHostMessageKind,
  HostToFrameMessageKind,
  encodeBootstrapFragment,
  type FrameToHostMessage,
  type HostToFrameMessage,
} from './protocol.js';

/**
 * Options passed to {@link mountClinicalEmbed} when mounting a CROSDAT runtime
 * clinical UI inside any DOM container.
 */
export interface MountClinicalEmbedOptions {
  /** Base runtime embed host URL (for example `https://embed.crosdat.com`). */
  embedBaseUrl: string;
  /** Module to mount (`growth-chart`, `clerking`, `dose-prescriber`, etc.). */
  module: EmbedModuleKind;
  /** Short-lived browser session token minted via `CrosdatClient.createEmbedSession`. */
  sessionToken: string;
  /** Optional calculator or clinical-learning scenario slug. */
  targetSlug?: string;
  /** Optional visual customisation tokens, theme preset, and white-label flag. */
  appearance?: AppearanceConfig;
  /** Optional de-identified patient biological context. */
  patientContext?: PatientClinicalContext;
  /** Optional hospital-local formulary, substitution, and lab overrides. */
  facilityOverrides?: FacilityClinicalOverridesInput;
  /** Accessible `title` attribute applied to the `<iframe>` element. */
  iframeTitle?: string;
  /** Minimum iframe height in pixels before first resize event (default `420`). */
  minHeightPx?: number;
  /** Fired once the runtime module inside the frame completes initialization. */
  onReady?: (info: { module: EmbedModuleKind; heightPx: number }) => void;
  /** Fired whenever the embedded module produces a clinical output or save action. */
  onClinicalOutput?: (payload: unknown) => void;
  /** Fired whenever a clinical safety or danger-sign alert triggers. */
  onSafetyAlert?: (alert: ClinicalSafetyAlert) => void;
  /** Fired for PHI-sanitized UI analytics events when telemetry is enabled. */
  onAnalyticsEvent?: (event: SanitizedAnalyticsEvent) => void;
  /** Fired when the embedded module reports an error. */
  onError?: (error: { code: string; message: string }) => void;
}

/**
 * Imperative controller returned by {@link mountClinicalEmbed}.
 */
export interface MountedClinicalEmbed {
  /** Underlying `HTMLIFrameElement` mounted inside the target container. */
  readonly iframe: HTMLIFrameElement;
  /** Cryptographic nonce uniquely binding this parent<->iframe channel. */
  readonly channelNonce: string;
  /** Pushes updated appearance tokens into the live frame without reloading. */
  updateAppearance(appearance: AppearanceConfig): void;
  /** Pushes updated de-identified patient context into the live frame. */
  updatePatientContext(patientContext: PatientClinicalContext): void;
  /** Pushes updated hospital-local clinical overrides into the live frame. */
  updateFacilityOverrides(facilityOverrides: FacilityClinicalOverridesInput): void;
  /** Removes event listeners and detaches the iframe from the DOM. */
  unmount(): void;
}

function generateNonce(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Mounts a sandboxed, auto-resizing CROSDAT runtime clinical UI iframe inside
 * `container`, authenticating via zero-cookie `#fragment` bootstrap and
 * enforcing strict `origin` + `channelNonce` verification on `postMessage`.
 *
 * @param container - Host DOM element into which the iframe is appended.
 * @param options - Module, credentials, initial context, appearance, and callbacks.
 * @returns Controller handle for live updates and deterministic cleanup.
 */
export function mountClinicalEmbed(
  container: HTMLElement,
  options: MountClinicalEmbedOptions,
): MountedClinicalEmbed {
  const parsedEmbedUrl = new URL(
    `${options.embedBaseUrl.replace(/\/+$/g, '')}/${encodeURIComponent(options.module)}`,
    globalThis.location?.origin ?? 'https://localhost',
  );
  const targetOrigin = parsedEmbedUrl.origin;
  const parentOrigin = globalThis.location?.origin ?? 'https://localhost';
  const channelNonce = generateNonce();

  const fragment = encodeBootstrapFragment({
    module: options.module,
    sessionToken: options.sessionToken,
    parentOrigin,
    channelNonce,
    appearance: options.appearance,
    patientContext: options.patientContext,
    facilityOverrides: options.facilityOverrides,
    targetSlug: options.targetSlug,
  });

  const iframe = container.ownerDocument.createElement('iframe');
  iframe.src = `${parsedEmbedUrl.toString()}${fragment}`;
  iframe.title = options.iframeTitle ?? `CROSDAT ${options.module}`;
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.style.width = '100%';
  iframe.style.minHeight = `${options.minHeightPx ?? 420}px`;
  iframe.style.border = '0';
  iframe.style.display = 'block';

  type OutboundHostBody = HostToFrameMessage extends infer M
    ? M extends HostToFrameMessage
      ? Omit<M, 'channel' | 'channelNonce'>
      : never
    : never;

  const postToFrame = (msg: OutboundHostBody): void => {
    if (!iframe.contentWindow) return;
    const envelope = {
      ...msg,
      channel: CROSDAT_EMBED_CHANNEL,
      channelNonce,
    } as HostToFrameMessage;
    iframe.contentWindow.postMessage(envelope, targetOrigin);
  };

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (event.origin !== targetOrigin) return;
    if (iframe.contentWindow && event.source && event.source !== iframe.contentWindow) return;
    if (!event.data || typeof event.data !== 'object') return;
    const data = event.data as Partial<FrameToHostMessage>;
    if (data.channel !== CROSDAT_EMBED_CHANNEL || data.channelNonce !== channelNonce) {
      return;
    }

    switch (data.kind) {
      case FrameToHostMessageKind.READY:
        if (typeof data.heightPx === 'number' && data.heightPx > 0) {
          iframe.style.height = `${Math.max(data.heightPx, options.minHeightPx ?? 420)}px`;
        }
        options.onReady?.({
          module: data.module ?? options.module,
          heightPx: data.heightPx ?? (options.minHeightPx ?? 420),
        });
        break;
      case FrameToHostMessageKind.RESIZE:
        if (typeof data.heightPx === 'number' && data.heightPx > 0) {
          iframe.style.height = `${Math.max(data.heightPx, options.minHeightPx ?? 420)}px`;
        }
        break;
      case FrameToHostMessageKind.CLINICAL_OUTPUT:
        options.onClinicalOutput?.(data.payload);
        break;
      case FrameToHostMessageKind.SAFETY_ALERT:
        if (data.alert) options.onSafetyAlert?.(data.alert);
        break;
      case FrameToHostMessageKind.ANALYTICS_EVENT:
        if (data.event) options.onAnalyticsEvent?.(data.event);
        break;
      case FrameToHostMessageKind.ERROR:
        options.onError?.({
          code: data.code ?? 'EMBED_RUNTIME_ERROR',
          message: data.message ?? 'CROSDAT embed reported an error',
        });
        break;
      default:
        break;
    }
  };

  const hostWindow = container.ownerDocument.defaultView ?? window;
  hostWindow.addEventListener('message', onMessage);
  container.appendChild(iframe);

  return {
    iframe,
    channelNonce,
    updateAppearance(appearance: AppearanceConfig): void {
      postToFrame({ kind: HostToFrameMessageKind.UPDATE_APPEARANCE, appearance });
    },
    updatePatientContext(patientContext: PatientClinicalContext): void {
      postToFrame({ kind: HostToFrameMessageKind.UPDATE_CONTEXT, patientContext });
    },
    updateFacilityOverrides(facilityOverrides: FacilityClinicalOverridesInput): void {
      postToFrame({ kind: HostToFrameMessageKind.UPDATE_FACILITY_OVERRIDES, facilityOverrides });
    },
    unmount(): void {
      hostWindow.removeEventListener('message', onMessage);
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    },
  };
}

/**
 * Framework-agnostic HTML Custom Element (`<crosdat-clinical-embed>`) for
 * mounting CROSDAT clinical modules in plain HTML, Vue, Angular, Svelte, or PHP
 * hospital portals without React.
 */
export class CrosdatClinicalEmbedElement extends HTMLElement {
  public static get observedAttributes(): string[] {
    return ['embed-base-url', 'module', 'session-token', 'target-slug', 'theme', 'hide-branding'];
  }

  private mounted: MountedClinicalEmbed | null = null;

  /** Connects the custom element and mounts the iframe when required attributes exist. */
  public connectedCallback(): void {
    this.remount();
  }

  /** Tears down the mounted iframe and listeners on disconnect. */
  public disconnectedCallback(): void {
    this.mounted?.unmount();
    this.mounted = null;
  }

  /** Reacts to observed attribute changes. */
  public attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if ((name === 'theme' || name === 'hide-branding') && this.mounted) {
      this.mounted.updateAppearance(this.readAppearanceAttributes());
      return;
    }
    if (this.isConnected) {
      this.remount();
    }
  }

  private readAppearanceAttributes(): AppearanceConfig {
    const themeAttr = this.getAttribute('theme') as AppearanceConfig['theme'] | null;
    const hideBrandingAttr = this.getAttribute('hide-branding');
    return {
      ...(themeAttr ? { theme: themeAttr } : {}),
      ...(hideBrandingAttr === 'true' || hideBrandingAttr === '' ? { hideBranding: true } : {}),
    };
  }

  private remount(): void {
    this.mounted?.unmount();
    this.mounted = null;
    const embedBaseUrl = this.getAttribute('embed-base-url');
    const module = this.getAttribute('module') as EmbedModuleKind | null;
    const sessionToken = this.getAttribute('session-token');
    if (!embedBaseUrl || !module || !sessionToken) {
      return;
    }
    this.mounted = mountClinicalEmbed(this, {
      embedBaseUrl,
      module,
      sessionToken,
      targetSlug: this.getAttribute('target-slug') ?? undefined,
      appearance: this.readAppearanceAttributes(),
      onReady: (detail) => this.dispatchEvent(new CustomEvent('crosdat:ready', { detail })),
      onClinicalOutput: (detail) =>
        this.dispatchEvent(new CustomEvent('crosdat:output', { detail })),
      onSafetyAlert: (detail) =>
        this.dispatchEvent(new CustomEvent('crosdat:alert', { detail })),
      onAnalyticsEvent: (detail) =>
        this.dispatchEvent(new CustomEvent('crosdat:analytics', { detail })),
      onError: (detail) => this.dispatchEvent(new CustomEvent('crosdat:error', { detail })),
    });
  }
}

/**
 * Registers `<crosdat-clinical-embed>` in `window.customElements` idempotently.
 *
 * @param tagName - Custom element tag name (defaults to `'crosdat-clinical-embed'`).
 */
export function registerClinicalEmbedElement(tagName = 'crosdat-clinical-embed'): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tagName)) {
    customElements.define(tagName, CrosdatClinicalEmbedElement);
  }
}
