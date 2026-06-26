"""Bloch vector extraction via partial trace."""
from __future__ import annotations

import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector, partial_trace

from app.models.response import BlochVector, CartesianBloch


def _bloch_from_density(rho: np.ndarray) -> tuple[float, float, float]:
    """Extract (r_x, r_y, r_z) from a 2x2 density matrix.

    ρ = (I + r·σ)/2 ⇒
      r_x = 2 * Re(ρ[0,1])
      r_y = 2 * Im(ρ[1,0])
      r_z = Re(ρ[0,0] - ρ[1,1])
    """
    r_x = float(2 * np.real(rho[0, 1]))
    r_y = float(2 * np.imag(rho[1, 0]))
    r_z = float(np.real(rho[0, 0] - rho[1, 1]))
    return r_x, r_y, r_z


def get_bloch_vectors(qc: QuantumCircuit) -> list[BlochVector]:
    """Return Bloch vectors for every qubit in the given circuit's final state."""
    if qc.num_qubits == 0:
        return []

    sv = Statevector.from_instruction(qc)
    n = qc.num_qubits
    out: list[BlochVector] = []
    for q in range(n):
        others = [i for i in range(n) if i != q]
        rho = partial_trace(sv, others).data
        r_x, r_y, r_z = _bloch_from_density(rho)

        r = float(np.sqrt(r_x * r_x + r_y * r_y + r_z * r_z))
        # Clamp to keep arccos/arctan2 stable for slightly-out-of-range floats.
        denom = max(r, 1e-12)
        theta = float(np.arccos(np.clip(r_z / denom, -1.0, 1.0)))
        phi = float(np.arctan2(r_y, r_x) % (2 * np.pi))
        probability = float(np.cos(theta / 2) ** 2)

        out.append(
            BlochVector(
                qubit=q,
                theta=theta,
                phi=phi,
                r=r,
                probability=probability,
                cartesian=CartesianBloch(x=r_x, y=r_y, z=r_z),
            )
        )
    return out
