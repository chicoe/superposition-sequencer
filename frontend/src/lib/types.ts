export interface CartesianBloch {
  x: number;
  y: number;
  z: number;
}

export interface BlochVector {
  qubit: number;
  theta: number;
  phi: number;
  r: number;
  probability: number;
  cartesian: CartesianBloch;
}

export interface ComplexAmplitude {
  re: number;
  im: number;
}

export interface StepState {
  step: number;
  bloch_vectors: BlochVector[];
  statevector: ComplexAmplitude[];
}

export interface CircuitResponse {
  qasm: string;
  num_qubits: number;
  num_steps: number;
  total_steps: number;
  steps: StepState[];
}

export type GateName =
  | 'h'
  | 'x'
  | 'y'
  | 'z'
  | 's'
  | 't'
  | 'sdg'
  | 'tdg'
  | 'rx'
  | 'ry'
  | 'rz'
  | 'cnot'
  | 'cx'
  | 'cz'
  | 'swap';

export interface GateParams {
  theta?: number;
  phi?: number;
}

export interface Gate {
  gate: GateName;
  step: number;
  qubit?: number;
  control?: number;
  target?: number;
  qubit1?: number;
  qubit2?: number;
  params?: GateParams;
}

export interface CircuitSpec {
  num_qubits: number;
  num_steps: number;
  gates: Gate[];
}

export type SoundName =
  | 'none'
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'tom'
  | 'rim'
  | 'clap'
  | 'bass'
  | 'pluck'
  | 'pad'
  | 'bell';

export type ShotSource =
  | 'preview'
  | 'aer'
  | 'ionq_simulator'
  | 'ionq_simulator.forte_1'
  | 'ionq_simulator.forte_enterprise_1'
  | 'ionq_qpu.forte_1'
  | 'ionq_qpu.forte_enterprise_1';

export interface ShotRecord {
  step: number;
  triggered: boolean;
  swing: number; // [-MAX_SWING, +MAX_SWING] fraction of beat interval
  phi: number; // azimuthal phase angle in radians [0, 2π)
  velocity: number; // 0..1
  pitch?: number; // MIDI note for melodic tracks
  time: number; // performance.now() ms
  /** Whether this shot came from the live preview sim or a frozen computed run. */
  source: ShotSource;
}
