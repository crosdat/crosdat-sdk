import { CROSDAT_EMBED_CHANNEL, FrameToHostMessageKind, consumeBootstrapFragment } from '@crosdat/embed';
import { EmbedModuleKind, createCrosdatClient, type ClinicalTransport } from '@crosdat/sdk';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useClerkingSession,
  useClinicalCalculator,
  useClinicalEvidenceAsk,
  useClinicalLearningStation,
  useDosePrescriber,
  useGrowthChart,
  useNeonatalTpn,
} from '../headless/index.js';
import {
  ClerkingEmbed,
  ClinicalCalculatorsEmbed,
  ClinicalEvidenceAskEmbed,
  ClinicalGuideEmbed,
  ClinicalLearningStationEmbed,
  CrosdatClinicalProvider,
  DosePrescriberEmbed,
  GrowthChartEmbed,
  NeonatalTpnEmbed,
} from '../index.js';

afterEach(() => {
  cleanup();
});

function createMockTransport(): ClinicalTransport {
  return {
    createEmbedSession: vi.fn(),
    evaluateDifferentials: vi.fn(async () => ({
      triagePriority: 'PRIORITY' as const,
      redFlags: [],
      differentials: [],
      recommendedInvestigations: [],
      appliedFacilityOverrides: [],
      citations: [],
    })),
    evaluateDose: vi.fn(async (input) => ({
      medicationKey: input.medicationKey,
      medicationName: 'Amoxicillin',
      route: 'ORAL',
      dosePerKg: 40,
      doseBasis: 'mg/kg/dose',
      calculatedSingleDose: 400,
      doseUnit: 'mg',
      cappedAtMaxSingleDose: false,
      frequencyLabel: 'Every 12 hours',
      codes: [],
      alerts: [],
      appliedFacilityOverrides: input.facilityOverrides
        ? [
            {
              kind: 'FORMULARY' as const,
              targetKey: input.medicationKey,
              summary: 'Stocked suspension selected',
            },
          ]
        : [],
      citations: [],
    })),
    evaluateNeonatalTpn: vi.fn(async () => ({
      engineVersion: '1.0.0',
      parenteralVolumeMlPerDay: 180,
      aqueousRateMlPerHour: 6.8,
      lipidRateMlPerHour: 0.7,
      estimatedOsmolarityMosmPerL: 780,
      deliveredKcalPerKgDay: 92,
      deliveredGirMgKgMin: 6.5,
      compoundingLines: [],
      warnings: [],
      citations: [],
    })),
    evaluateGrowth: vi.fn(async () => ({
      standardUsed: 'FENTON_PRETERM' as const,
      indicators: [],
      alerts: [],
      citations: [],
    })),
    listCalculators: vi.fn(async () => []),
    evaluateCalculator: vi.fn(async (input) => ({
      calculatorSlug: input.calculatorSlug,
      title: 'Apgar Score',
      score: 9,
      interpretation: 'Reassuring newborn transition',
      alerts: [],
      citations: [],
    })),
    searchGuidelines: vi.fn(async () => ({ hits: [] })),
    askClinicalEvidence: vi.fn(async (input) => ({
      status: 'ANSWERED' as const,
      answerMarkdown: `Cited answer for ${input.question} [1].`,
      citations: [
        {
          footnoteIndex: 1,
          passageId: 'who-pb-sepsis-1',
          sourceId: 'who-pb',
          title: 'WHO Pocket Book',
          excerpt: 'Administer IV ampicillin and gentamicin promptly.',
        },
      ],
      deterministicToolResults: [],
      contentVersion: '2026.11.0',
      modelId: 'crosdat-evidence-v1',
      topEvidenceScore: 0.92,
      latencyMs: 140,
    })),
    startClinicalLearningSession: vi.fn(async (input) => ({
      attemptId: 'att_01',
      scenarioSlug: input.scenarioSlug,
      title: 'Neonatal Sepsis & Hypoglycaemia',
      mode: input.mode,
      timeLimitSeconds: 600,
      patientVignette: '2-day-old lethargic newborn.',
      patient: { ageDays: 2, sex: 'MALE' as const, weightKg: 2.8 },
      complaintSlug: 'neonatal-danger-signs',
    })),
    submitClinicalLearningAttempt: vi.fn(async (input) => ({
      scenarioSlug: input.scenarioSlug,
      overallScore: 91,
      passed: true,
      domainScores: [],
      criticalSafetyGaps: [],
      stewardshipFeedback: [],
      citations: [],
    })),
  };
}

describe('@crosdat/react components and headless clinical hooks', () => {
  it('mounts all eight <*Embed /> components inside CrosdatClinicalProvider', () => {
    const transport = createMockTransport();
    const client = createCrosdatClient({ transport });

    const { container } = render(
      <CrosdatClinicalProvider
        client={client}
        embedBaseUrl="https://embed.crosdat.com"
        sessionToken="tok_react_1"
        appearance={{ theme: 'neutral-clinical', hideBranding: true }}
      >
        <ClerkingEmbed />
        <GrowthChartEmbed />
        <ClinicalCalculatorsEmbed calculatorSlug="apgar" />
        <DosePrescriberEmbed medicationKey="amoxicillin" />
        <NeonatalTpnEmbed />
        <ClinicalGuideEmbed playbookSlug="severe-malaria" />
        <ClinicalLearningStationEmbed scenarioSlug="neonatal-sepsis-hypoglycaemia" />
        <ClinicalEvidenceAskEmbed
          contextSlug="severe-malaria"
          ai={{ mode: 'crosdat-cloud', voiceEnabled: true }}
        />
      </CrosdatClinicalProvider>,
    );

    const iframes = container.querySelectorAll('iframe');
    expect(iframes).toHaveLength(8);
    expect(iframes[0]?.src).toContain('/clerking#crosdat=');
    expect(iframes[1]?.src).toContain('/growth-chart#crosdat=');
    expect(iframes[2]?.src).toContain('/clinical-calculators#crosdat=');
    expect(iframes[3]?.src).toContain('/dose-prescriber#crosdat=');
    expect(iframes[4]?.src).toContain('/neonatal-tpn#crosdat=');
    expect(iframes[5]?.src).toContain('/clinical-guide#crosdat=');
    expect(iframes[6]?.src).toContain('/clinical-learning#crosdat=');
    expect(iframes[7]?.src).toContain('/evidence-ask#crosdat=');

    const evidenceHash = iframes[7]!.src.slice(iframes[7]!.src.indexOf('#crosdat='));
    window.history.replaceState(null, '', `/embed/evidence-ask${evidenceHash}`);
    const decodedEvidence = consumeBootstrapFragment(window);
    expect(decodedEvidence?.targetSlug).toBe('severe-malaria');
    expect(decodedEvidence?.ai).toEqual({ mode: 'crosdat-cloud', voiceEnabled: true });
  });

  it('forwards onFeedback and appearance.hideFeedback to mounted embed frames', () => {
    const transport = createMockTransport();
    const client = createCrosdatClient({ transport });
    const onFeedback = vi.fn();

    const { container } = render(
      <CrosdatClinicalProvider
        client={client}
        embedBaseUrl="https://embed.crosdat.com"
        sessionToken="tok_react_fb"
        appearance={{ theme: 'neutral-clinical', hideFeedback: true }}
      >
        <DosePrescriberEmbed medicationKey="amoxicillin" onFeedback={onFeedback} />
      </CrosdatClinicalProvider>,
    );

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const hashPart = iframe!.src.slice(iframe!.src.indexOf('#crosdat='));
    window.history.replaceState(null, '', `/embed/dose-prescriber${hashPart}`);
    const decoded = consumeBootstrapFragment(window);
    expect(decoded?.appearance?.hideFeedback).toBe(true);

    const feedbackEvent = {
      module: EmbedModuleKind.DOSE_PRESCRIBER,
      category: 'CLINICAL_ACCURACY',
      reasonCode: 'DOSE_CAP',
      surfaceKey: 'dose-prescriber',
      targetKey: 'amoxicillin',
      ticketRef: 'FBK-REACT-1',
    };
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://embed.crosdat.com',
        data: {
          channel: CROSDAT_EMBED_CHANNEL,
          channelNonce: decoded!.channelNonce,
          kind: FrameToHostMessageKind.FEEDBACK,
          event: feedbackEvent,
        },
      }),
    );

    expect(onFeedback).toHaveBeenCalledWith(feedbackEvent);
  });

  it('executes all headless hooks and inherits provider facilityOverrides automatically', async () => {
    const transport = createMockTransport();
    const client = createCrosdatClient({ transport });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CrosdatClinicalProvider
        client={client}
        embedBaseUrl="https://embed.crosdat.com"
        sessionToken="tok_headless"
        facilityOverrides={{
          facilityId: 'fac_1',
          formulary: { amoxicillin: { inStock: true } },
        }}
      >
        {children}
      </CrosdatClinicalProvider>
    );

    const doseHook = renderHook(() => useDosePrescriber(), { wrapper });
    await act(async () => {
      await doseHook.result.current.evaluate({
        patient: { ageDays: 730, sex: 'FEMALE', weightKg: 10 },
        medicationKey: 'amoxicillin',
      });
    });
    expect(doseHook.result.current.data?.calculatedSingleDose).toBe(400);
    expect(doseHook.result.current.data?.appliedFacilityOverrides).toHaveLength(1);

    const clerkingHook = renderHook(() => useClerkingSession(), { wrapper });
    await act(async () => {
      await clerkingHook.result.current.evaluate({
        patient: { ageDays: 400, sex: 'MALE' },
        complaintSlugs: ['paediatric-fever'],
        presentKeys: ['FEVER'],
      });
    });
    expect(clerkingHook.result.current.data?.triagePriority).toBe('PRIORITY');

    const growthHook = renderHook(() => useGrowthChart(), { wrapper });
    await act(async () => {
      await growthHook.result.current.evaluate({
        sex: 'FEMALE',
        gestationalAgeDays: 210,
        measurements: [{ ageDays: 7, weightKg: 1.3 }],
      });
    });
    expect(growthHook.result.current.data?.standardUsed).toBe('FENTON_PRETERM');

    const calcHook = renderHook(() => useClinicalCalculator(), { wrapper });
    await act(async () => {
      await calcHook.result.current.evaluate({
        calculatorSlug: 'apgar',
        inputs: { appearance: 2, pulse: 2, grimace: 1, activity: 2, respiration: 2 },
      });
    });
    expect(calcHook.result.current.data?.score).toBe(9);

    const tpnHook = renderHook(() => useNeonatalTpn(), { wrapper });
    await act(async () => {
      await tpnHook.result.current.evaluate({
        patient: { ageDays: 4, sex: 'MALE', weightKg: 1.5 },
        accessRoute: 'CENTRAL',
        totalFluidMlPerKgDay: 120,
        aminoAcidsGPerKgDay: 3.0,
        lipidsGPerKgDay: 2.5,
        targetGirMgKgMin: 6.5,
      });
    });
    expect(tpnHook.result.current.data?.estimatedOsmolarityMosmPerL).toBe(780);

    const osceHook = renderHook(() => useClinicalLearningStation(), { wrapper });
    await act(async () => {
      await osceHook.result.current.startSession({
        scenarioSlug: 'neonatal-sepsis-hypoglycaemia',
        mode: 'PRACTICE',
      });
      await osceHook.result.current.submitAttempt({
        attemptId: 'att_01',
        scenarioSlug: 'neonatal-sepsis-hypoglycaemia',
        historyKeysAsked: ['POOR_FEEDING'],
        examKeysChecked: ['LETHARGY'],
        investigationsOrdered: ['BLOOD_GLUCOSE'],
        selectedDifferentials: [],
        prescriptionsWritten: [],
        redFlagsRecognised: ['LETHARGY'],
        elapsedSeconds: 240,
      });
    });
    expect(osceHook.result.current.session?.attemptId).toBe('att_01');
    expect(osceHook.result.current.gradeReport?.passed).toBe(true);

    const evidenceHook = renderHook(() => useClinicalEvidenceAsk(), { wrapper });
    await act(async () => {
      await evidenceHook.result.current.evaluate({
        question: 'First-line antibiotics for neonatal sepsis?',
        patient: { ageDays: 3, sex: 'MALE', weightKg: 3.1 },
      });
    });
    expect(evidenceHook.result.current.data?.status).toBe('ANSWERED');
    expect(evidenceHook.result.current.data?.citations).toHaveLength(1);
    expect(transport.askClinicalEvidence).toHaveBeenCalledWith({
      question: 'First-line antibiotics for neonatal sepsis?',
      patient: { ageDays: 3, sex: 'MALE', weightKg: 3.1 },
      facilityOverrides: {
        facilityId: 'fac_1',
        formulary: { amoxicillin: { inStock: true } },
      },
    });
  });
});
