from __future__ import annotations

from fastapi import APIRouter, HTTPException
from qiskit.qasm3 import dumps as qasm3_dumps

from app.models.circuit import CircuitSpec
from app.models.response import CircuitResponse
from app.quantum.engine import build_full
from app.quantum.state import all_step_states

router = APIRouter(prefix="/api/circuit", tags=["circuit"])


@router.post("", response_model=CircuitResponse)
def create_circuit(spec: CircuitSpec) -> CircuitResponse:
    """Build the circuit from the posted spec and return its full per-step state.

    Stateless: the client sends the whole gate-list on every change, so there is
    no server-side store and no circuit_id. Earlier gates affect every later
    state, so we always return the complete step array (spec §16.4).
    """
    try:
        qc = build_full(spec)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        qasm = qasm3_dumps(qc)
    except Exception:
        # OpenQASM 3 export can fail for some instructions; not a hard error.
        qasm = ""
    return CircuitResponse(
        qasm=qasm,
        num_qubits=spec.num_qubits,
        num_steps=spec.num_steps,
        total_steps=spec.num_steps,
        steps=all_step_states(spec),
    )
