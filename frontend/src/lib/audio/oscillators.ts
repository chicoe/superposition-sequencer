/**
 * Per-qubit continuous oscillator channels. Each qubit gets at most one
 * channel; the sequencer creates one on demand when a track switches to
 * `legato` or `gated`, drives its amplitude / gate / pitch every beat, and
 * tears it down when the track returns to `beat`.
 *
 * Signal chain: Oscillator → Gain (amplitude × gate) → Filter (timbre,
 * driven by purity r) → destination.
 */
import * as Tone from 'tone';
import { toneTypeFor, type TrackWave } from '$lib/stores/trackWaves';
import { getMasterIn } from './master';

interface OscChannel {
  osc: Tone.OmniOscillator<Tone.Oscillator>;
  gain: Tone.Gain; // overall amplitude after gating
  filter: Tone.Filter;
  panner: Tone.Panner;
  active: boolean;
  wave: TrackWave;
}

const channels = new Map<number, OscChannel>();

// Smoothing times (seconds). Short enough to feel responsive, long enough to
// avoid audible zipper noise as values move every beat.
const AMP_RAMP = 0.05;
const FILTER_RAMP = 0.08;
const PITCH_RAMP = 0.05;
const STOP_RAMP = 0.04;

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function ensure(qubit: number, pitchMidi: number, wave: TrackWave): OscChannel {
  let ch = channels.get(qubit);
  if (!ch) {
    const osc = new Tone.OmniOscillator(midiToHz(pitchMidi), toneTypeFor(wave) as any);
    const gain = new Tone.Gain(0);
    const filter = new Tone.Filter(1500, 'lowpass');
    const panner = new Tone.Panner(0);
    osc.connect(gain);
    gain.connect(filter);
    filter.connect(panner);
    panner.connect(getMasterIn());
    ch = { osc, gain, filter, panner, active: false, wave };
    channels.set(qubit, ch);
  }
  return ch;
}

export function startOsc(qubit: number, pitchMidi: number, wave: TrackWave): void {
  const ch = ensure(qubit, pitchMidi, wave);
  ch.osc.frequency.rampTo(midiToHz(pitchMidi), PITCH_RAMP);
  if (ch.wave !== wave) {
    // Changing type on the fly is supported and avoids a click most of the time.
    ch.osc.type = toneTypeFor(wave) as any;
    ch.wave = wave;
  }
  if (!ch.active) {
    ch.osc.start();
    ch.active = true;
  }
}

export function stopOsc(qubit: number): void {
  const ch = channels.get(qubit);
  if (!ch) return;
  ch.gain.gain.cancelScheduledValues(Tone.now());
  ch.gain.gain.rampTo(0, STOP_RAMP);
  if (ch.active) {
    // Stop slightly after the gain ramp so we don't hear a click.
    ch.osc.stop('+' + (STOP_RAMP + 0.02));
    ch.active = false;
  }
}

export function stopAllOsc(): void {
  for (const q of channels.keys()) stopOsc(q);
}

/**
 * @param amp        target amplitude 0..1 (mapped to a sane output level)
 * @param gateOpen   if false, gain is forced to 0 regardless of `amp`
 */
export function setOscAmplitude(qubit: number, amp: number, gateOpen: boolean): void {
  const ch = channels.get(qubit);
  if (!ch || !ch.active) return;
  const target = gateOpen ? Math.max(0, Math.min(1, amp)) * 0.45 : 0;
  ch.gain.gain.rampTo(target, AMP_RAMP);
}

/** Purity r → filter cutoff (mixed states sound darker; also keeps the level in
 *  check). Kept ON for oscillators; the beat path's r→filter stays disabled. */
export function setOscPurity(qubit: number, purity: number): void {
  const ch = channels.get(qubit);
  if (!ch) return;
  const p = Math.max(0, Math.min(1, purity));
  ch.filter.frequency.rampTo(600 + p * 4500, FILTER_RAMP);
}

/** Stereo position for this qubit's oscillator: -1 (left) .. +1 (right). */
export function setOscPan(qubit: number, pan: number): void {
  const ch = channels.get(qubit);
  if (!ch) return;
  ch.panner.pan.rampTo(Math.max(-1, Math.min(1, pan)), AMP_RAMP);
}

export function setOscPitch(qubit: number, pitchMidi: number): void {
  const ch = channels.get(qubit);
  if (!ch) return;
  ch.osc.frequency.rampTo(midiToHz(pitchMidi), PITCH_RAMP);
}

/** Expose the raw oscillator node so the ring-mod module can tap its signal. */
export function getOscNode(qubit: number): Tone.OmniOscillator<Tone.Oscillator> | null {
  return channels.get(qubit)?.osc ?? null;
}

/** Is this qubit's oscillator currently sounding? */
export function isOscActive(qubit: number): boolean {
  return channels.get(qubit)?.active ?? false;
}
