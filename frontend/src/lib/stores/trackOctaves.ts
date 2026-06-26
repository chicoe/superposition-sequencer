/**
 * Per-qubit octave bias (in octaves) added to the oscillator pitch. Useful
 * for spreading the four-or-so qubits across registers — drone q0 at -1
 * makes a bass, drone q1 at +1 makes a counter-melody, etc.
 */
import { writable } from 'svelte/store';

export type OctaveBias = -2 | -1 | 0 | 1 | 2;

export const OCTAVE_OPTIONS: OctaveBias[] = [-2, -1, 0, 1, 2];

const DEFAULT: OctaveBias[] = Array(8).fill(0);

export const trackOctaves = writable<OctaveBias[]>(DEFAULT.slice());

export function setTrackOctave(qubit: number, bias: OctaveBias) {
  trackOctaves.update((arr) => {
    const next = arr.slice();
    next[qubit] = bias;
    return next;
  });
}
