/**
 * Master effects bus. Every voice routes here instead of straight to the
 * destination, so delay and reverb apply to the whole mix:
 *
 *   masterIn ─ FeedbackDelay ─ Reverb ─ destination
 *
 * Both effects are inserts with a dry/wet mix; at wet 0 they pass fully dry, so
 * the sliders fade them in from nothing. Master *volume* stays on
 * Tone.getDestination() (post-FX), so it still scales the final output. The
 * delay time is tempo-synced to the BPM store.
 */
import * as Tone from 'tone';
import { get } from 'svelte/store';
import { bpm } from '$lib/stores/playback';

let masterIn: Tone.Gain | null = null;
let delay: Tone.FeedbackDelay | null = null;
let reverb: Tone.Reverb | null = null;
let bpmUnsub: (() => void) | null = null;

// Remember the latest amounts so values set from the sliders before the audio
// context starts are applied when the chain is finally built.
let delayWet = 0.15;
let reverbWet = 0.2;

function delayTimeFor(b: number): number {
  // A dotted-eighth feel, tempo-synced.
  return (60 / Math.max(1, b)) * 0.75;
}

/** Build the master chain once. Call after Tone.start(). */
export function initMaster(): void {
  if (masterIn) return;
  masterIn = new Tone.Gain(1);
  delay = new Tone.FeedbackDelay({ delayTime: delayTimeFor(get(bpm)), feedback: 0.32, wet: delayWet });
  reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.01, wet: reverbWet });
  masterIn.connect(delay);
  delay.connect(reverb);
  reverb.toDestination();
  // Keep the delay tempo-synced (subscribe fires immediately with the current BPM).
  bpmUnsub = bpm.subscribe((b) => delay?.delayTime.rampTo(delayTimeFor(b), 0.1));
}

/** The node every voice connects to (builds the chain lazily if needed). */
export function getMasterIn(): Tone.Gain {
  if (!masterIn) initMaster();
  return masterIn as Tone.Gain;
}

export function setDelayWet(x: number): void {
  delayWet = Math.max(0, Math.min(1, x));
  if (delay) delay.wet.rampTo(delayWet, 0.05);
}

export function setReverbWet(x: number): void {
  reverbWet = Math.max(0, Math.min(1, x));
  if (reverb) reverb.wet.rampTo(reverbWet, 0.05);
}

export function disposeMaster(): void {
  bpmUnsub?.();
  bpmUnsub = null;
  try {
    delay?.dispose();
    reverb?.dispose();
    masterIn?.dispose();
  } catch {
    // ignore — already disposed
  }
  masterIn = null;
  delay = null;
  reverb = null;
}
