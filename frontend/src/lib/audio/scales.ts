const SCALES: Record<string, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  minor_pentatonic: [0, 3, 5, 7, 10],
  major_pentatonic: [0, 2, 4, 7, 9],
  whole_tone: [0, 2, 4, 6, 8, 10],
  blues: [0, 3, 5, 6, 7, 10]
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteToMidi(note: string): number {
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

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function generateScale(root: string, scale: string, octaves = 2): number[] {
  const steps = SCALES[scale] ?? SCALES.chromatic;
  const rootMidi = noteToMidi(root);
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const s of steps) out.push(rootMidi + 12 * o + s);
  }
  return out;
}

export function pitchForOutcome(outcome: string, scaleNotes: number[]): number {
  if (scaleNotes.length === 0) return 60;
  const idx = outcome ? parseInt(outcome, 2) : 0;
  return scaleNotes[idx % scaleNotes.length];
}
