import type {
  CalculatorEvaluationInput,
  CalculatorEvaluationResult,
  ClinicalLearningGradeReport,
  ClinicalLearningSessionView,
  DifferentialEvaluationResult,
  DoseEvaluationInput,
  DoseEvaluationResult,
  EvaluateDifferentialsInput,
  GrowthEvaluationInput,
  GrowthEvaluationResult,
  NeonatalTpnEvaluationInput,
  NeonatalTpnEvaluationResult,
  StartClinicalLearningSessionInput,
  SubmitClinicalLearningAttemptInput,
} from '@crosdat/sdk';
import { useCallback, useState } from 'react';
import { useCrosdatClinical } from '../provider.js';

/**
 * Standard async state envelope returned by every headless clinical hook.
 */
export interface HeadlessAsyncState<TResult> {
  /** Latest successful evaluation result, or `null` before first run. */
  data: TResult | null;
  /** True while an evaluation request is in flight. */
  isLoading: boolean;
  /** Latest error thrown by the transport, or `null` when clean. */
  error: Error | null;
  /** Resets `data` and `error` back to `null`. */
  reset(): void;
}

function useAsyncAction<TInput, TResult>(
  runner: (input: TInput) => Promise<TResult>,
): HeadlessAsyncState<TResult> & { evaluate: (input: TInput) => Promise<TResult> } {
  const [data, setData] = useState<TResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const evaluate = useCallback(
    async (input: TInput): Promise<TResult> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await runner(input);
        setData(res);
        return res;
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err));
        setError(normalized);
        throw normalized;
      } finally {
        setIsLoading(false);
      }
    },
    [runner],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, isLoading, error, evaluate, reset };
}

/**
 * Zero-DOM headless hook for driving custom clerking & differential UIs with
 * thin-slice CROSDAT evaluations.
 *
 * @returns Reactive state (`data`, `isLoading`, `error`) and `evaluate(input)`.
 */
export function useClerkingSession() {
  const { client, facilityOverrides } = useCrosdatClinical();
  const runner = useCallback(
    (input: EvaluateDifferentialsInput): Promise<DifferentialEvaluationResult> =>
      client.evaluateDifferentials({
        ...input,
        facilityOverrides: input.facilityOverrides ?? facilityOverrides,
      }),
    [client, facilityOverrides],
  );
  return useAsyncAction(runner);
}

/**
 * Zero-DOM headless hook for building custom paediatric/neonatal prescribing UIs
 * backed by CROSDAT's weight-based dose & continuous infusion engine.
 *
 * @returns Reactive state (`data`, `isLoading`, `error`) and `evaluate(input)`.
 */
export function useDosePrescriber() {
  const { client, facilityOverrides } = useCrosdatClinical();
  const runner = useCallback(
    (input: DoseEvaluationInput): Promise<DoseEvaluationResult> =>
      client.evaluateDose({
        ...input,
        facilityOverrides: input.facilityOverrides ?? facilityOverrides,
      }),
    [client, facilityOverrides],
  );
  return useAsyncAction(runner);
}

/**
 * Zero-DOM headless hook for computing WHO and Fenton anthropometric z-scores
 * inside custom charting or EHR vitals forms.
 *
 * @returns Reactive state (`data`, `isLoading`, `error`) and `evaluate(input)`.
 */
export function useGrowthChart() {
  const { client } = useCrosdatClinical();
  const runner = useCallback(
    (input: GrowthEvaluationInput): Promise<GrowthEvaluationResult> => client.evaluateGrowth(input),
    [client],
  );
  return useAsyncAction(runner);
}

/**
 * Zero-DOM headless hook for running any of the 34 bedside clinical calculators
 * from custom form controls.
 *
 * @returns Reactive state (`data`, `isLoading`, `error`) and `evaluate(input)`.
 */
export function useClinicalCalculator() {
  const { client } = useCrosdatClinical();
  const runner = useCallback(
    (input: CalculatorEvaluationInput): Promise<CalculatorEvaluationResult> =>
      client.evaluateCalculator(input),
    [client],
  );
  return useAsyncAction(runner);
}

/**
 * Zero-DOM headless hook for neonatal Total Parenteral Nutrition (TPN) bag
 * calculations and osmolarity / precipitation warnings.
 *
 * @returns Reactive state (`data`, `isLoading`, `error`) and `evaluate(input)`.
 */
export function useNeonatalTpn() {
  const { client } = useCrosdatClinical();
  const runner = useCallback(
    (input: NeonatalTpnEvaluationInput): Promise<NeonatalTpnEvaluationResult> =>
      client.evaluateNeonatalTpn(input),
    [client],
  );
  return useAsyncAction(runner);
}

/**
 * Zero-DOM headless hook managing both session start and 6-domain submission
 * grading for `PRACTICE` and `EXAM` clinical learning stations.
 *
 * @returns Session state, grade report, `startSession`, and `submitAttempt`.
 */
export function useClinicalLearningStation() {
  const { client } = useCrosdatClinical();
  const [session, setSession] = useState<ClinicalLearningSessionView | null>(null);
  const [gradeReport, setGradeReport] = useState<ClinicalLearningGradeReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startSession = useCallback(
    async (input: StartClinicalLearningSessionInput): Promise<ClinicalLearningSessionView> => {
      setIsLoading(true);
      setError(null);
      setGradeReport(null);
      try {
        const started = await client.startClinicalLearningSession(input);
        setSession(started);
        return started;
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err));
        setError(normalized);
        throw normalized;
      } finally {
        setIsLoading(false);
      }
    },
    [client],
  );

  const submitAttempt = useCallback(
    async (input: SubmitClinicalLearningAttemptInput): Promise<ClinicalLearningGradeReport> => {
      setIsLoading(true);
      setError(null);
      try {
        const report = await client.submitClinicalLearningAttempt(input);
        setGradeReport(report);
        return report;
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err));
        setError(normalized);
        throw normalized;
      } finally {
        setIsLoading(false);
      }
    },
    [client],
  );

  return { session, gradeReport, isLoading, error, startSession, submitAttempt };
}
