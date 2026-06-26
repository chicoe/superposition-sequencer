from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

SingleQubitGate = Literal["h", "x", "y", "z", "s", "t", "sdg", "tdg"]
RotationGate = Literal["rx", "ry", "rz"]
TwoQubitGate = Literal["cnot", "cx", "cz", "swap"]


class GateParams(BaseModel):
    theta: Optional[float] = None
    phi: Optional[float] = None
    lam: Optional[float] = None


class Gate(BaseModel):
    """A gate placement on the circuit grid.

    Field shape varies by gate kind:
      - single-qubit: requires `qubit`
      - rotation: requires `qubit` and `params.theta` (or `phi` for rz)
      - two-qubit: requires `control`+`target` (cnot/cz) or `qubit1`+`qubit2` (swap)
    """

    gate: str
    step: int = Field(ge=0)
    qubit: Optional[int] = Field(default=None, ge=0)
    control: Optional[int] = Field(default=None, ge=0)
    target: Optional[int] = Field(default=None, ge=0)
    qubit1: Optional[int] = Field(default=None, ge=0)
    qubit2: Optional[int] = Field(default=None, ge=0)
    params: Optional[GateParams] = None

    @model_validator(mode="after")
    def _check_shape(self) -> "Gate":
        g = self.gate.lower()
        if g in {"cnot", "cx", "cz"}:
            if self.control is None or self.target is None:
                raise ValueError(f"{g} requires control and target")
            if self.control == self.target:
                raise ValueError(f"{g} control and target must differ")
        elif g == "swap":
            if self.qubit1 is None or self.qubit2 is None:
                raise ValueError("swap requires qubit1 and qubit2")
            if self.qubit1 == self.qubit2:
                raise ValueError("swap qubits must differ")
        else:
            if self.qubit is None:
                raise ValueError(f"{g} requires qubit")
        return self


class CircuitSpec(BaseModel):
    num_qubits: int = Field(ge=1, le=8)
    num_steps: int = Field(ge=1, le=64)
    gates: list[Gate] = Field(default_factory=list)
