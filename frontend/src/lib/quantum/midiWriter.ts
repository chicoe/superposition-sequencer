/**
 * Build a Standard MIDI File (format 1) from the current circuit's simulated
 * shot outcomes. The browser already has each step's full statevector from
 * the backend, so we sample shots client-side via `sampleCorrelated` — no
 * round-trip to a real QPU needed for "export now".
 *
 * Output layout matches the Python generator: one track per qubit, drums on
 * MIDI channel 10 (index 9), melodic voices pitched from the active scale.
 */
import { bitAt, sampleCorrelated } from '$lib/quantum/blochMath';
import { generateScale } from '$lib/audio/scales';
import { noteForOutcome } from '$lib/quantum/midiNotes';
import { empiricalMIMatrix } from '$lib/quantum/empiricalMI';
import { pairCCs, ccValue } from '$lib/quantum/midiCC';
import type { CircuitSpec, ShotRecord, SoundName, StepState } from '$lib/types';
import type { SoundConfig } from '$lib/stores/sounds';

const TICKS = 480;
const NOTE_LEN = 120; // 16th-note tail per hit

// ---- byte helpers ---------------------------------------------------------

function vlq(n: number): number[] {
  // MIDI variable-length quantity
  const out = [n & 0x7f];
  let r = n >>> 7;
  while (r > 0) {
    out.unshift((r & 0x7f) | 0x80);
    r >>>= 7;
  }
  return out;
}

function pushVlq(arr: number[], n: number) {
  for (const b of vlq(n)) arr.push(b);
}

function endOfTrack(arr: number[]) {
  pushVlq(arr, 0);
  arr.push(0xff, 0x2f, 0x00);
}

function metaTrackName(arr: number[], name: string) {
  pushVlq(arr, 0);
  arr.push(0xff, 0x03);
  const bytes: number[] = [];
  for (let i = 0; i < name.length; i++) bytes.push(name.charCodeAt(i) & 0x7f);
  pushVlq(arr, bytes.length);
  for (const b of bytes) arr.push(b);
}

function metaTempo(arr: number[], microsPerBeat: number) {
  pushVlq(arr, 0);
  arr.push(0xff, 0x51, 0x03);
  arr.push((microsPerBeat >> 16) & 0xff, (microsPerBeat >> 8) & 0xff, microsPerBeat & 0xff);
}

// ---- main builder ---------------------------------------------------------

export interface MidiExportInput {
  spec: CircuitSpec;
  sounds: SoundConfig;
  bpm: number;
  allSteps: StepState[];
  mode: 'manual' | 'auto';
  currentStep: number;
  shotsPerStep: number;
  /** Per-qubit MIDI channel (1..16). Defaults to one channel per qubit. */
  channels: number[];
}

export function buildMidiBytes(opts: MidiExportInput): Uint8Array {
  const { spec, sounds, bpm, allSteps, mode, currentStep, shotsPerStep, channels } = opts;
  const numQubits = spec.num_qubits;
  const channelOf = (q: number): number => ((channels[q] ?? q + 1) - 1) & 0x0f;

  // Pick which steps to sample, and how many shots each.
  let stepsToSample: number[];
  let shotsPerStepActual: number;
  if (mode === 'manual') {
    const safe = Math.max(0, Math.min(currentStep, spec.num_steps - 1));
    stepsToSample = [safe];
    shotsPerStepActual = bpm; // ~1 minute at the current BPM
  } else {
    stepsToSample = Array.from({ length: spec.num_steps }, (_, i) => i);
    shotsPerStepActual = shotsPerStep;
  }

  // Flat list of per-shot bitstrings, in beat order.
  const shots: string[] = [];
  for (const step of stepsToSample) {
    const state = allSteps[step];
    if (!state) continue;
    for (let i = 0; i < shotsPerStepActual; i++) {
      shots.push(sampleCorrelated(state.statevector, numQubits));
    }
  }

  const scale = generateScale(sounds.rootNote, sounds.scale, 2);
  const microsPerBeat = Math.round(60000000 / bpm);

  // ---- tracks --------------------------------------------------------
  const tracks: number[][] = [];

  // Track 0: tempo
  const tempo: number[] = [];
  metaTempo(tempo, microsPerBeat);
  endOfTrack(tempo);
  tracks.push(tempo);

  // One track per qubit
  for (let q = 0; q < numQubits; q++) {
    const sound = (sounds.assignments[q] ?? 'kick') as SoundName;
    const t: number[] = [];
    metaTrackName(t, `q${q}-${sound}`);

    if (sound !== 'none') {
      const channel = channelOf(q);
      let lastTick = 0;

      for (let beat = 0; beat < shots.length; beat++) {
        const outcome = shots[beat];
        if (bitAt(outcome, q) !== 0) continue; // bit must be 0 to fire

        const pitch = noteForOutcome(sound, outcome, scale);
        if (pitch === null) continue;

        const onTick = beat * TICKS;
        // note_on @ onTick
        pushVlq(t, onTick - lastTick);
        t.push(0x90 | channel, pitch & 0x7f, 100);
        // note_off NOTE_LEN ticks later
        pushVlq(t, NOTE_LEN);
        t.push(0x80 | channel, pitch & 0x7f, 0);
        lastTick = onTick + NOTE_LEN;
      }
    }

    endOfTrack(t);
    tracks.push(t);
  }

  // ---- entanglement CC track ----------------------------------------
  // One CC per qubit pair carries that pair's running mutual information (the
  // value the ring mod uses), mirrored onto BOTH qubits' channels so an external
  // synth on a qubit's channel can map it to a filter. The MI window resets at
  // each step boundary, matching the live readout's per-step epoch.
  if (numQubits > 1) {
    const pairs = pairCCs(numQubits);
    const ct: number[] = [];
    metaTrackName(ct, 'entanglement-cc');
    let lastTick = 0;
    const lastVal = new Map<string, number>(); // `${channel}:${ccNum}` -> last value
    // Per-qubit triggered history (the only field empiricalMIMatrix reads).
    const miHistory: { triggered: boolean }[][] = Array.from({ length: numQubits }, () => []);
    let stepStart = 0; // index where the current sampled step began

    for (let beat = 0; beat < shots.length; beat++) {
      if (shotsPerStepActual > 0 && beat > 0 && beat % shotsPerStepActual === 0) {
        stepStart = beat; // crossed into a new step → reset the MI window
      }
      const outcome = shots[beat];
      for (let q = 0; q < numQubits; q++) {
        miHistory[q].push({ triggered: bitAt(outcome, q) === 0 });
      }
      const mi = empiricalMIMatrix(miHistory as unknown as ShotRecord[][], stepStart, numQubits);
      const onTick = beat * TICKS;
      for (const { i, j, cc: ccNum } of pairs) {
        const val = ccValue(mi[i][j]);
        for (const ch of new Set([channelOf(i), channelOf(j)])) {
          const key = `${ch}:${ccNum}`;
          if (lastVal.get(key) === val) continue; // skip unchanged controllers
          lastVal.set(key, val);
          pushVlq(ct, onTick - lastTick);
          ct.push(0xb0 | ch, ccNum & 0x7f, val & 0x7f);
          lastTick = onTick;
        }
      }
    }
    endOfTrack(ct);
    tracks.push(ct);
  }

  // ---- header + chunks ----------------------------------------------
  const out: number[] = [];
  // 'MThd' + length(6) + format(1) + ntrks + division
  out.push(0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6);
  out.push(0, 1);
  out.push((tracks.length >> 8) & 0xff, tracks.length & 0xff);
  out.push((TICKS >> 8) & 0xff, TICKS & 0xff);

  for (const chunk of tracks) {
    const len = chunk.length;
    out.push(0x4d, 0x54, 0x72, 0x6b);
    out.push((len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
    for (const b of chunk) out.push(b);
  }

  return new Uint8Array(out);
}

export function downloadMidi(bytes: Uint8Array, filename = 'circuit.mid') {
  // Slice to a fresh ArrayBuffer so the BlobPart type doesn't bind to
  // SharedArrayBuffer (TS lib.dom narrowing nit).
  const part = bytes.slice().buffer;
  const blob = new Blob([part], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Firefox finishes the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
