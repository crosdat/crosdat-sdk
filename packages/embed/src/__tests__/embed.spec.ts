import { EmbedModuleKind } from '@crosdat/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  applyAppearanceToElement,
  createEmbedFrameReceiver,
} from '../frame.js';
import {
  CROSDAT_EMBED_CHANNEL,
  FrameToHostMessageKind,
  consumeBootstrapFragment,
  encodeBootstrapFragment,
  mountClinicalEmbed,
  registerClinicalEmbedElement,
} from '../index.js';

describe('@crosdat/embed host, protocol, and frame bridge', () => {
  it('encodes #crosdat=... bootstrap payloads and scrubs window.location.hash upon consumption', () => {
    const fragment = encodeBootstrapFragment({
      module: EmbedModuleKind.DOSE_PRESCRIBER,
      sessionToken: 'tok_ephemeral_1',
      parentOrigin: 'https://ehr.example.org',
      channelNonce: 'nonce-xyz-1',
      appearance: {
        theme: 'neutral-clinical',
        variables: { colorPrimary: '#0f766e', density: 'compact' },
      },
      patientContext: {
        ageDays: 45,
        sex: 'MALE',
        weightKg: 4.5,
        muacCm: 11.4,
        motherHeightCm: 165,
        fatherHeightCm: 179,
        growthSeries: [
          {
            ageDays: 30,
            weightKg: 4.1,
            heightCm: 53.5,
            recordedAt: '2026-10-15T08:00:00Z',
            label: '1-month check',
          },
          {
            ageDays: 45,
            weightKg: 4.5,
            heightCm: 55.2,
            muacCm: 11.4,
            recordedAt: '2026-10-30T09:15:00Z',
          },
        ],
      },
      growthOptions: {
        initialMeasurement: 'WEIGHT_FOR_AGE',
        curveScale: 'centile',
        unitSystem: 'metric',
        caregiverMode: false,
        ageMode: 'both',
        allowExports: true,
      },
    });

    expect(fragment.startsWith('#crosdat=')).toBe(true);
    window.history.replaceState(null, '', `/embed/dose-prescriber${fragment}`);
    expect(window.location.hash).toBe(fragment);

    const consumed = consumeBootstrapFragment(window);
    expect(consumed?.module).toBe('dose-prescriber');
    expect(consumed?.sessionToken).toBe('tok_ephemeral_1');
    expect(consumed?.channelNonce).toBe('nonce-xyz-1');
    expect(consumed?.patientContext?.growthSeries).toHaveLength(2);
    expect(consumed?.growthOptions?.allowExports).toBe(true);
    expect(window.location.hash).toBe('');

    // Re-reading on the same path (e.g. React StrictMode double-mount) still returns the cached bootstrap
    expect(consumeBootstrapFragment(window)?.sessionToken).toBe('tok_ephemeral_1');

    // Navigating to another path clears lookup hit and requires a fresh #crosdat= hash
    window.history.replaceState(null, '', '/embed/growth-chart');
    expect(consumeBootstrapFragment(window)).toBeNull();
  });

  it('mounts sandboxed iframes, rejects spoofed origins/nonces, and delivers verified events', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const onReady = vi.fn();
    const onClinicalOutput = vi.fn();
    const onSafetyAlert = vi.fn();
    const onFeedback = vi.fn();

    const mounted = mountClinicalEmbed(container, {
      embedBaseUrl: 'https://embed.crosdat.com',
      module: EmbedModuleKind.GROWTH_CHART,
      sessionToken: 'tok_growth_1',
      onReady,
      onClinicalOutput,
      onSafetyAlert,
      onFeedback,
    });

    expect(mounted.iframe.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-forms',
    );
    expect(mounted.iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(mounted.iframe.src).toContain('https://embed.crosdat.com/growth-chart#crosdat=');

    const postSpy = vi.spyOn(mounted.iframe.contentWindow!, 'postMessage');
    mounted.updateAppearance({ theme: 'crosdat-dark' });
    expect(postSpy).not.toHaveBeenCalled();

    // Spoofed origin must be ignored
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://attacker.evil.example',
        data: {
          channel: CROSDAT_EMBED_CHANNEL,
          channelNonce: mounted.channelNonce,
          kind: FrameToHostMessageKind.READY,
          module: EmbedModuleKind.GROWTH_CHART,
          heightPx: 640,
        },
      }),
    );
    expect(onReady).not.toHaveBeenCalled();

    // Spoofed nonce from right origin must also be ignored
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://embed.crosdat.com',
        data: {
          channel: CROSDAT_EMBED_CHANNEL,
          channelNonce: 'wrong-nonce',
          kind: FrameToHostMessageKind.READY,
          module: EmbedModuleKind.GROWTH_CHART,
          heightPx: 640,
        },
      }),
    );
    expect(onReady).not.toHaveBeenCalled();

    // Authentic origin + matching channelNonce succeeds
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://embed.crosdat.com',
        data: {
          channel: CROSDAT_EMBED_CHANNEL,
          channelNonce: mounted.channelNonce,
          kind: FrameToHostMessageKind.READY,
          module: EmbedModuleKind.GROWTH_CHART,
          heightPx: 640,
        },
      }),
    );
    expect(onReady).toHaveBeenCalledWith({ module: 'growth-chart', heightPx: 640 });
    expect(mounted.iframe.style.height).toBe('640px');
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: CROSDAT_EMBED_CHANNEL,
        channelNonce: mounted.channelNonce,
        kind: 'UPDATE_APPEARANCE',
      }),
      'https://embed.crosdat.com',
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://embed.crosdat.com',
        data: {
          channel: CROSDAT_EMBED_CHANNEL,
          channelNonce: mounted.channelNonce,
          kind: FrameToHostMessageKind.CLINICAL_OUTPUT,
          module: EmbedModuleKind.GROWTH_CHART,
          payload: { zScore: -2.4 },
        },
      }),
    );
    expect(onClinicalOutput).toHaveBeenCalledWith({ zScore: -2.4 });

    const feedbackEvent = {
      module: EmbedModuleKind.GROWTH_CHART,
      category: 'USABILITY',
      reasonCode: 'CHART_LEGEND',
      surfaceKey: 'growth-chart',
      targetKey: 'WEIGHT_FOR_AGE',
      ticketRef: 'FBK-101',
    };
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://embed.crosdat.com',
        data: {
          channel: CROSDAT_EMBED_CHANNEL,
          channelNonce: mounted.channelNonce,
          kind: FrameToHostMessageKind.FEEDBACK,
          event: feedbackEvent,
        },
      }),
    );
    expect(onFeedback).toHaveBeenCalledWith(feedbackEvent);

    mounted.updateGrowthOptions({ curveScale: 'sd', allowExports: true });
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: CROSDAT_EMBED_CHANNEL,
        channelNonce: mounted.channelNonce,
        kind: 'UPDATE_GROWTH_OPTIONS',
        growthOptions: { curveScale: 'sd', allowExports: true },
      }),
      'https://embed.crosdat.com',
    );

    mounted.unmount();
    expect(container.querySelector('iframe')).toBeNull();
    container.remove();
  });

  it('applies CSS tokens on the frame root and handles host updates inside createEmbedFrameReceiver', () => {
    const root = document.createElement('div');
    applyAppearanceToElement(root, {
      theme: 'crosdat-dark',
      variables: {
        colorPrimary: '#2563eb',
        borderRadius: '8px',
        density: 'touch',
      },
    });
    expect(root.dataset.crosdatTheme).toBe('crosdat-dark');
    expect(root.dataset.crosdatDensity).toBe('touch');
    expect(root.style.getPropertyValue('--crosdat-color-primary')).toBe('#2563eb');
    expect(root.style.getPropertyValue('--crosdat-radius')).toBe('8px');

    const fragment = encodeBootstrapFragment({
      module: EmbedModuleKind.NEONATAL_TPN,
      sessionToken: 'tok_tpn',
      parentOrigin: 'https://portal.example.org',
      channelNonce: 'frame-nonce-42',
    });
    window.history.replaceState(null, '', `/embed/neonatal-tpn${fragment}`);

    const onContextChange = vi.fn();
    const onGrowthOptionsChange = vi.fn();
    const receiver = createEmbedFrameReceiver({
      frameWindow: window,
      onContextChange,
      onGrowthOptionsChange,
    });
    expect(receiver.bootstrap?.module).toBe('neonatal-tpn');

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://portal.example.org',
        data: {
          channel: CROSDAT_EMBED_CHANNEL,
          channelNonce: 'frame-nonce-42',
          kind: 'UPDATE_CONTEXT',
          patientContext: { ageDays: 3, sex: 'FEMALE', weightKg: 1.45 },
        },
      }),
    );
    expect(onContextChange).toHaveBeenCalledWith({
      ageDays: 3,
      sex: 'FEMALE',
      weightKg: 1.45,
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://portal.example.org',
        data: {
          channel: CROSDAT_EMBED_CHANNEL,
          channelNonce: 'frame-nonce-42',
          kind: 'UPDATE_GROWTH_OPTIONS',
          growthOptions: { unitSystem: 'imperial', caregiverMode: true },
        },
      }),
    );
    expect(onGrowthOptionsChange).toHaveBeenCalledWith({
      unitSystem: 'imperial',
      caregiverMode: true,
    });
    receiver.destroy();
  });

  it('registers <crosdat-clinical-embed> idempotently and mounts when required attributes exist', () => {
    registerClinicalEmbedElement();
    registerClinicalEmbedElement();
    const el = document.createElement('crosdat-clinical-embed');
    el.setAttribute('embed-base-url', 'https://embed.crosdat.com');
    el.setAttribute('module', 'clinical-calculators');
    el.setAttribute('session-token', 'tok_wc_1');
    el.setAttribute('target-slug', 'apgar');
    el.setAttribute('hide-feedback', 'true');
    el.setAttribute('growth-options', JSON.stringify({ allowExports: true, curveScale: 'centile' }));
    document.body.appendChild(el);

    const iframe = el.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toContain('https://embed.crosdat.com/clinical-calculators#crosdat=');

    const feedbackListener = vi.fn();
    el.addEventListener('crosdat:feedback', (e) => {
      feedbackListener((e as CustomEvent).detail);
    });

    const hashPart = iframe!.src.slice(iframe!.src.indexOf('#crosdat='));
    window.history.replaceState(null, '', `/embed/clinical-calculators${hashPart}`);
    const decoded = consumeBootstrapFragment(window);
    expect(decoded?.appearance?.hideFeedback).toBe(true);
    expect(decoded?.growthOptions).toEqual({ allowExports: true, curveScale: 'centile' });

    const wcFeedback = {
      module: EmbedModuleKind.CLINICAL_CALCULATORS,
      category: 'CLINICAL_ACCURACY',
      reasonCode: 'THRESHOLD_NOTE',
      surfaceKey: 'clinical-calculators',
      targetKey: 'apgar',
      ticketRef: 'FBK-WC-1',
    };
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://embed.crosdat.com',
        data: {
          channel: CROSDAT_EMBED_CHANNEL,
          channelNonce: decoded!.channelNonce,
          kind: FrameToHostMessageKind.FEEDBACK,
          event: wcFeedback,
        },
      }),
    );
    expect(feedbackListener).toHaveBeenCalledWith(wcFeedback);

    el.remove();
    expect(el.querySelector('iframe')).toBeNull();
  });
});
