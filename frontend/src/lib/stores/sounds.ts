import { writable } from 'svelte/store';
import type { SoundName } from '$lib/types';

export interface SoundConfig {
  assignments: Record<number, SoundName>; // qubit index → sound
  scale: string;
  rootNote: string;
}

const defaults: SoundConfig = {
  assignments: { 0: 'kick', 1: 'snare', 2: 'hihat', 3: 'bass' },
  scale: 'minor_pentatonic',
  rootNote: 'C3'
};

export const sounds = writable<SoundConfig>(defaults);

export function assign(qubit: number, sound: SoundName) {
  sounds.update((s) => ({ ...s, assignments: { ...s.assignments, [qubit]: sound } }));
}
