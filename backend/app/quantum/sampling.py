"""Correlated measurement sampling from the full statevector.

IMPORTANT (spec §16.2): for entangled qubits, sampling each qubit independently
from its marginal destroys the correlations. Always sample bitstrings from the
full statevector's probability distribution.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
from qiskit.quantum_info import Statevector


def sample_correlated(sv: Statevector, num_shots: int, rng: np.random.Generator | None = None) -> list[str]:
    """Sample `num_shots` measurement outcomes preserving entanglement correlations.

    Returns little-endian bitstrings (qubit 0 = rightmost char), matching Qiskit.
    """
    if num_shots <= 0:
        return []
    rng = rng or np.random.default_rng()
    probs = sv.probabilities()
    # Normalize against floating-point drift before sampling.
    probs = probs / probs.sum()
    n = sv.num_qubits
    indices = rng.choice(len(probs), size=num_shots, p=probs)
    return [format(int(i), f"0{n}b") for i in indices]


def tally(outcomes: list[str]) -> list[tuple[str, int]]:
    """Group outcomes into (bitstring, count) pairs, sorted by count desc."""
    c = Counter(outcomes)
    return sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))


def per_qubit_marginals(outcomes: list[str], num_qubits: int) -> list[tuple[float, float]]:
    """Per-qubit P(0), P(1) from sampled bitstrings.

    Bitstrings are little-endian (qubit 0 = rightmost char).
    """
    if not outcomes:
        return [(0.0, 0.0)] * num_qubits
    total = len(outcomes)
    zeros = [0] * num_qubits
    for bs in outcomes:
        # Reverse so index q maps to qubit q.
        for q, bit in enumerate(reversed(bs)):
            if bit == "0":
                zeros[q] += 1
    return [(z / total, 1.0 - z / total) for z in zeros]
