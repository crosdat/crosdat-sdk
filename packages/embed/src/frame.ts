import type {
  AppearanceConfig,
  ClinicalFeedbackEvent,
  ClinicalSafetyAlert,
  FacilityClinicalOverridesInput,
  PatientClinicalContext,
  SanitizedAnalyticsEvent,
} from '@crosdat/sdk';
import {
  CROSDAT_EMBED_CHANNEL,
  FrameToHostMessageKind,
  HostToFrameMessageKind,
  consumeBootstrapFragment,
  type EmbedBootstrapPayload,
  type FrameToHostMessage,
  type HostToFrameMessage,
} from './protocol.js';

/**
 * Maps `AppearanceConfig.variables` properties to CSS custom property names
 * injected on the runtime embed document root.
 */
const APPEARANCE_CSS_VAR_MAP: Record<string, string> = {
  colorPrimary: '--crosdat-color-primary',
  colorBackground: '--crosdat-color-background',
  colorSurface: '--crosdat-color-surface',
  colorText: '--crosdat-color-text',
  colorTextMuted: '--crosdat-color-text-muted',
  colorDanger: '--crosdat-color-danger',
  colorWarning: '--crosdat-color-warning',
  colorBorder: '--crosdat-color-border',
  fontFamily: '--crosdat-font-sans',
  fontFamilyMono: '--crosdat-font-mono',
  borderRadius: '--crosdat-radius',
};

/**
 * Applies `AppearanceConfig` CSS custom properties and data attributes onto an
 * HTML root element inside the runtime embed frame.
 *
 * @param root - Target element (defaults to `document.documentElement`).
 * @param appearance - Developer-supplied appearance tokens and theme preset.
 */
export function applyAppearanceToElement(
  root: HTMLElement,
  appearance: AppearanceConfig | undefined,
): void {
  if (!appearance) return;
  if (appearance.theme) {
    root.dataset.crosdatTheme = appearance.theme;
  }
  if (appearance.variables?.density) {
    root.dataset.crosdatDensity = appearance.variables.density;
  }
  if (appearance.variables) {
    for (const [key, cssVar] of Object.entries(APPEARANCE_CSS_VAR_MAP)) {
      const val = (appearance.variables as Record<string, string | undefined>)[key];
      if (typeof val === 'string' && val.trim().length > 0) {
        root.style.setProperty(cssVar, val.trim());
      }
    }
  }
}

/**
 * Callbacks registered by the runtime embed frame to react to live host updates.
 */
export interface EmbedFrameReceiverOptions {
  /** Window instance inside the iframe (defaults to `window`). */
  frameWindow?: Window;
  /** Invoked whenever `AppearanceConfig` changes at runtime. */
  onAppearanceChange?: (appearance: AppearanceConfig) => void;
  /** Invoked whenever the host updates `PatientClinicalContext`. */
  onContextChange?: (context: PatientClinicalContext) => void;
  /** Invoked whenever the host updates `FacilityClinicalOverridesInput`. */
  onFacilityOverridesChange?: (overrides: FacilityClinicalOverridesInput) => void;
}

/**
 * Active handle returned to the runtime embed frame for emitting verified events
 * back to the parent window.
 */
export interface EmbedFrameReceiverHandle {
  /** Initial bootstrap configuration consumed from `#crosdat=...`. */
  readonly bootstrap: EmbedBootstrapPayload | null;
  /** Notifies the parent window that the module has mounted and reports initial height. */
  notifyReady(heightPx?: number): void;
  /** Notifies the parent window of a content height change. */
  notifyResize(heightPx: number): void;
  /** Emits a structured clinical calculation/clerking payload to the parent host. */
  emitClinicalOutput(payload: unknown): void;
  /** Emits a bedside safety alert to the parent host. */
  emitSafetyAlert(alert: ClinicalSafetyAlert): void;
  /** Emits a PHI-sanitized analytics event to the parent host. */
  emitAnalyticsEvent(event: SanitizedAnalyticsEvent): void;
  /** Emits a PHI-free clinical feedback event to the parent host. */
  emitFeedback(event: ClinicalFeedbackEvent): void;
  /** Emits a structured runtime error to the parent host. */
  emitError(code: string, message: string): void;
  /** Tears down `message` and `ResizeObserver` listeners. */
  destroy(): void;
}

/**
 * Initializes the iframe-side receiver inside CROSDAT's `/embed/:module` runtime
 * host. Consumes and scrubs the `#crosdat=...` bootstrap fragment, applies
 * initial CSS tokens, validates `event.origin` + `channelNonce` on every inbound
 * message, and observes document height automatically.
 *
 * @param options - Lifecycle callbacks for host updates.
 * @returns Frame receiver handle for emitting verified messages to the parent.
 */
export function createEmbedFrameReceiver(
  options: EmbedFrameReceiverOptions = {},
): EmbedFrameReceiverHandle {
  const win = options.frameWindow ?? window;
  const bootstrap = consumeBootstrapFragment(win);

  if (bootstrap?.appearance && win.document?.documentElement) {
    applyAppearanceToElement(win.document.documentElement, bootstrap.appearance);
  }

  type OutboundFrameBody = FrameToHostMessage extends infer M
    ? M extends FrameToHostMessage
      ? Omit<M, 'channel' | 'channelNonce'>
      : never
    : never;

  const send = (msg: OutboundFrameBody): void => {
    if (!bootstrap || !win.parent || win.parent === win) return;
    const envelope = {
      ...msg,
      channel: CROSDAT_EMBED_CHANNEL,
      channelNonce: bootstrap.channelNonce,
    } as FrameToHostMessage;
    win.parent.postMessage(envelope, bootstrap.parentOrigin);
  };

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (!bootstrap) return;
    if (event.origin !== bootstrap.parentOrigin) return;
    if (!event.data || typeof event.data !== 'object') return;
    const data = event.data as Partial<HostToFrameMessage>;
    if (data.channel !== CROSDAT_EMBED_CHANNEL || data.channelNonce !== bootstrap.channelNonce) {
      return;
    }

    switch (data.kind) {
      case HostToFrameMessageKind.UPDATE_APPEARANCE:
        if (data.appearance) {
          if (win.document?.documentElement) {
            applyAppearanceToElement(win.document.documentElement, data.appearance);
          }
          options.onAppearanceChange?.(data.appearance);
        }
        break;
      case HostToFrameMessageKind.UPDATE_CONTEXT:
        if (data.patientContext) {
          options.onContextChange?.(data.patientContext);
        }
        break;
      case HostToFrameMessageKind.UPDATE_FACILITY_OVERRIDES:
        if (data.facilityOverrides) {
          options.onFacilityOverridesChange?.(data.facilityOverrides);
        }
        break;
      case HostToFrameMessageKind.PING:
        send({
          kind: FrameToHostMessageKind.RESIZE,
          heightPx: win.document?.documentElement?.scrollHeight ?? 480,
        });
        break;
      default:
        break;
    }
  };

  win.addEventListener('message', onMessage);

  let resizeObserver: ResizeObserver | undefined;
  if (typeof ResizeObserver !== 'undefined' && win.document?.body) {
    resizeObserver = new ResizeObserver(() => {
      const nextHeight = win.document.documentElement.scrollHeight;
      if (nextHeight > 0) {
        send({ kind: FrameToHostMessageKind.RESIZE, heightPx: nextHeight });
      }
    });
    resizeObserver.observe(win.document.body);
  }

  return {
    bootstrap,
    notifyReady(heightPx?: number): void {
      if (!bootstrap) return;
      send({
        kind: FrameToHostMessageKind.READY,
        module: bootstrap.module,
        heightPx: heightPx ?? win.document?.documentElement?.scrollHeight ?? 480,
      });
    },
    notifyResize(heightPx: number): void {
      send({ kind: FrameToHostMessageKind.RESIZE, heightPx });
    },
    emitClinicalOutput(payload: unknown): void {
      if (!bootstrap) return;
      send({
        kind: FrameToHostMessageKind.CLINICAL_OUTPUT,
        module: bootstrap.module,
        payload,
      });
    },
    emitSafetyAlert(alert: ClinicalSafetyAlert): void {
      send({ kind: FrameToHostMessageKind.SAFETY_ALERT, alert });
    },
    emitAnalyticsEvent(event: SanitizedAnalyticsEvent): void {
      send({ kind: FrameToHostMessageKind.ANALYTICS_EVENT, event });
    },
    emitFeedback(event: ClinicalFeedbackEvent): void {
      send({ kind: FrameToHostMessageKind.FEEDBACK, event });
    },
    emitError(code: string, message: string): void {
      send({ kind: FrameToHostMessageKind.ERROR, code, message });
    },
    destroy(): void {
      win.removeEventListener('message', onMessage);
      resizeObserver?.disconnect();
    },
  };
}
