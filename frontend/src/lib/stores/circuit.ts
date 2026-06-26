import { writable, derived, get } from 'svelte/store';
import type { CircuitSpec, Gate } from '$lib/types';
import { PRESETS } from '$lib/quantum/presets';

// Default to Entangled Pair — most musically illustrative.
const initial: CircuitSpec = PRESETS.find((p) => p.slug === 'entangled-pair')?.spec ?? PRESETS[0].spec;

export const circuit = writable<CircuitSpec>(structuredClone(initial));
// Start on the last step so the listener hears the circuit's final state.
export const currentStep = writable<number>(Math.max(0, initial.num_steps - 1));

export const numQubits = derived(circuit, ($c) => $c.num_qubits);
export const numSteps = derived(circuit, ($c) => $c.num_steps);

export function loadCircuit(spec: CircuitSpec) {
  circuit.set(structuredClone(spec));
  // Land on the last step so the user immediately hears the circuit's full result.
  currentStep.set(Math.max(0, spec.num_steps - 1));
}

export function setGate(g: Gate) {
  circuit.update((c) => {
    // Remove any existing gate at the same (step, qubit) slot.
    const occupies = (existing: Gate): boolean => {
      if (existing.step !== g.step) return false;
      const a = qubitsTouched(existing);
      const b = qubitsTouched(g);
      return a.some((q) => b.includes(q));
    };
    const next = c.gates.filter((existing) => !occupies(existing));
    next.push(g);
    return { ...c, gates: next };
  });
}

export function removeGateAt(step: number, qubit: number) {
  circuit.update((c) => ({
    ...c,
    gates: c.gates.filter((g) => g.step !== step || !qubitsTouched(g).includes(qubit))
  }));
}

export function qubitsTouched(g: Gate): number[] {
  if (g.gate === 'cnot' || g.gate === 'cx' || g.gate === 'cz') {
    return [g.control ?? -1, g.target ?? -1].filter((q) => q >= 0);
  }
  if (g.gate === 'swap') {
    return [g.qubit1 ?? -1, g.qubit2 ?? -1].filter((q) => q >= 0);
  }
  return g.qubit !== undefined ? [g.qubit] : [];
}

export function currentSpec(): CircuitSpec {
  return get(circuit);
}
