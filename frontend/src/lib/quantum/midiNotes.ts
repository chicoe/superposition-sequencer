/**
 * General-MIDI note mapping shared by the .mid file export (`midiWriter.ts`)
 * and the real-time output (`sequencer.ts`), so both pick the same note for a
 * given sound + measurement outcome.
 *
 * Melodic voices are pitched from the active scale by the full bitstring;
 * percussive voices use their GM drum note (channel 10 by convention, though
 * the actual channel now comes from the per-qubit `trackChannels` setting).
 */
import type { SoundName } from '$lib/types';
import { pitchForOutcome } from '$lib/audio/scales';

export const DRUM_NOTES: Partial<Record<SoundName, number>> = {
  kick: 36,
  snare: 38,
  hihat: 42,
  tom: 41,
  rim: 37,
  clap: 39
};

export const MELODIC_SET: Set<SoundName> = new Set(['bass', 'pluck', 'pad', 'bell']);

/**
 * The MIDI note a sound plays for this outcome, or null for a silent track
 * ('none'). Melodic → scale pitch; percussive → GM drum note.
 */
export function noteForOutcome(
  sound: SoundName,
  outcome: string,
  scaleNotes: number[]
): number | null {
  if (sound === 'none') return null;
  if (MELODIC_SET.has(sound)) return pitchForOutcome(outcome, scaleNotes);
  return DRUM_NOTES[sound] ?? 36;
}
