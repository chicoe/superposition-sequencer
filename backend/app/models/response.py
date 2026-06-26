from __future__ import annotations

from pydantic import BaseModel


class CartesianBloch(BaseModel):
    x: float
    y: float
    z: float


class BlochVector(BaseModel):
    qubit: int
    theta: float
    phi: float
    r: float
    probability: float  # P(|0⟩) = cos²(θ/2)
    cartesian: CartesianBloch


class ComplexAmplitude(BaseModel):
    re: float
    im: float


class StepState(BaseModel):
    step: int
    bloch_vectors: list[BlochVector]
    statevector: list[ComplexAmplitude]


class CircuitResponse(BaseModel):
    """Full per-step state for a circuit, returned in one shot.

    Stateless API: the client posts the whole gate-list and gets back everything
    it needs (qasm + every step's Bloch vectors + statevector). There is no
    circuit_id because nothing is stored server-side — this is what lets the
    backend run on ephemeral/scaled instances without losing state.
    """

    qasm: str
    num_qubits: int
    num_steps: int
    total_steps: int
    steps: list[StepState]


class PerQubitMarginal(BaseModel):
    qubit: int
    p0: float
    p1: float


class OutcomeCount(BaseModel):
    outcome: str  # little-endian bitstring, qubit 0 is rightmost char
    count: int


class MeasureResponse(BaseModel):
    results: list[OutcomeCount]
    per_qubit: list[PerQubitMarginal]
    total_shots: int
    step: int
