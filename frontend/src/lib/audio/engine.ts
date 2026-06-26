/**
 * Tone.js audio engine. Synth-based for now (no sample files committed).
 *
 * Spec §16.4: schedule via Tone — never setTimeout — for sample-accurate timing.
 *
 * Bloch-vector length `r` (purity) modulates a low-pass filter per voice:
 * pure states (r→1) ring full and bright; mixed/entangled states (r→0) sound
 * muffled and distant. Velocity stays constant so every shot is audible.
 */
import * as Tone from 'tone';
import type { SoundName } from '$lib/types';
import { midiToFreq } from './scales';
import { initMaster, getMasterIn } from './master';

let started = false;

// Master output level (0..1 linear). Everything routes to Tone's destination,
// so setting its volume scales the whole mix. Stored so it survives before the
// audio context starts and is re-applied on build.
let masterVolume = 0.5;

/** Set the master output level. 0 = silent, 1 = unity (0 dB). */
export function setMasterVolume(linear: number): void {
  masterVolume = Math.max(0, Math.min(1, linear));
  // Tone.Destination exists even before start(); gainToDb(0) = -Infinity (mute).
  Tone.getDestination().volume.value = masterVolume <= 0 ? -Infinity : Tone.gainToDb(masterVolume);
}

// Tone's Instrument base class isn't exported as a usable type; use a loose record.
type AnyInstrument =
  | Tone.MembraneSynth
  | Tone.NoiseSynth
  | Tone.MetalSynth
  | Tone.MonoSynth
  | Tone.PluckSynth
  | Tone.PolySynth
  | Tone.FMSynth;

const synths: Record<SoundName, AnyInstrument | null> = {
  none: null, // silent track — trigger() no-ops via the `if (!inst) return` guard
  kick: null,
  snare: null,
  hihat: null,
  tom: null,
  rim: null,
  clap: null,
  bass: null,
  pluck: null,
  pad: null,
  bell: null
};

// Last scheduled time per voice. Two qubits assigned to the same sound that
// fire on the same beat would otherwise queue events at identical times, which
// Web Audio rejects ("start time must be strictly greater than previous").
const lastTime: Record<SoundName, number> = {
  none: 0,
  kick: 0,
  snare: 0,
  hihat: 0,
  tom: 0,
  rim: 0,
  clap: 0,
  bass: 0,
  pluck: 0,
  pad: 0,
  bell: 0
};

const filters: Record<SoundName, Tone.Filter | null> = {
  none: null,
  kick: null,
  snare: null,
  hihat: null,
  tom: null,
  rim: null,
  clap: null,
  bass: null,
  pluck: null,
  pad: null,
  bell: null
};

// Filter cutoff range — pure state opens fully, max-mixed closes to a muffled distance.
const F_MIN = 400; // Hz, sounds muffled / distant
const F_MAX = 18000; // Hz, sounds open / present

function filterFreqForPurity(r: number): number {
  // TEMPORARILY DISABLED: purity (Bloch r) → low-pass cutoff. Hold the filter at
  // the pure-state value (fully open) so r no longer darkens the sound. To
  // re-enable, restore the interpolation below.
  void r;
  return F_MAX;
  // const t = Math.max(0, Math.min(1, r));
  // // Exponential interpolation reads as perceptually linear pitch movement.
  // return F_MIN * Math.pow(F_MAX / F_MIN, t);
}

// Shared output gain for all drum voices, so they balance together against the
// oscillators. >1 nudges the beats a touch louder. Tune this one knob.
const BEAT_GAIN = 1.4;
let beatBus: Tone.Gain | null = null;

// Per-sound stereo panner — set per hit to the firing qubit's stereo position
// (see trigger). Pooling is per sound, so this is per-qubit only when each qubit
// uses a distinct sound, which is the normal case.
const panners: Partial<Record<SoundName, Tone.Panner>> = {};

function makeFilter(sound: SoundName): Tone.Filter {
  // Each voice → lowpass → per-sound panner → beat bus → master.
  const filter = new Tone.Filter({ type: 'lowpass', frequency: F_MAX, Q: 0.7, rolloff: -24 });
  const panner = new Tone.Panner(0);
  filter.connect(panner);
  panner.connect(beatBus ?? getMasterIn());
  panners[sound] = panner;
  return filter;
}

function build() {
  // Each voice → its own lowpass → per-sound panner → beat bus → master.
  // Trigger() sets the panner per hit. No echo bus — the φ-driven swing literally
  // delays the trigger time (see sequencer.ts), heard as a single shifted hit.
  beatBus = new Tone.Gain(BEAT_GAIN).connect(getMasterIn());
  filters.kick = makeFilter('kick');
  synths.kick = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.4 }
  }).connect(filters.kick);

  filters.snare = makeFilter('snare');
  synths.snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0 }
  }).connect(filters.snare);

  filters.hihat = makeFilter('hihat');
  synths.hihat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.08, release: 0.02 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5
  }).connect(filters.hihat);
  (synths.hihat as Tone.MetalSynth).volume.value = -18;

  filters.tom = makeFilter('tom');
  synths.tom = new Tone.MembraneSynth({
    pitchDecay: 0.08,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.5, sustain: 0 }
  }).connect(filters.tom);

  filters.rim = makeFilter('rim');
  synths.rim = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.03, release: 0.01 },
    harmonicity: 12,
    modulationIndex: 25,
    resonance: 7000,
    octaves: 0.5
  }).connect(filters.rim);
  (synths.rim as Tone.MetalSynth).volume.value = -16;

  filters.clap = makeFilter('clap');
  synths.clap = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.002, decay: 0.25, sustain: 0 }
  }).connect(filters.clap);

  filters.bass = makeFilter('bass');
  synths.bass = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.4 },
    filter: { Q: 2, type: 'lowpass', rolloff: -24 },
    filterEnvelope: {
      attack: 0.001,
      decay: 0.2,
      sustain: 0.4,
      release: 0.4,
      baseFrequency: 200,
      octaves: 2
    }
  }).connect(filters.bass);

  filters.pluck = makeFilter('pluck');
  synths.pluck = new Tone.PluckSynth().connect(filters.pluck);

  filters.pad = makeFilter('pad');
  synths.pad = new Tone.PolySynth(Tone.Synth, {
    envelope: { attack: 0.3, decay: 0.3, sustain: 0.6, release: 1.2 }
  }).connect(filters.pad);
  (synths.pad as Tone.PolySynth).volume.value = -14;

  filters.bell = makeFilter('bell');
  synths.bell = new Tone.FMSynth({
    harmonicity: 3.01,
    modulationIndex: 14,
    envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1.5 }
  }).connect(filters.bell);
  (synths.bell as Tone.FMSynth).volume.value = -8;
}

export async function ensureStarted(): Promise<void> {
  if (started) return;
  await Tone.start();
  initMaster(); // master FX bus must exist before the voices connect to it
  build();
  setMasterVolume(masterVolume); // apply the current master level to the live graph
  started = true;
}

/**
 * Schedule a single hit.
 *
 * @param when       audio-context time (seconds) — use `now() + offset`
 * @param velocity   loudness 0..1 (caller can keep this constant; purity controls timbre)
 * @param pitchMidi  optional MIDI note for melodic voices
 * @param purity     Bloch-vector length r ∈ [0,1]; drives the low-pass cutoff
 * @param pan        stereo position -1 (left) .. +1 (right) for this hit
 */
export function trigger(
  sound: SoundName,
  when: number,
  velocity: number,
  pitchMidi?: number,
  purity = 1,
  pan = 0
): void {
  const inst = synths[sound];
  if (!inst) return;
  const v = Math.max(0.05, Math.min(1, velocity));

  // Ensure strictly-increasing schedule times per voice (Web Audio constraint).
  // Floor against `now + 0.01` so we don't fall behind the audio clock either.
  const earliest = Math.max(when, Tone.now() + 0.01, lastTime[sound] + 0.001);
  const safeWhen = earliest;
  lastTime[sound] = safeWhen;

  const filt = filters[sound];
  if (filt) {
    filt.frequency.setValueAtTime(filterFreqForPurity(purity), safeWhen);
  }
  const pnr = panners[sound];
  if (pnr) pnr.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), safeWhen);

  switch (sound) {
    case 'kick':
      (inst as Tone.MembraneSynth).triggerAttackRelease('C2', '8n', safeWhen, v);
      return;
    case 'tom':
      (inst as Tone.MembraneSynth).triggerAttackRelease('A2', '8n', safeWhen, v);
      return;
    case 'snare':
    case 'clap':
      (inst as Tone.NoiseSynth).triggerAttackRelease('16n', safeWhen, v);
      return;
    case 'hihat':
      // MetalSynth signature: (note, duration, time, velocity). Without a note
      // it can't produce sound — the previous 3-arg call silently mis-parsed.
      (inst as Tone.MetalSynth).triggerAttackRelease('C6', '32n', safeWhen, v);
      return;
    case 'rim':
      (inst as Tone.MetalSynth).triggerAttackRelease('A5', '32n', safeWhen, v);
      return;
    case 'bass':
    case 'pluck':
    case 'bell': {
      const freq = pitchMidi !== undefined ? midiToFreq(pitchMidi) : midiToFreq(48);
      (inst as Tone.MonoSynth | Tone.PluckSynth | Tone.FMSynth).triggerAttackRelease(
        freq,
        '8n',
        safeWhen,
        v
      );
      return;
    }
    case 'pad': {
      const freq = pitchMidi !== undefined ? midiToFreq(pitchMidi) : midiToFreq(60);
      (inst as Tone.PolySynth).triggerAttackRelease(freq, '4n', safeWhen, v);
      return;
    }
  }
}

export function now(): number {
  return Tone.now();
}

export function audioReady(): boolean {
  return started;
}
