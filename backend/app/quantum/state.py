"""High-level state computation for a circuit at a given step."""
from __future__ import annotations

import numpy as np
from qiskit.quantum_info import Statevector

from app.models.circuit import CircuitSpec
from app.models.response import ComplexAmplitude, StepState
from app.quantum.bloch import get_bloch_vectors
from app.quantum.engine import build_subcircuit


def _amplitudes(sv: Statevector) -> list[ComplexAmplitude]:
    data = np.asarray(sv.data)
    return [ComplexAmplitude(re=float(c.real), im=float(c.imag)) for c in data]


def state_at_step(spec: CircuitSpec, step: int) -> StepState:
    if step < 0 or step >= spec.num_steps:
        raise ValueError(f"step {step} out of range [0, {spec.num_steps})")
    qc = build_subcircuit(spec, up_to_step=step)
    bloch = get_bloch_vectors(qc)
    sv = Statevector.from_instruction(qc)
    return StepState(step=step, bloch_vectors=bloch, statevector=_amplitudes(sv))


def all_step_states(spec: CircuitSpec) -> list[StepState]:
    return [state_at_step(spec, s) for s in range(spec.num_steps)]
