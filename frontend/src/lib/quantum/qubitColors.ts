/**
 * Per-qubit accent colors. Used everywhere a qubit needs a visual handle —
 * Bloch sphere, circuit measurement gate, MI matrix headers, timeline lane
 * and the connector overlay — so the eye can trace a single thread through
 * the whole diagram.
 */
export const QUBIT_COLORS = [
  '#cfe1b6',
  '#a698b0',
  '#c4b896',
  '#7ea0aa',
  '#cfe1b6',
  '#a698b0',
  '#c4b896',
  '#7ea0aa'
];

export function colorFor(qubit: number): string {
  return QUBIT_COLORS[qubit % QUBIT_COLORS.length];
}
