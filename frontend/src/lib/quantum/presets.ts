import type { CircuitSpec, Gate } from '$lib/types';
import pulseRun from './runs/pulse-run.json';
import entangledPairRun from './runs/entangled-pair-run.json';
import allOrNothingRun from './runs/all-or-nothing-run.json';
import phaseSwingRun from './runs/phase-swing-run.json';
import cascadeRun from './runs/cascade-run.json';

export interface PresetMeta {
  slug: string;
  name: string;
  description: string;
  suggestedBpm: number;
}

export interface Preset extends PresetMeta {
  spec: CircuitSpec;
  /**
   * Optional bundled hardware run (a schema-2 run JSON, the same format the
   * Compute panel exports). When present, selecting the preset auto-loads it and
   * switches to Auto mode so playback cycles the computed steps. To add one:
   * compute every step of the preset on IonQ, Export Run, drop the JSON in
   * `lib/quantum/runs/<slug>.json`, `import` it here, and set `run:` to it.
   */
  run?: unknown;
}

const g = (gate: Gate): Gate => gate;

// Ry angle (radians) that leaves a qubit measuring |0⟩ — i.e. firing — with
// probability `p`. P(|0⟩) = cos²(θ/2), so θ = 2·acos(√p). Lets a preset dial in
// a track's hit density directly instead of guessing angles.
const fire = (p: number): number => 2 * Math.acos(Math.sqrt(p));

export const PRESETS: Preset[] = [
  {
    slug: 'clear',
    name: 'Clear',
    description: 'Empty circuit — start from scratch.',
    suggestedBpm: 110,
    spec: {
      num_qubits: 4,
      num_steps: 4,
      gates: []
    }
  },
  {
    slug: 'pulse',
    name: 'Pulse',
    description:
      'A generative four-track groove: each qubit fires at a different rate — a driving 85% kick down to sparse 25% accents. No two bars the same.',
    suggestedBpm: 122,
    spec: {
      num_qubits: 4,
      num_steps: 4,
      gates: [
        g({ gate: 'ry', qubit: 0, step: 0, params: { theta: fire(0.85) } }),
        g({ gate: 'ry', qubit: 1, step: 0, params: { theta: fire(0.6) } }),
        g({ gate: 'ry', qubit: 2, step: 0, params: { theta: fire(0.45) } }),
        g({ gate: 'ry', qubit: 3, step: 0, params: { theta: fire(0.25) } })
      ]
    },
    run: pulseRun
  },
  {
    slug: 'entangled-pair',
    name: 'Entangled Pair',
    description:
      'q0 & q1 in a Bell state — each 50/50 alone, but they always fire together. q2 and q3 layer an independent half-time pulse over the top.',
    suggestedBpm: 104,
    spec: {
      num_qubits: 4,
      num_steps: 4,
      gates: [
        g({ gate: 'h', qubit: 0, step: 0 }),
        g({ gate: 'cnot', control: 0, target: 1, step: 1 }),
        g({ gate: 'h', qubit: 2, step: 0 }),
        g({ gate: 'ry', qubit: 3, step: 0, params: { theta: fire(0.78) } })
      ]
    },
    run: entangledPairRun
  },
  {
    slug: 'all-or-nothing',
    name: 'All or Nothing',
    description:
      'A 4-qubit GHZ state, woven one CNOT per step. Once entangled, every track hits in unison — or the whole bar drops to silence. Pure quantum lockstep.',
    suggestedBpm: 92,
    spec: {
      num_qubits: 4,
      num_steps: 4,
      gates: [
        g({ gate: 'h', qubit: 0, step: 0 }),
        g({ gate: 'cnot', control: 0, target: 1, step: 1 }),
        g({ gate: 'cnot', control: 1, target: 2, step: 2 }),
        g({ gate: 'cnot', control: 2, target: 3, step: 3 })
      ]
    },
    run: allOrNothingRun
  },
  {
    slug: 'phase-swing',
    name: 'Phase Swing',
    description:
      'All four shimmer at 50%, but Rz phases push each track a different amount ahead of or behind the beat — swing with no classical source.',
    suggestedBpm: 112,
    spec: {
      num_qubits: 4,
      num_steps: 4,
      gates: [
        g({ gate: 'h', qubit: 0, step: 0 }),
        g({ gate: 'h', qubit: 1, step: 0 }),
        g({ gate: 'h', qubit: 2, step: 0 }),
        g({ gate: 'h', qubit: 3, step: 0 }),
        g({ gate: 'rz', qubit: 0, step: 1, params: { phi: -Math.PI / 3 } }),
        g({ gate: 'rz', qubit: 1, step: 1, params: { phi: -Math.PI / 6 } }),
        g({ gate: 'rz', qubit: 2, step: 1, params: { phi: Math.PI / 6 } }),
        g({ gate: 'rz', qubit: 3, step: 1, params: { phi: Math.PI / 3 } })
      ]
    },
    run: phaseSwingRun
  },
  {
    slug: 'cascade',
    name: 'Cascade',
    description:
      'An eight-step build: qubits enter, cross-entangle, then phase-shift. Switch transport to AUTO to hear the texture grow and swing across the bar.',
    suggestedBpm: 98,
    spec: {
      num_qubits: 4,
      num_steps: 8,
      gates: [
        g({ gate: 'h', qubit: 0, step: 0 }),
        g({ gate: 'h', qubit: 1, step: 1 }),
        g({ gate: 'cnot', control: 0, target: 2, step: 2 }),
        g({ gate: 'cnot', control: 1, target: 3, step: 3 }),
        g({ gate: 'rz', qubit: 0, step: 4, params: { phi: Math.PI / 4 } }),
        g({ gate: 'rz', qubit: 1, step: 5, params: { phi: -Math.PI / 4 } }),
        g({ gate: 'cz', control: 2, target: 3, step: 6 })
      ]
    },
    run: cascadeRun
  }
];

export function findPreset(slug: string): Preset | undefined {
  return PRESETS.find((p) => p.slug === slug);
}
