/**
 * In-flight drag from the toolbox onto the circuit.
 * The GatePalette starts the drag, a ghost element follows the cursor in
 * +page.svelte, and CircuitDiagram's cells listen for the drop to place a
 * new gate at the target (step, qubit).
 */
import { writable } from 'svelte/store';
import type { GateName } from '$lib/types';

export interface PaletteDragState {
  gate: GateName;
  x: number; // current pointer position, viewport (clientX/Y)
  y: number;
}

export const paletteDrag = writable<PaletteDragState | null>(null);
