/**
 * Per-qubit playback mode.
 *
 *   none    — qubit is muted; no audio at all (timeline still shows the bits).
 *   beat    — drum/synth-style trigger: every shot fires the qubit's assigned
 *             sound when its bit measures |0⟩.
 *   gated   — continuous oscillator gated by the current shot — pulses to the
 *             measurement pattern.
 *   drone   — continuous oscillator, always open. Amplitude tracks the
 *             running trigger rate at the current step.
 *
 * Pitch for both osc modes comes from the active scale, but the note is
 * picked by reading the last few shots' bits as an index — so it changes
 * with the measurement stream instead of staying fixed per qubit.
 */
import { writable } from 'svelte/store';

export type TrackMode = 'none' | 'beat' | 'gated' | 'drone';

export const TRACK_MODE_LABELS: Record<TrackMode, string> = {
  none: 'none',
  beat: 'beat',
  gated: 'gated osc',
  drone: 'drone'
};

const DEFAULT: TrackMode[] = Array(8).fill('beat');

export const trackModes = writable<TrackMode[]>(DEFAULT.slice());

export function setTrackMode(qubit: number, mode: TrackMode) {
  trackModes.update((arr) => {
    const next = arr.slice();
    next[qubit] = mode;
    return next;
  });
}

export function resetTrackModes(numQubits: number) {
  trackModes.set(Array(numQubits).fill('beat'));
}

export function isOscMode(mode: TrackMode): boolean {
  return mode === 'gated' || mode === 'drone';
}
