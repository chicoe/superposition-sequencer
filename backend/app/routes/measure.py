from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from qiskit.quantum_info import Statevector

from app.models.circuit import CircuitSpec
from app.models.response import MeasureResponse, OutcomeCount, PerQubitMarginal
from app.quantum.engine import build_subcircuit
from app.quantum.sampling import per_qubit_marginals, sample_correlated, tally

router = APIRouter(prefix="/api/circuit", tags=["measure"])


class MeasureRequest(BaseModel):
    spec: CircuitSpec
    step: int = Field(ge=0)
    shots: int = Field(default=1024, gt=0, le=100_000)


@router.post("/measure", response_model=MeasureResponse)
def measure(req: MeasureRequest) -> MeasureResponse:
    """Sample measurement outcomes at a step from the posted spec (stateless).

    Always samples from the full statevector so entangled qubits stay correlated
    (spec §16.2) — never per-qubit independently.
    """
    if req.step >= req.spec.num_steps:
        raise HTTPException(status_code=400, detail=f"step {req.step} out of range")

    qc = build_subcircuit(req.spec, up_to_step=req.step)
    sv = Statevector.from_instruction(qc)
    outcomes = sample_correlated(sv, req.shots)

    results = [OutcomeCount(outcome=o, count=c) for o, c in tally(outcomes)]
    marginals = per_qubit_marginals(outcomes, req.spec.num_qubits)
    per_qubit = [PerQubitMarginal(qubit=q, p0=p0, p1=p1) for q, (p0, p1) in enumerate(marginals)]

    return MeasureResponse(
        results=results,
        per_qubit=per_qubit,
        total_shots=req.shots,
        step=req.step,
    )
