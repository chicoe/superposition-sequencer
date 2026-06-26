/**
 * Shot playback loop. Runs while `isPlaying` is true; at each beat:
 *
 * Preview mode (no computedRun): samples one outcome from the live
 *   statevector at the current step (preserves entanglement) — what the user
 *   hears is a fresh local simulation.
 *
 * Run mode (computedRun is set): replays bitstrings from the frozen run's
 *   memory in order, looping. The audio reflects exactly what the chosen
 *   backend returned. Step navigation no longer drives playback in this
 *   mode (a run is the final-step measurement of the whole circuit), so the
 *   Bloch / filter parameters come from the final step.
 *
 * Either way, each qubit fires iff its bit in the outcome is 0 (|0⟩ ⇒ fire).
 */
import { get } from 'svelte/store';

import { circuit, currentStep, numSteps } from '$lib/stores/circuit';
import { allSteps } from '$lib/stores/quantum';
import {
  bpm,
  epochStartIndex,
  isPlaying,
  mode,
  pushShots,
  shotHistory,
  shotsPerStep
} from '$lib/stores/playback';
import { sounds } from '$lib/stores/sounds';
import { computedRun, computedSteps } from '$lib/stores/run';
import { trackModes, isOscMode } from '$lib/stores/trackModes';
import { trackWaves } from '$lib/stores/trackWaves';
import { trackOctaves } from '$lib/stores/trackOctaves';
import { ensureStarted, now, trigger } from './engine';
import {
  setOscAmplitude,
  setOscPitch,
  setOscPurity,
  setOscPan,
  startOsc,
  stopAllOsc,
  stopOsc
} from './oscillators';
import { stereoSeparation, panForQubit } from '$lib/stores/effects';
import { stopAllRingMods, updateRingMods, type ActiveRing } from './ringMod';
import { triggerBeatRing, stopAllBeatRings } from './beatRing';
import { empiricalMIMatrix } from '$lib/quantum/empiricalMI';
import { bitAt, sampleCorrelated, swingOffset, MAX_SWING } from '$lib/quantum/blochMath';
import { generateScale, pitchForOutcome, midiToFreq } from './scales';
import { noteForOutcome } from '$lib/quantum/midiNotes';
import { pairCCs, ccValue } from '$lib/quantum/midiCC';
import { liveMidiEnabled } from '$lib/stores/midiOut';
import { trackChannels } from '$lib/stores/trackChannels';
import { sendCC, sendNote, allNotesOff, resetCCCache, hasOutput } from '$lib/midi/output';
import type { ShotRecord, SoundName } from '$lib/types';

const MELODIC_SOUNDS = new Set<SoundName>(['bass', 'pluck', 'pad', 'bell']);

let timer: ReturnType<typeof setTimeout> | null = null;
let shotsAtCurrentStep = 0;
// One replay cursor per computed step, so each step's frozen memory advances
// independently as it's revisited.
let runCursors: Record<number, number> = {};

export async function startPlayback(): Promise<void> {
  if (get(isPlaying)) return;
  await ensureStarted();
  isPlaying.set(true);
  shotsAtCurrentStep = 0;
  runCursors = {};
  resetCCCache(); // re-emit all CCs from the first beat of this run
  scheduleNext();
}

/** Reset the per-step run-replay cursors (e.g. when a new run is loaded). */
export function resetRunCursor(): void {
  runCursors = {};
}

export function stopPlayback(): void {
  isPlaying.set(false);
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  stopAllOsc();
  stopAllRingMods();
  stopAllBeatRings();
  // Silence any held external notes and forget the last-sent CC values so the
  // next run re-emits from scratch. No-ops when no MIDI port is selected.
  allNotesOff();
  resetCCCache();
}

// Threshold above which a pair's empirical mutual information (bits) is
// "entangled enough" to ring-modulate. MI is 0..1 bit between two binary
// vars; 0.35 catches moderate correlation without firing on shot noise.
const RING_THRESHOLD = 0.35;

// Whenever a track leaves oscillator mode, kill its oscillator so we don't
// leave a drone running. Subscribed once at module load.
let lastModes: string[] = [];
trackModes.subscribe((modes) => {
  for (let q = 0; q < modes.length; q++) {
    const was = lastModes[q] as 'none' | 'beat' | 'gated' | 'drone' | undefined;
    const wasOsc = was === 'gated' || was === 'drone';
    const nowOsc = isOscMode(modes[q]);
    if (wasOsc && !nowOsc) stopOsc(q);
  }
  // Also stop osc for any qubit no longer in the modes array (e.g. shrunk).
  for (let q = modes.length; q < lastModes.length; q++) stopOsc(q);
  lastModes = modes.slice();
});

// How many recent shots to read as a binary index into the scale. Larger
// values yield more variety but slower convergence after a step change.
const PITCH_LOOKBACK = 4;

function pitchFromHistory(
  row: { triggered: boolean }[],
  currentTriggered: boolean,
  scaleNotes: number[]
): number {
  if (scaleNotes.length === 0) return 60;
  const tail = row.slice(-(PITCH_LOOKBACK - 1));
  let idx = 0;
  for (const r of tail) idx = (idx << 1) | (r.triggered ? 1 : 0);
  // Fold in the current shot as the LSB so the pitch updates on this beat.
  idx = (idx << 1) | (currentTriggered ? 1 : 0);
  return scaleNotes[idx % scaleNotes.length];
}

function scheduleNext(): void {
  if (!get(isPlaying)) return;
  const interval = 60 / get(bpm);
  fireOneShot(interval);
  // Use Tone-context time for audio; setTimeout only paces *when we decide to fire*.
  // Tone scheduler handles audio-accurate timing inside the trigger() call.
  timer = setTimeout(scheduleNext, interval * 1000);
}

function fireOneShot(beatInterval: number): void {
  const c = get(circuit);
  const run = get(computedRun);
  const states = get(allSteps);

  // Runs are per-step now: visualise the CURRENT step and, if that step has a
  // computed run, replay its frozen memory; otherwise sample the live
  // statevector. So computed steps play the backend result and uncomputed steps
  // preview live, even with a run loaded.
  const step = get(currentStep);
  const state = states[step];
  if (!state) return;

  const stepRun = run?.steps[step];
  let outcome: string;
  let source: ShotRecord['source'];
  if (stepRun && stepRun.memory.length > 0) {
    const cur = runCursors[step] ?? 0;
    outcome = stepRun.memory[cur % stepRun.memory.length].padStart(c.num_qubits, '0');
    runCursors[step] = cur + 1;
    source = stepRun.backend;
  } else {
    outcome = sampleCorrelated(state.statevector, c.num_qubits);
    source = 'preview';
  }

  const assignments = get(sounds).assignments;
  const scaleNotes = generateScale(get(sounds).rootNote, get(sounds).scale, 2);
  const modes = get(trackModes);
  const waves = get(trackWaves);
  const octaves = get(trackOctaves);
  const history = get(shotHistory);
  const epoch = get(epochStartIndex);

  // Real-time MIDI: only when the toggle is on AND a port is selected. Notes are
  // pre-scheduled in the performance.now() domain; shifting all hits forward by
  // MAX_SWING keeps every offset >= 0 (in the future) while preserving the
  // relative swing between tracks.
  const liveMidi = get(liveMidiEnabled) && hasOutput();
  const channels = liveMidi ? get(trackChannels) : null;
  const midiBaseMs = performance.now();
  const beatMs = beatInterval * 1000;

  const baseTime = now();
  const records: ShotRecord[] = [];
  // Per-qubit gate state for oscillator voices (gated: open only when this shot
  // fires; drone: always open). The ring mod is gated by this too, so a closed
  // voice can't leak a continuous ring tone when nothing fired.
  const oscGateOpen: boolean[] = [];
  // Captured per qubit so the beat-ring layer (scheduled after the MI matrix is
  // computed) can fire at each hit's swing-adjusted time.
  const swingByQ: number[] = [];
  const triggeredByQ: boolean[] = [];
  const sep = get(stereoSeparation); // stereo spread amount, applied per qubit

  for (let q = 0; q < c.num_qubits; q++) {
    const bv = state.bloch_vectors[q];
    const bit = bitAt(outcome, q);
    const triggered = bit === 0; // |0⟩ → fire (spec §3)
    const swing = swingOffset(bv.phi);
    triggeredByQ[q] = triggered;
    swingByQ[q] = swing;
    const pan = panForQubit(q, c.num_qubits, sep);
    // Velocity is constant — `r` (purity) modulates the low-pass filter instead.
    // Pure state (r→1) opens the filter wide; mixed/entangled (r→0) sounds distant.
    const velocity = 0.85;
    const purity = Math.max(0, Math.min(1, bv.r));
    const sound = assignments[q] ?? 'kick';
    const trackMode = modes[q] ?? 'beat';

    if (trackMode === 'none') {
      // Silent track. Still log a (silent) shot so the timeline stays in
      // step across all qubits.
      records.push({
        step,
        triggered: false,
        swing,
        phi: bv.phi,
        velocity: 0,
        time: performance.now(),
        source
      });
    } else if (trackMode === 'beat') {
      if (triggered) {
        const sched = baseTime + swing * beatInterval;
        const pitch = MELODIC_SOUNDS.has(sound)
          ? pitchForOutcome(outcome, scaleNotes)
          : undefined;
        trigger(sound, sched, velocity, pitch, purity, pan);

        records.push({
          step,
          triggered: true,
          swing,
          phi: bv.phi,
          velocity: purity, // store purity so the timeline dot size reflects timbre
          pitch,
          time: performance.now(),
          source
        });
      } else {
        records.push({
          step,
          triggered: false,
          swing,
          phi: bv.phi,
          velocity: purity,
          time: performance.now(),
          source
        });
      }
    } else {
      // Oscillator mode (drone or gated). Ensure the channel is running on
      // the chosen wave, pitch via a rolling read of this qubit's recent
      // shots, amplitude from the running trigger rate, gate from the
      // current beat (always-open for drone).
      const wave = waves[q] ?? 'sine';
      const row = history[q] ?? [];
      const basePitch = pitchFromHistory(row, triggered, scaleNotes);
      const pitch = basePitch + (octaves[q] ?? 0) * 12;
      startOsc(q, pitch, wave);
      setOscPitch(q, pitch);
      setOscPurity(q, purity);
      setOscPan(q, pan);

      // Constant amplitude — drone plays at full level continuously; gated
      // plays at full level only when the current shot's bit fires.
      const gateOpen = trackMode === 'drone' ? true : triggered;
      oscGateOpen[q] = gateOpen;
      setOscAmplitude(q, 1, gateOpen);

      records.push({
        step,
        triggered,
        swing,
        phi: bv.phi,
        velocity: purity,
        pitch,
        time: performance.now(),
        source
      });
    }

    // Real-time MIDI: one note per measured |0⟩ on this qubit's channel,
    // regardless of track mode (osc/ring-mod stay internal — the MI CCs below
    // carry the entanglement). Same GM note mapping as the file export.
    if (liveMidi && triggered && channels) {
      const note = noteForOutcome(sound, outcome, scaleNotes);
      if (note !== null) {
        sendNote(
          channels[q] ?? q + 1,
          note,
          100,
          midiBaseMs + (swing + MAX_SWING) * beatMs,
          beatMs * 0.5
        );
      }
    }
  }

  pushShots(records);
  shotsAtCurrentStep += 1;

  // Empirical MI matrix — shared by the ring-mod sidechains AND the live-MIDI
  // CCs. Computed once here (after pushShots, so it reflects this beat) whenever
  // either path needs it; for up to 8 qubits each call is sub-millisecond.
  const oscQubits: number[] = [];
  for (let q = 0; q < c.num_qubits; q++) {
    if (isOscMode(modes[q] ?? 'beat')) oscQubits.push(q);
  }
  // Compute it whenever there's a pair to correlate — the osc ring mod, the
  // beat ring, and the live-MIDI CCs all read from it (and it's sub-millisecond).
  let mi: number[][] | null = null;
  if (c.num_qubits >= 2) {
    mi = empiricalMIMatrix(get(shotHistory), get(epochStartIndex), c.num_qubits);
  }

  // Ring-mod sidechains for entangled oscillator-mode pairs. Strength tracks
  // the same empirical MI shown in the matrix panel, so ring mod fades in as
  // measured correlation accumulates and fades out when it doesn't.
  const active: ActiveRing[] = [];
  if (mi && oscQubits.length >= 2) {
    for (let a = 0; a < oscQubits.length; a++) {
      for (let b = a + 1; b < oscQubits.length; b++) {
        const i = oscQubits[a];
        const j = oscQubits[b];
        const v = mi[i][j];
        // Gate the ring tone by the voices it modulates: audible only while BOTH
        // are open, so a gated pair falls silent on shots where neither fires
        // (otherwise the ring taps the still-running oscillators and drones on).
        if (v >= RING_THRESHOLD)
          active.push({
            i,
            j,
            strength: v,
            gateOpen: oscGateOpen[i] === true && oscGateOpen[j] === true,
            pan: (panForQubit(i, c.num_qubits, sep) + panForQubit(j, c.num_qubits, sep)) / 2
          });
      }
    }
  }
  updateRingMods(active);

  // Beat ring: an entangled BEAT hit gets a percussive ring-mod ping — a
  // metallic, measured-pitch clang layered over the clean drum, scaled by the
  // qubit's strongest pairwise MI. Independent beats stay clean; entangled ones
  // turn clangy, which makes "this beat is entangled" audible. (Oscillator
  // voices have their own ring mod above, so they're skipped here.)
  if (mi) {
    const pitchHz = midiToFreq(pitchForOutcome(outcome, scaleNotes));
    for (let q = 0; q < c.num_qubits; q++) {
      if ((modes[q] ?? 'beat') !== 'beat' || !triggeredByQ[q]) continue;
      let best = 0;
      for (let p = 0; p < c.num_qubits; p++) {
        if (p !== q && mi[q][p] > best) best = mi[q][p];
      }
      if (best < RING_THRESHOLD) continue;
      // carrier = measured pitch; modulator = an inharmonic ratio of it (→ metallic).
      triggerBeatRing(
        q,
        baseTime + swingByQ[q] * beatInterval,
        pitchHz,
        pitchHz * 1.414,
        best,
        panForQubit(q, c.num_qubits, sep)
      );
    }
  }

  // Live MIDI: emit each pair's entanglement as a CC on BOTH qubits' channels
  // (sendCC dedupes, so unchanged values and shared channels are no-ops).
  // External synths can map these to a filter to stand in for the ring mod.
  if (liveMidi && mi && channels) {
    for (const { i, j, cc } of pairCCs(c.num_qubits)) {
      const val = ccValue(mi[i][j]);
      sendCC(channels[i] ?? i + 1, cc, val);
      sendCC(channels[j] ?? j + 1, cc, val);
    }
  }

  // Auto-advance. With a run loaded, cycle ONLY the computed steps (so playback
  // stays on what the backend actually measured); otherwise step through all.
  if (get(mode) === 'auto' && shotsAtCurrentStep >= get(shotsPerStep)) {
    shotsAtCurrentStep = 0;
    const computed = get(computedSteps);
    if (computed.length > 0) {
      const idx = computed.indexOf(step);
      currentStep.set(computed[(idx + 1) % computed.length]);
    } else {
      const total = get(numSteps);
      currentStep.update((s) => (s + 1) % total);
    }
  }
}

export function noteStepChanged(): void {
  shotsAtCurrentStep = 0;
}
