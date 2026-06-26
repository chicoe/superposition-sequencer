/**
 * Generate a self-contained Qiskit + MIDI script from the current circuit.
 *
 * Targets qollab.xyz — `backend` is a pre-injected global. To maximize
 * compatibility we stay very close to the qollab boilerplate style: top-level
 * statements, no docstrings, no nested function imports, no module-constant
 * defaults in function signatures. MIDI is written byte-by-byte (no `mido`
 * dependency) so the script works in any plain-Python environment.
 */
import type { CircuitSpec, Gate, SoundName } from '$lib/types';
import type { SoundConfig } from '$lib/stores/sounds';
import { MI_CC_BASE, ccMapText } from './midiCC';

function gateToCall(g: Gate): string | null {
  const n = g.gate;
  if (['h', 'x', 'y', 'z', 's', 't', 'sdg', 'tdg'].includes(n)) {
    return `circuit.${n}(${g.qubit})`;
  }
  if (n === 'rx' || n === 'ry') {
    return `circuit.${n}(${(g.params?.theta ?? 0).toFixed(6)}, ${g.qubit})`;
  }
  if (n === 'rz') {
    return `circuit.rz(${(g.params?.phi ?? 0).toFixed(6)}, ${g.qubit})`;
  }
  if (n === 'cnot' || n === 'cx') return `circuit.cx(${g.control}, ${g.target})`;
  if (n === 'cz') return `circuit.cz(${g.control}, ${g.target})`;
  if (n === 'swap') return `circuit.swap(${g.qubit1}, ${g.qubit2})`;
  return null;
}

function formatSoundsDict(assignments: Record<number, SoundName>): string {
  const entries = Object.entries(assignments)
    .map(([q, s]) => `    ${q}: ${JSON.stringify(s)},`)
    .join('\n');
  return entries || '    # no assignments';
}

function formatChannelsDict(channels: number[], numQubits: number): string {
  const lines: string[] = [];
  for (let q = 0; q < numQubits; q++) {
    lines.push(`    ${q}: ${channels[q] ?? q + 1},`);
  }
  return lines.join('\n') || '    # one channel per qubit';
}

const SCALE_STEPS: Record<string, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  minor_pentatonic: [0, 3, 5, 7, 10],
  major_pentatonic: [0, 2, 4, 7, 9],
  whole_tone: [0, 2, 4, 6, 8, 10],
  blues: [0, 3, 5, 6, 7, 10]
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteToMidi(note: string): number {
  const name = note[0].toUpperCase();
  let rest = note.slice(1);
  let acc = 0;
  if (rest[0] === '#' || rest[0] === 'b') {
    acc = rest[0] === '#' ? 1 : -1;
    rest = rest.slice(1);
  }
  const octave = parseInt(rest, 10);
  return 12 * (octave + 1) + NOTE_NAMES.indexOf(name) + acc;
}

function buildScale(root: string, scale: string, octaves = 2): number[] {
  const steps = SCALE_STEPS[scale] ?? SCALE_STEPS.chromatic;
  const rootMidi = noteToMidi(root);
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const s of steps) out.push(rootMidi + 12 * o + s);
  }
  return out;
}

export interface CodegenInput {
  spec: CircuitSpec;
  sounds: SoundConfig;
  bpm: number;
  shotsPerStep?: number;
  mode: 'manual' | 'auto';
  currentStep: number;
  /** Per-qubit MIDI channel (1..16). Defaults to one channel per qubit. */
  channels?: number[];
}

export function generateQiskitCode({
  spec,
  sounds,
  bpm,
  shotsPerStep = 16,
  mode,
  currentStep,
  channels = []
}: CodegenInput): string {
  const { num_qubits, num_steps, gates } = spec;
  const isManual = mode === 'manual';
  const safeCurrent = Math.max(0, Math.min(currentStep, num_steps - 1));

  const scaleNotes = buildScale(sounds.rootNote, sounds.scale, 2);
  const soundsDict = formatSoundsDict(sounds.assignments);
  const channelsDict = formatChannelsDict(channels, num_qubits);
  const ccMap = ccMapText(num_qubits);

  // Gates grouped by step
  const byStep = new Map<number, string[]>();
  for (const g of gates) {
    const call = gateToCall(g);
    if (!call) continue;
    if (!byStep.has(g.step)) byStep.set(g.step, []);
    byStep.get(g.step)!.push(call);
  }

  // For manual mode: emit only the gates up to currentStep, as a flat top-level
  // sequence (mirrors the boilerplate's "circuit.h(0); circuit.cx(0,1)" style).
  // For auto mode: same flat sequence but emit all gates; the script runs the
  // full circuit once at the end (we drop the per-step structure here, since
  // the per-step structure is what was triggering the qollab parser).
  const upTo = isManual ? safeCurrent : num_steps - 1;
  const gateLines: string[] = [];
  for (let s = 0; s <= upTo; s++) {
    const calls = byStep.get(s) ?? [];
    for (const c of calls) gateLines.push(c);
  }
  const gatesBlock = gateLines.length > 0 ? gateLines.join('\n') : '# (no gates)';

  const totalShots = isManual ? bpm : bpm; // both modes: ~1 minute at BPM
  const stepNote = isManual
    ? `# Manual mode: running gates up through layer ${safeCurrent + 1}.`
    : `# Auto mode: running the full circuit (layers 1..${num_steps}).`;

  return `# NOTE: 'backend' is pre-created as a global variable

from qiskit import QuantumCircuit
from qiskit.providers.jobstatus import JobStatus
import time
import struct
import base64
import random
import math

# === output flags ===
# SAVE_FILE     : write the .mid file to disk (off by default — qollab's
#                 sandbox blocks file writes; flip to True locally).
# INLINE_BASE64 : print the MIDI bytes as a base64 block at the end of the
#                 output so you can copy/paste it and decode locally.
SAVE_FILE = False
INLINE_BASE64 = True

${stepNote}
# Each shot becomes one beat in the MIDI output. ${totalShots} shots ~= 1 minute at ${bpm} BPM.
#
# qollab's backend wrapper doesn't preserve memory=True, so we work from
# get_counts() and reconstruct an ordered shot list by replicating each
# outcome by its count, then shuffling. The aggregate distribution matches
# what real per-shot memory would produce; only the precise sample order
# differs from a true live readout.

NUM_QUBITS = ${num_qubits}
BPM = ${bpm}
SHOTS = ${totalShots}

# qubit index -> instrument label
SOUNDS = {
${soundsDict}
}

# qubit index -> MIDI channel (1..16). One channel per qubit by default.
CHANNELS = {
${channelsDict}
}

# General-MIDI drum notes
DRUM_NOTES = {'kick': 36, 'snare': 38, 'hihat': 42, 'tom': 41, 'rim': 37, 'clap': 39}
MELODIC = {'bass', 'pluck', 'pad', 'bell'}

# Entanglement -> MIDI CC: each qubit pair's mutual information (bits, 0..1) is
# written as a CC value 0..127, mirrored onto BOTH qubits' channels, so an
# external synth can map it to a filter (it stands in for the ring modulator,
# which can't be encoded in MIDI). Map for this circuit:
#   ${ccMap || '(single qubit — no pairs)'}
MI_CC_BASE = ${MI_CC_BASE}

# Scale built from rootNote=${JSON.stringify(sounds.rootNote)} scale=${JSON.stringify(sounds.scale)}
SCALE = [${scaleNotes.join(', ')}]

# Build the circuit
circuit = QuantumCircuit(NUM_QUBITS, NUM_QUBITS)
${gatesBlock}
circuit.measure(range(NUM_QUBITS), range(NUM_QUBITS))

print(circuit)
print("Entanglement CC map: ${ccMap || '(single qubit — no pairs)'}")


def main(shots = SHOTS, output_path = "output.mid"):
    job = backend.run(circuit, shots=shots)

    while True:
        status = job.status()
        print(f"Job status is {status}")
        if status is JobStatus.DONE:
            break
        if status is JobStatus.ERROR or status is JobStatus.CANCELLED:
            raise RuntimeError("job did not complete")
        time.sleep(10)

    counts = job.get_counts()
    print(f"Counts: {counts}")

    # Replicate each outcome by its count, then shuffle so identical outcomes
    # aren't all clumped together at the start of the MIDI timeline.
    shots_list = []
    for bs, c in counts.items():
        shots_list.extend([bs.replace(' ', '')] * c)
    random.shuffle(shots_list)
    print(f"Reconstructed {len(shots_list)} shots from counts")

    write_midi(shots_list, output_path)


def write_midi(memory, output_path):
    # Pure-stdlib MIDI writer (no mido / pretty_midi dependency).
    TICKS = 480
    NOTE_LEN = 120  # 16th-note tail
    MICROS_PER_BEAT = int(60000000 / BPM)

    def vlq(n):
        # MIDI variable-length quantity
        out = [n & 0x7F]
        n >>= 7
        while n > 0:
            out.insert(0, (n & 0x7F) | 0x80)
            n >>= 7
        return bytes(out)

    def meta_tempo(micros):
        return vlq(0) + b"\\xff\\x51\\x03" + micros.to_bytes(3, "big")

    def meta_track_name(name):
        nb = name.encode("ascii", "ignore")
        return vlq(0) + b"\\xff\\x03" + vlq(len(nb)) + nb

    def end_of_track():
        return vlq(0) + b"\\xff\\x2f\\x00"

    def note_on(delta, channel, note, vel):
        return vlq(delta) + bytes([0x90 | (channel & 0x0F), note & 0x7F, vel & 0x7F])

    def note_off(delta, channel, note):
        return vlq(delta) + bytes([0x80 | (channel & 0x0F), note & 0x7F, 0])

    def control_change(delta, channel, cc, value):
        return vlq(delta) + bytes([0xB0 | (channel & 0x0F), cc & 0x7F, value & 0x7F])

    def pair_mi(mem, a, b):
        # Classical mutual information (bits) between qubits a and b over all shots.
        n = len(mem)
        if n < 2:
            return 0.0
        c = {(0, 0): 0, (0, 1): 0, (1, 0): 0, (1, 1): 0}
        for outcome in mem:
            xa = 0 if (a < len(outcome) and outcome[-1 - a] == "0") else 1
            xb = 0 if (b < len(outcome) and outcome[-1 - b] == "0") else 1
            c[(xa, xb)] += 1
        mi = 0.0
        for (xa, xb), cnt in c.items():
            if cnt == 0:
                continue
            pxy = cnt / n
            px = (c[(xa, 0)] + c[(xa, 1)]) / n
            py = (c[(0, xb)] + c[(1, xb)]) / n
            if pxy > 0 and px > 0 and py > 0:
                mi += pxy * math.log2(pxy / (px * py))
        return max(0.0, mi)

    tracks = []

    # Tempo track
    tempo_data = meta_tempo(MICROS_PER_BEAT) + end_of_track()
    tracks.append(tempo_data)

    # One track per qubit
    for q in range(NUM_QUBITS):
        sound = SOUNDS.get(q, "kick")
        if sound == "none":
            tracks.append(meta_track_name(f"q{q}-none") + end_of_track())
            continue
        channel = CHANNELS.get(q, q + 1) - 1

        events = [meta_track_name(f"q{q}-{sound}")]
        last_tick = 0
        for beat, outcome in enumerate(memory):
            bit = outcome[-1 - q] if q < len(outcome) else "1"
            if bit != "0":
                continue
            if sound in MELODIC:
                pitch = SCALE[int(outcome, 2) % len(SCALE)]
            else:
                pitch = DRUM_NOTES.get(sound, 36)
            on_tick = beat * TICKS
            off_tick = on_tick + NOTE_LEN
            events.append(note_on(on_tick - last_tick, channel, pitch, 100))
            events.append(note_off(NOTE_LEN, channel, pitch))
            last_tick = off_tick
        events.append(end_of_track())
        tracks.append(b"".join(events))

    # Entanglement CC track: one CC per qubit pair (its mutual information over
    # all shots -> 0..127), mirrored onto both qubits' channels, emitted at tick 0.
    if NUM_QUBITS > 1:
        cc_events = [meta_track_name("entanglement-cc")]
        cc = MI_CC_BASE
        for i in range(NUM_QUBITS):
            for j in range(i + 1, NUM_QUBITS):
                val = max(0, min(127, round(pair_mi(memory, i, j) * 127)))
                ci = CHANNELS.get(i, i + 1) - 1
                cj = CHANNELS.get(j, j + 1) - 1
                for ch in ([ci] if ci == cj else [ci, cj]):
                    cc_events.append(control_change(0, ch, cc, val))
                cc += 1
        cc_events.append(end_of_track())
        tracks.append(b"".join(cc_events))

    # Header chunk: format 1, ntrks, division (ticks per quarter)
    header_body = struct.pack(">HHH", 1, len(tracks), TICKS)
    out = b"MThd" + struct.pack(">I", 6) + header_body
    for chunk in tracks:
        out += b"MTrk" + struct.pack(">I", len(chunk)) + chunk

    if SAVE_FILE:
        try:
            with open(output_path, "wb") as f:
                f.write(out)
            print(f"MIDI saved to file: {output_path} ({len(out)} bytes)")
        except Exception as e:
            print(f"(could not write file: {e})")

    if INLINE_BASE64:
        b64 = base64.b64encode(out).decode("ascii")
        print()
        print("=== MIDI BASE64 (" + str(len(out)) + " bytes) ===")
        print("Copy the lines between BEGIN_MIDI_B64 / END_MIDI_B64 (markers excluded)")
        print("and decode them into a real .mid file. Pick whichever fits your OS:")
        print()
        print("# Clipboard-based -- paste the block first, then run one of these:")
        print("  macOS    :  pbpaste | base64 -D > output.mid")
        print("  Linux    :  xclip -selection clipboard -o | base64 -d > output.mid")
        print("              (Wayland: wl-paste | base64 -d > output.mid)")
        print("  Windows  :  powershell -c \\"[IO.File]::WriteAllBytes('output.mid', [Convert]::FromBase64String((Get-Clipboard) -join ''))\\"")
        print()
        print("# File-based (cross-platform) -- save the block as midi.b64 first:")
        print("  python3 -c \\"import base64; open('output.mid','wb').write(base64.b64decode(open('midi.b64').read()))\\"")
        print()
        print("BEGIN_MIDI_B64")
        for i in range(0, len(b64), 76):
            print(b64[i:i + 76])
        print("END_MIDI_B64")


main()
`;
}
