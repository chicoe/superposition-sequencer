/**
 * Single source of truth for gate metadata — short label, full name, and a
 * one-line description of what the gate does and how it maps to the music.
 * Shared by the toolbox, circuit diagram, and tooltip.
 */
import type { GateName } from '$lib/types';

export interface GateInfo {
  label: string;
  full: string;
  desc: string;
}

export const GATE_INFO: Record<GateName, GateInfo> = {
  h: {
    label: 'H',
    full: 'Hadamard',
    desc: 'Puts a qubit in equal superposition — 50/50 trigger probability, maximum uncertainty per shot.'
  },
  x: {
    label: 'X',
    full: 'Pauli-X (NOT)',
    desc: 'Bit flip — inverts trigger probability. A |0⟩ track becomes a steady rest, a |1⟩ track fires every beat.'
  },
  y: {
    label: 'Y',
    full: 'Pauli-Y',
    desc: 'Bit flip with a π/2 phase kick — flips the trigger and shifts the swing.'
  },
  z: {
    label: 'Z',
    full: 'Pauli-Z',
    desc: 'π phase flip — leaves the trigger probability alone but inverts the swing direction.'
  },
  s: {
    label: 'S',
    full: 'Phase (S)',
    desc: 'π/2 rotation around Z — a moderate groove shift in the swing.'
  },
  t: {
    label: 'T',
    full: 'T gate (π/4)',
    desc: 'π/4 rotation around Z — a subtle groove shift in the swing.'
  },
  sdg: {
    label: 'S†',
    full: 'S-dagger',
    desc: 'Inverse of S — a −π/2 rotation around Z.'
  },
  tdg: {
    label: 'T†',
    full: 'T-dagger',
    desc: 'Inverse of T — a −π/4 rotation around Z.'
  },
  rx: {
    label: 'Rx',
    full: 'Rotation around X',
    desc: 'Parameterized rotation around the X axis — fine-tune the trigger probability between 0 and 1.'
  },
  ry: {
    label: 'Ry',
    full: 'Rotation around Y',
    desc: 'Parameterized rotation around the Y axis — tune both trigger probability and phase together.'
  },
  rz: {
    label: 'Rz',
    full: 'Rotation around Z',
    desc: 'Parameterized rotation around the Z axis — tune the swing without changing the trigger probability.'
  },
  cnot: {
    label: 'CNOT',
    full: 'Controlled-NOT',
    desc: 'Entangles two tracks — when control fires, the target flips. Creates correlated rhythms with no classical analogue.'
  },
  cx: {
    label: 'CX',
    full: 'Controlled-X',
    desc: 'Same as CNOT — entangles two tracks via a controlled bit flip.'
  },
  cz: {
    label: 'CZ',
    full: 'Controlled-Z',
    desc: 'Phase-based entanglement — when both qubits are |1⟩, applies a π phase. Subtler than CNOT.'
  },
  swap: {
    label: 'SWAP',
    full: 'SWAP',
    desc: "Exchanges two tracks' patterns — useful for routing qubits without changing the entanglement structure."
  }
};

/** Normalize a Gate object to its info entry, e.g. CNOT vs CX collapse to one. */
export function infoFor(name: GateName): GateInfo {
  return GATE_INFO[name];
}
