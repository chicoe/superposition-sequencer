/**
 * Mapping from qubit PAIRS to MIDI CC numbers — the single source of truth
 * shared by the .mid file export (`midiWriter.ts`), the real-time output
 * (`sequencer.ts`), the on-screen CC-map readout, and the generated Python
 * (`qiskitCode.ts` reproduces the same numbering).
 *
 * The instrument ring-modulates entangled oscillator pairs by their empirical
 * mutual information. Ring mod can't be encoded in MIDI, so each pair's MI is
 * emitted as a continuous controller instead — an external synth can map it to
 * a filter to stand in for the ring mod.
 *
 * One CC per pair (i, j) with i < j, numbered from MI_CC_BASE in pair order:
 *   (0,1)->16  (0,2)->17  (0,3)->18  (1,2)->19  (1,3)->20  (2,3)->21  ...
 *
 * 16 is the first General-Purpose controller (16-19) and the block continues
 * into the undefined range (20-31), so it stays clear of common assignments
 * (mod=1, volume=7, pan=10, sustain=64) for the typical 4-qubit / 6-pair case.
 */

/** First CC number used; pairs count up from here in (i<j) order. */
export const MI_CC_BASE = 16;

/** Classical MI between two binary variables is bounded by 1 bit. */
export const MAX_MI_BITS = 1;

export interface PairCC {
  i: number;
  j: number;
  cc: number;
}

/** Every qubit pair (i<j) and the CC number assigned to it. */
export function pairCCs(numQubits: number): PairCC[] {
  const out: PairCC[] = [];
  let cc = MI_CC_BASE;
  for (let i = 0; i < numQubits; i++) {
    for (let j = i + 1; j < numQubits; j++) {
      out.push({ i, j, cc: cc++ });
    }
  }
  return out;
}

/** Quantize a mutual-information value (bits, 0..1) to a 0..127 CC value. */
export function ccValue(mi: number): number {
  const v = Math.max(0, Math.min(MAX_MI_BITS, mi)) / MAX_MI_BITS;
  return Math.max(0, Math.min(127, Math.round(v * 127)));
}

/** Human-readable map, e.g. "CC16=q0:q1, CC17=q0:q2, …" — shown in the UI/code. */
export function ccMapText(numQubits: number): string {
  return pairCCs(numQubits)
    .map((p) => `CC${p.cc}=q${p.i}:q${p.j}`)
    .join(', ');
}
