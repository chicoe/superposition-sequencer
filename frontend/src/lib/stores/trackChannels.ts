/**
 * Per-qubit MIDI output channel (1..16). Used by BOTH the .mid file export and
 * the real-time Web MIDI output, so each qubit/track can drive a separate
 * external synth. Default is one channel per qubit (q0->1, q1->2, …); overlap
 * is allowed. Mirrors the shape of `trackModes.ts` / `trackWaves.ts`.
 */
import { writable } from 'svelte/store';

/** q0->1 … q7->8 by default; MIDI channels are 1-based (1..16). */
const DEFAULT: number[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const trackChannels = writable<number[]>(DEFAULT.slice());

export function setTrackChannel(qubit: number, channel: number) {
  const ch = Math.max(1, Math.min(16, Math.round(channel)));
  trackChannels.update((arr) => {
    const next = arr.slice();
    next[qubit] = ch;
    return next;
  });
}

export function resetTrackChannels() {
  trackChannels.set(DEFAULT.slice());
}
