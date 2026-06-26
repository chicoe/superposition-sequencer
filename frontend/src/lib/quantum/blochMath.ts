/**
 * Mirrors backend app/mapping/parameters.py.
 * Keep formulas in sync with the spec §4 and the backend.
 */
import type { ComplexAmplitude } from '$lib/types';

// Maximum timing offset (as a fraction of beat interval) applied to each hit.
// φ = 0 → -MAX_SWING (early), φ = 2π → +MAX_SWING (late). Larger values make
// the groove more dramatic; ≤0.5 keeps hits within the half-beat window.
export const MAX_SWING = 0.5;
export const TWO_PI = Math.PI * 2;

export function triggerProbability(theta: number): number {
  return Math.cos(theta / 2) ** 2;
}

/**
 * φ=0   → -MAX_SWING (early)
 * φ=π   →  0          (on grid)
 * φ→2π  → +MAX_SWING (late)
 */
export function swingOffset(phi: number, maxSwing = MAX_SWING): number {
  const normalized = (((phi % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI;
  return (2 * normalized - 1) * maxSwing;
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Sample a measurement outcome from the full statevector.
 *
 * CRITICAL (spec §16.2): for entangled qubits, sampling each marginal
 * independently destroys correlations. Always sample from the full distribution.
 *
 * Returns a little-endian bitstring (qubit 0 = rightmost char), matching Qiskit.
 */
export function sampleCorrelated(
  statevector: ComplexAmplitude[],
  numQubits: number,
  rand: () => number = Math.random
): string {
  // probabilities = |amplitude|²
  let total = 0;
  const probs = new Float64Array(statevector.length);
  for (let i = 0; i < statevector.length; i++) {
    const a = statevector[i];
    probs[i] = a.re * a.re + a.im * a.im;
    total += probs[i];
  }
  // Normalize to guard against float drift.
  const r = rand() * (total || 1);
  let acc = 0;
  let idx = probs.length - 1;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r < acc) {
      idx = i;
      break;
    }
  }
  return idx.toString(2).padStart(numQubits, '0');
}

/** Read bit q of a little-endian bitstring (q=0 → rightmost char). */
export function bitAt(bitstring: string, q: number): 0 | 1 {
  return bitstring.charAt(bitstring.length - 1 - q) === '1' ? 1 : 0;
}
