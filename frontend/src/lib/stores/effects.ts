/**
 * Master audio-effect amounts and the per-qubit stereo pan helper.
 *
 * delay/reverb are master sends (0 = dry, 1 = full wet); stereoSeparation spreads
 * the qubits across the stereo field by index. All three are surfaced as sliders
 * in the transport's Effects block.
 */
import { writable } from 'svelte/store';

/** Master delay send (0 = dry .. 1 = full wet). */
export const delayAmount = writable(0.15);
/** Master reverb send (0 = dry .. 1 = full wet). */
export const reverbAmount = writable(0.2);
/** Stereo separation (0 = mono/centred, 1 = qubits spread hard left → right). */
export const stereoSeparation = writable(0.6);

/**
 * Stereo pan for a qubit by index — a linear spread scaled by `sep`:
 * q0 → -sep (left), q(n-1) → +sep (right), centre in the middle.
 */
export function panForQubit(q: number, n: number, sep: number): number {
  if (n <= 1) return 0;
  const spread = (2 * q) / (n - 1) - 1; // -1 .. +1
  return spread * Math.max(0, Math.min(1, sep));
}
