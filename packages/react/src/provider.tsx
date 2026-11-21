import {
  CrosdatClient,
  createCrosdatClient,
  type AppearanceConfig,
  type FacilityClinicalOverridesInput,
  type SanitizedAnalyticsEvent,
} from '@crosdat/sdk';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Shared context value exposed to all `<*Embed />` components and headless
 * clinical hooks beneath {@link CrosdatClinicalProvider}.
 */
export interface CrosdatClinicalContextValue {
  /** Configured SDK client instance (HTTP + DPoP or custom transport). */
  client: CrosdatClient;
  /** Runtime embed host base URL (for example `https://embed.crosdat.com`). */
  embedBaseUrl: string;
  /** Optional API gateway base URL passed to mounted embed frames. */
  apiBaseUrl?: string;
  /** Active short-lived browser session token. */
  sessionToken: string;
  /** Default appearance configuration inherited by child embeds. */
  appearance?: AppearanceConfig;
  /** Default facility clinical overrides inherited by child embeds and hooks. */
  facilityOverrides?: FacilityClinicalOverridesInput;
  /** Optional host callback receiving PHI-sanitized analytics events. */
  onAnalyticsEvent?: (event: SanitizedAnalyticsEvent) => void;
}

const CrosdatClinicalContext = createContext<CrosdatClinicalContextValue | null>(null);

/**
 * Props accepted by {@link CrosdatClinicalProvider}.
 */
export interface CrosdatClinicalProviderProps {
  /** Optional pre-constructed `CrosdatClient`. Created from `apiBaseUrl` if omitted. */
  client?: CrosdatClient;
  /** Base API URL used when constructing a default `CrosdatClient`. */
  apiBaseUrl?: string;
  /** Runtime embed host base URL where `/embed/:module` bundles are served. */
  embedBaseUrl: string;
  /** Short-lived browser session bearer token. */
  sessionToken: string;
  /** Global 4-tier appearance tokens, presets, and `hideBranding` setting. */
  appearance?: AppearanceConfig;
  /** Optional hospital-local formulary, substitution, and lab overrides. */
  facilityOverrides?: FacilityClinicalOverridesInput;
  /** Optional callback receiving PHI-sanitized UI analytics events. */
  onAnalyticsEvent?: (event: SanitizedAnalyticsEvent) => void;
  /** React subtree consuming CROSDAT embeds or headless hooks. */
  children: ReactNode;
}

/**
 * Root React context provider managing the `CrosdatClient`, DPoP session
 * credentials, appearance theme tokens, and hospital-local overrides.
 *
 * @param props - Client/gateway configuration, appearance tokens, and children.
 * @returns Context provider element.
 */
export function CrosdatClinicalProvider(props: CrosdatClinicalProviderProps) {
  const resolvedClient = useMemo(() => {
    if (props.client) return props.client;
    return createCrosdatClient({
      baseUrl: props.apiBaseUrl ?? `${props.embedBaseUrl.replace(/\/embed\/?$/, '')}/api/v1`,
      sessionToken: props.sessionToken,
      enableDpop: true,
    });
  }, [props.client, props.apiBaseUrl, props.embedBaseUrl, props.sessionToken]);

  const value = useMemo<CrosdatClinicalContextValue>(
    () => ({
      client: resolvedClient,
      embedBaseUrl: props.embedBaseUrl,
      apiBaseUrl: props.apiBaseUrl,
      sessionToken: props.sessionToken,
      appearance: props.appearance,
      facilityOverrides: props.facilityOverrides,
      onAnalyticsEvent: props.onAnalyticsEvent,
    }),
    [
      resolvedClient,
      props.embedBaseUrl,
      props.apiBaseUrl,
      props.sessionToken,
      props.appearance,
      props.facilityOverrides,
      props.onAnalyticsEvent,
    ],
  );

  return (
    <CrosdatClinicalContext.Provider value={value}>
      {props.children}
    </CrosdatClinicalContext.Provider>
  );
}

/**
 * Returns the active {@link CrosdatClinicalContextValue} from the nearest
 * {@link CrosdatClinicalProvider}.
 *
 * @returns Active CROSDAT client, embed base URL, session token, and defaults.
 */
export function useCrosdatClinical(): CrosdatClinicalContextValue {
  const ctx = useContext(CrosdatClinicalContext);
  if (!ctx) {
    throw new Error('useCrosdatClinical must be called inside <CrosdatClinicalProvider>');
  }
  return ctx;
}
