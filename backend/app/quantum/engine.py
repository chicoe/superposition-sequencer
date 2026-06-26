"""Build Qiskit circuits from gate-list specs.

Conventions:
- Qubit indices match Qiskit's wire indices (qubit 0 = wire 0).
- Bitstrings returned elsewhere are little-endian (qubit 0 = rightmost char),
  matching Qiskit's default.
"""
from __future__ import annotations

from qiskit import QuantumCircuit

from app.models.circuit import CircuitSpec, Gate


_SINGLE_PARAMLESS = {"h", "x", "y", "z", "s", "t", "sdg", "tdg"}
_ROTATIONS = {"rx", "ry", "rz"}
_TWO_QUBIT = {"cnot", "cx", "cz", "swap"}


def _apply_gate(qc: QuantumCircuit, g: Gate) -> None:
    name = g.gate.lower()
    if name in _SINGLE_PARAMLESS:
        getattr(qc, name)(g.qubit)
    elif name in _ROTATIONS:
        # rz uses params.phi by convention in the spec; others use params.theta
        if g.params is None:
            raise ValueError(f"{name} requires a rotation angle")
        angle = g.params.phi if name == "rz" and g.params.phi is not None else g.params.theta
        if angle is None:
            raise ValueError(f"{name} missing angle (params.theta or params.phi)")
        getattr(qc, name)(angle, g.qubit)
    elif name in {"cnot", "cx"}:
        qc.cx(g.control, g.target)
    elif name == "cz":
        qc.cz(g.control, g.target)
    elif name == "swap":
        qc.swap(g.qubit1, g.qubit2)
    else:
        raise ValueError(f"unsupported gate: {g.gate}")


def _validate_bounds(spec: CircuitSpec) -> None:
    for g in spec.gates:
        if g.step >= spec.num_steps:
            raise ValueError(f"gate step {g.step} out of range (num_steps={spec.num_steps})")
        for q in (g.qubit, g.control, g.target, g.qubit1, g.qubit2):
            if q is not None and q >= spec.num_qubits:
                raise ValueError(f"qubit index {q} out of range (num_qubits={spec.num_qubits})")


def build_subcircuit(spec: CircuitSpec, up_to_step: int) -> QuantumCircuit:
    """Build a circuit applying all gates with step <= up_to_step (inclusive)."""
    _validate_bounds(spec)
    qc = QuantumCircuit(spec.num_qubits)
    # Apply by step, then preserve declaration order within a step.
    relevant = [g for g in spec.gates if g.step <= up_to_step]
    relevant.sort(key=lambda g: g.step)
    for g in relevant:
        _apply_gate(qc, g)
    return qc


def build_full(spec: CircuitSpec) -> QuantumCircuit:
    return build_subcircuit(spec, up_to_step=spec.num_steps - 1)
