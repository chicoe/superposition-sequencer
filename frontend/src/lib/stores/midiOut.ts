/**
 * State for real-time MIDI output (Web MIDI API — Chromium only). The actual
 * port access + sending lives in `$lib/midi/output.ts`; this module just holds
 * the reactive UI state.
 */
import { writable } from 'svelte/store';

/** Is the real-time MIDI output turned on? */
export const liveMidiEnabled = writable<boolean>(false);

/** Web MIDI is Chromium-only; Safari/Firefox don't expose requestMIDIAccess. */
export const midiSupported: boolean =
  typeof navigator !== 'undefined' &&
  typeof (navigator as Navigator).requestMIDIAccess === 'function';

export interface MidiOutInfo {
  id: string;
  name: string;
}

/** Available output ports, refreshed on access + hot-plug (onstatechange). */
export const midiOutputs = writable<MidiOutInfo[]>([]);

/** Currently selected output port id (null = none chosen yet). */
export const selectedOutputId = writable<string | null>(null);
