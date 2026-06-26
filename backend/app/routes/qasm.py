"""Parse an OpenQASM 3 string into our gate-list CircuitSpec.

The app's "step" axis is its own invention (QASM has no notion of layers), so
we lay each instruction out greedily: each gate goes into the earliest step
where all its qubits are free. This produces the most compact representation
that preserves dependencies.

Gates outside our supported set (e.g. barriers, measurements) are silently
skipped — measurements happen at compute time via `measure_all`.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.circuit import CircuitSpec, Gate, GateParams

router = APIRouter(prefix="/api/qasm", tags=["qasm"])


_SINGLE = {"h", "x", "y", "z", "s", "t", "sdg", "tdg"}
_ROT = {"rx", "ry", "rz"}
_TWO_CTRL = {"cx", "cz"}


class ImportRequest(BaseModel):
    qasm: str


class ImportResponse(BaseModel):
    spec: CircuitSpec


@router.post("/import", response_model=ImportResponse)
def import_qasm(req: ImportRequest) -> ImportResponse:
    try:
        from qiskit.qasm3 import loads as qasm3_loads
    except ImportError as e:
        raise HTTPException(status_code=500, detail="qiskit.qasm3 not available") from e

    try:
        qc = qasm3_loads(req.qasm)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"could not parse QASM: {e}") from e

    num_qubits = qc.num_qubits
    next_free = [0] * num_qubits  # earliest free step per qubit
    gates: list[Gate] = []

    for instr in qc.data:
        op = instr.operation
        name = op.name.lower()
        qubits = [qc.find_bit(q).index for q in instr.qubits]
        step = max(next_free[q] for q in qubits) if qubits else 0

        g: Gate | None = None
        if name in _SINGLE and len(qubits) == 1:
            g = Gate(gate=name, step=step, qubit=qubits[0])
        elif name in _ROT and len(qubits) == 1:
            angle = float(op.params[0]) if op.params else 0.0
            params = GateParams(phi=angle) if name == "rz" else GateParams(theta=angle)
            g = Gate(gate=name, step=step, qubit=qubits[0], params=params)
        elif name in _TWO_CTRL and len(qubits) == 2:
            g = Gate(gate=name, step=step, control=qubits[0], target=qubits[1])
        elif name == "cnot" and len(qubits) == 2:
            g = Gate(gate="cx", step=step, control=qubits[0], target=qubits[1])
        elif name == "swap" and len(qubits) == 2:
            g = Gate(gate="swap", step=step, qubit1=qubits[0], qubit2=qubits[1])
        else:
            # measure, barrier, reset, unsupported gates -- skip silently.
            continue

        gates.append(g)
        for q in qubits:
            next_free[q] = step + 1

    num_steps = max((g.step for g in gates), default=-1) + 1
    if num_steps < 1:
        num_steps = 1
    if num_steps > 64:
        raise HTTPException(status_code=400, detail="imported circuit exceeds 64 steps")
    if num_qubits > 8:
        raise HTTPException(status_code=400, detail="imported circuit exceeds 8 qubits")

    spec = CircuitSpec(num_qubits=num_qubits, num_steps=num_steps, gates=gates)
    return ImportResponse(spec=spec)
