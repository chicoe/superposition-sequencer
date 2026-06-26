"""Quantum-to-music parameter mapping (spec §4)."""
from __future__ import annotations

import math

MAX_SWING = 0.35  # fraction of beat interval


def trigger_probability(theta: float) -> float:
    """P = cos²(θ/2). θ=0 → 1.0; θ=π → 0.0."""
    return math.cos(theta / 2) ** 2


def swing_offset(phi: float, max_swing: float = MAX_SWING) -> float:
    """Map azimuthal angle φ in [0, 2π) to swing in [-max_swing, +max_swing].

    φ = 0     → -max_swing (max early)
    φ = π     →  0         (on grid)
    φ → 2π    → +max_swing (max late)

    The mapping is continuous across the 2π wrap by construction (we mod first).
    """
    normalized = (phi % (2 * math.pi)) / (2 * math.pi)
    return (2 * normalized - 1) * max_swing


def velocity(r: float, max_velocity: float = 1.0) -> float:
    """Bloch vector length → velocity. Pure state r=1 → full velocity."""
    return max(0.0, min(1.0, r)) * max_velocity
