/**
 * Per-qubit waveform for the oscillator modes (gated / drone). The values
 * map to Tone.OmniOscillator type strings — 'supersaw' is the friendlier
 * name for Tone's stacked-detuned 'fatsawtooth'.
 */
import { writable } from 'svelte/store';

export type TrackWave = 'sine' | 'square' | 'sawtooth' | 'supersaw';

export const TRACK_WAVE_LABELS: Record<TrackWave, string> = {
  sine: 'sine',
  square: 'square',
  sawtooth: 'saw',
  supersaw: 'supersaw'
};

/** Tone OmniOscillator type for each wave. */
export function toneTypeFor(wave: TrackWave): string {
  return wave === 'supersaw' ? 'fatsawtooth' : wave;
}

const DEFAULT: TrackWave[] = Array(8).fill('sine');

export const trackWaves = writable<TrackWave[]>(DEFAULT.slice());

export function setTrackWave(qubit: number, wave: TrackWave) {
  trackWaves.update((arr) => {
    const next = arr.slice();
    next[qubit] = wave;
    return next;
  });
}
