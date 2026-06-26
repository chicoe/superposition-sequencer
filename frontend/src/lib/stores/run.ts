/**
 * A "computed run" freezes backend measurements (local Aer or an IonQ device)
 * so the audio loop can replay them instead of sampling the live statevector —
 * what the user hears is exactly what the backend returned.
 *
 * Runs are PER STEP: each computed step holds its own measured bitstrings, so
 * you can run a circuit's steps one at a time on hardware. The set as a whole
 * is tied to one circuit (editing the circuit invalidates it). Playback in Auto
 * mode cycles only the steps that have been computed.
 */
import { derived, writable } from 'svelte/store';
import type { CircuitSpec } from '$lib/types';

export type BackendId =
  | 'aer'
  | 'ionq_simulator'
  | 'ionq_simulator.forte_1'
  | 'ionq_simulator.forte_enterprise_1'
  | 'ionq_qpu.forte_1'
  | 'ionq_qpu.forte_enterprise_1';

/**
 * Where the shot ordering in `memory` actually came from.
 *
 *   'memory' = backend returned per-shot bitstrings in the order they were
 *              measured (Aer always; IonQ when supported).
 *   'counts' = backend only returned aggregated counts; we expanded them and
 *              shuffled. Marginals and pairwise correlations are real, but
 *              the time ordering of shots is synthetic.
 */
export type MemorySource = 'memory' | 'counts';

/** One step's frozen measurement. */
export interface StepRun {
  backend: BackendId;
  shots: number;
  memory: string[]; // little-endian bitstrings, qubit 0 = rightmost char
  memorySource: MemorySource;
  completedAt: number; // unix seconds
}

/** The whole computed set for a circuit: a map of step index → that step's run. */
export interface ComputedRun {
  /** The circuit these runs were computed against. Editing it invalidates the set. */
  circuit: CircuitSpec;
  steps: Record<number, StepRun>;
}

export const computedRun = writable<ComputedRun | null>(null);

/** Sorted indices of the steps that have a computed run. */
export const computedSteps = derived(computedRun, ($r) =>
  $r ? Object.keys($r.steps).map(Number).sort((a, b) => a - b) : []
);

/**
 * Merge one step's run into the set. If the circuit differs from the existing
 * set's circuit (e.g. it was edited or a different circuit), start a fresh set.
 */
export function setStepRun(circuit: CircuitSpec, step: number, run: StepRun): void {
  computedRun.update((cur) => {
    const sameCircuit = cur && JSON.stringify(cur.circuit) === JSON.stringify(circuit);
    const steps = sameCircuit ? { ...cur!.steps } : {};
    steps[step] = run;
    return { circuit, steps };
  });
}

export function clearRun(): void {
  computedRun.set(null);
}

/**
 * Parse a saved/bundled run file into a ComputedRun.
 *   schema 2 → `{ circuit, steps: { "<i>": { backend, shots, memory, memory_source, completed_at } } }`
 *   schema 1 (legacy) → a single whole-circuit measurement, attached to the last step.
 * Returns null if there are no usable measurements.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseRunFile(data: any): ComputedRun | null {
  if (!data || !data.circuit) return null;
  const circuit = data.circuit as CircuitSpec;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toStep = (s: any): StepRun => ({
    backend: s.backend,
    shots: s.shots ?? (Array.isArray(s.memory) ? s.memory.length : 0),
    memory: Array.isArray(s.memory) ? s.memory : [],
    memorySource: s.memory_source ?? 'counts',
    completedAt: s.completed_at ?? Date.now() / 1000
  });
  const steps: Record<number, StepRun> = {};
  if (data.schema === 2 && data.steps && typeof data.steps === 'object') {
    for (const [k, s] of Object.entries(data.steps)) steps[Number(k)] = toStep(s);
  } else if (Array.isArray(data.memory)) {
    steps[Math.max(0, (circuit.num_steps ?? 1) - 1)] = toStep(data);
  }
  return Object.keys(steps).length ? { circuit, steps } : null;
}

export const BACKEND_LABELS: Record<BackendId, string> = {
  aer: 'LOCAL · AER',
  ionq_simulator: 'IONQ · SIMULATOR (IDEAL)',
  'ionq_simulator.forte_1': 'IONQ · SIM (FORTE-1 NOISE)',
  'ionq_simulator.forte_enterprise_1': 'IONQ · SIM (FORTE-ENT NOISE)',
  'ionq_qpu.forte_1': 'IONQ · FORTE-1 (QPU)',
  'ionq_qpu.forte_enterprise_1': 'IONQ · FORTE-ENTERPRISE-1 (QPU)'
};

export function isHardware(b: BackendId): boolean {
  return b === 'ionq_qpu.forte_1' || b === 'ionq_qpu.forte_enterprise_1';
}
