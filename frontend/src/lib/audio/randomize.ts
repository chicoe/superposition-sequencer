/**
 * Randomize all per-qubit sound parameters plus the global root/scale.
 *
 * Called once on mount so each refresh starts the user in a fresh sonic
 * arrangement. `none` is excluded from the mode and sound pools so the
 * first audible play isn't accidentally silent.
 */
import { sounds } from '$lib/stores/sounds';
import { trackModes, type TrackMode } from '$lib/stores/trackModes';
import { trackWaves, type TrackWave } from '$lib/stores/trackWaves';
import { trackOctaves, type OctaveBias } from '$lib/stores/trackOctaves';
import { bpm } from '$lib/stores/playback';
import type { SoundName } from '$lib/types';

const MODES: TrackMode[] = ['beat', 'gated', 'drone'];
const WAVES: TrackWave[] = ['sine', 'square', 'sawtooth', 'supersaw'];
// Skew toward 0 so randoms still sound centered; extremes are available but
// less likely. Weighted via repetition in the pool.
const OCTAVES: OctaveBias[] = [-2, -1, -1, 0, 0, 0, 1, 1, 2];
const BEAT_SOUNDS: SoundName[] = [
  'kick', 'snare', 'hihat', 'tom', 'rim', 'clap', 'bass', 'pluck', 'pad', 'bell'
];
const ROOTS = ['C2', 'D2', 'E2', 'G2', 'A2', 'C3', 'D3', 'E3', 'G3', 'A3'];
const SCALES = [
  'minor_pentatonic', 'major_pentatonic', 'minor', 'major', 'blues', 'whole_tone'
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Maximum number of qubits we generate slots for. Should be >= the app's cap (8). */
const MAX = 8;

export function randomizeSoundParams(): void {
  const modes: TrackMode[] = Array.from({ length: MAX }, () => pick(MODES));
  const waves: TrackWave[] = Array.from({ length: MAX }, () => pick(WAVES));
  const octaves: OctaveBias[] = Array.from({ length: MAX }, () => pick(OCTAVES));
  const assignments: Record<number, SoundName> = {};
  for (let q = 0; q < MAX; q++) assignments[q] = pick(BEAT_SOUNDS);

  trackModes.set(modes);
  trackWaves.set(waves);
  trackOctaves.set(octaves);
  sounds.update((s) => ({
    ...s,
    assignments,
    rootNote: pick(ROOTS),
    scale: pick(SCALES)
  }));
  // BPM in the danceable range — not too sluggish, not so fast that drones
  // turn into buzzes.
  bpm.set(80 + Math.floor(Math.random() * 121));
}
