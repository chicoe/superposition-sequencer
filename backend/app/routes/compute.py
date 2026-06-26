"""Run a circuit on a chosen execution backend and return per-shot memory.

The IonQ API key, if provided, is used only for the lifetime of the request:
it is taken from the request body, passed to `IonQProvider(token=...)`, and
goes out of scope when the handler returns. It is never persisted, logged,
or attached to any other request.
"""
from __future__ import annotations

import random
import time
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.circuit import CircuitSpec
from app.quantum.engine import build_full, build_subcircuit

router = APIRouter(prefix="/api/circuit", tags=["compute"])


# Frontend backend ids -> (qiskit-ionq backend name, optional noise model).
# The IonQ provider's get_backend accepts either "ionq_qpu.NAME" or
# "qpu.NAME"; we use the long form for clarity in logs.
_IONQ_BACKENDS: dict[str, tuple[str, Optional[str]]] = {
    "ionq_simulator": ("ionq_simulator", None),
    "ionq_simulator.forte_1": ("ionq_simulator", "forte-1"),
    "ionq_simulator.forte_enterprise_1": ("ionq_simulator", "forte-enterprise-1"),
    "ionq_qpu.forte_1": ("ionq_qpu.forte-1", None),
    "ionq_qpu.forte_enterprise_1": ("ionq_qpu.forte-enterprise-1", None),
}

_ALL_BACKENDS = {"aer", *_IONQ_BACKENDS.keys()}


class ComputeRequest(BaseModel):
    spec: CircuitSpec
    backend: str
    shots: int = Field(gt=0, le=100_000)
    ionq_api_key: Optional[str] = None
    # Which circuit layer to measure. None = the whole circuit (final state);
    # otherwise the sub-circuit up to and including this step is measured, so the
    # frontend can compute one step at a time.
    step: Optional[int] = None


class ComputeResponse(BaseModel):
    backend: str
    shots: int
    memory: list[str]  # little-endian bitstrings; qubit 0 = rightmost char
    completed_at: float  # unix seconds
    # 'memory' = real per-shot ordering returned by the backend.
    # 'counts' = backend only returned aggregated counts; we expanded them
    # back into a list and shuffled, so the ordering is synthetic. Marginal
    # frequencies and pairwise correlations are still accurate; the temporal
    # ordering is not.
    memory_source: Literal["memory", "counts"]


def _run_aer(qc, shots: int) -> tuple[list[str], str]:
    from qiskit_aer import AerSimulator

    sim = AerSimulator()
    job = sim.run(qc, shots=shots, memory=True)
    return list(job.result().get_memory()), "memory"


def _scrub(msg: str, api_key: str) -> str:
    """Defensive: ensure the user's API key never appears in error text."""
    if api_key and api_key in msg:
        return msg.replace(api_key, "<redacted>")
    return msg


def _ionq_error_detail(e: Exception, backend_id: str, api_key: str) -> str:
    """Pull the human message out of an IonQAPIError if possible.

    The provider's exception ``repr`` dumps the full response (headers, body,
    encoding noise). The useful bit is `.message` plus `.status_code`; use
    them when present and fall back to ``str(e)`` otherwise.
    """
    msg = getattr(e, "message", None)
    status = getattr(e, "status_code", None)
    if isinstance(msg, str) and msg:
        prefix = f"ionq {status} ({backend_id})" if status else f"ionq error ({backend_id})"
        return f"{prefix}: {_scrub(msg, api_key)}"
    return f"ionq error ({backend_id}): {_scrub(str(e), api_key)}"


def _run_ionq(qc, shots: int, backend_id: str, api_key: str) -> tuple[list[str], str]:
    try:
        from qiskit_ionq import IonQProvider  # type: ignore
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail="qiskit-ionq not installed on the backend",
        ) from e

    provider_backend, noise_model = _IONQ_BACKENDS[backend_id]
    run_kwargs: dict = {"shots": shots}
    if noise_model is not None:
        run_kwargs["noise_model"] = noise_model

    try:
        provider = IonQProvider(token=api_key)
        backend = provider.get_backend(provider_backend)
        job = backend.run(qc, **run_kwargs)
        result = job.result()
    except HTTPException:
        raise
    except Exception as e:
        # Surface provider errors with the API key scrubbed. Common cases:
        # 401 (bad/expired key), 403 (project lacks device access), 404
        # (device not enabled), timeouts, transpilation errors.
        raise HTTPException(
            status_code=502,
            detail=_ionq_error_detail(e, backend_id, api_key),
        ) from e

    try:
        return _extract_memory(result)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=_ionq_error_detail(e, backend_id, api_key),
        ) from e


def _ionq_backend(backend_id: str, api_key: str):
    """Build the qiskit-ionq backend + extra run kwargs (sans shots) for a
    frontend backend id. Shared by the blocking /compute path and the async
    submit/poll/cancel path below.
    """
    try:
        from qiskit_ionq import IonQProvider  # type: ignore
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail="qiskit-ionq not installed on the backend",
        ) from e

    provider_backend, noise_model = _IONQ_BACKENDS[backend_id]
    run_kwargs: dict = {}
    if noise_model is not None:
        run_kwargs["noise_model"] = noise_model
    try:
        backend = IonQProvider(token=api_key).get_backend(provider_backend)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=_ionq_error_detail(e, backend_id, api_key),
        ) from e
    return backend, run_kwargs


def _extract_memory(result) -> tuple[list[str], str]:
    """Per-shot memory if the backend returned it, else expand + shuffle counts."""
    try:
        mem = list(result.get_memory())
        return [s.replace(" ", "") for s in mem], "memory"
    except Exception:
        pass
    counts = result.get_counts()
    mem: list[str] = []
    for bs, n in counts.items():
        mem.extend([bs.replace(" ", "")] * int(n))
    random.shuffle(mem)
    return mem, "counts"


@router.post("/compute", response_model=ComputeResponse)
def compute(req: ComputeRequest) -> ComputeResponse:
    if req.backend not in _ALL_BACKENDS:
        raise HTTPException(
            status_code=400,
            detail=f"unknown backend '{req.backend}'. Known: {sorted(_ALL_BACKENDS)}",
        )

    if req.backend != "aer" and not req.ionq_api_key:
        raise HTTPException(
            status_code=400,
            detail="IonQ backends require an API key; pass it in this request only",
        )

    if req.step is not None and not (0 <= req.step < req.spec.num_steps):
        raise HTTPException(status_code=400, detail=f"step {req.step} out of range")

    try:
        # A specific step measures the sub-circuit up to that layer; None measures
        # the whole circuit (equivalent to step = num_steps - 1).
        qc = build_full(req.spec) if req.step is None else build_subcircuit(req.spec, up_to_step=req.step)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    qc.measure_all()

    if req.backend == "aer":
        memory, source = _run_aer(qc, req.shots)
    else:
        memory, source = _run_ionq(qc, req.shots, req.backend, req.ionq_api_key or "")

    return ComputeResponse(
        backend=req.backend,
        shots=req.shots,
        memory=memory,
        completed_at=time.time(),
        memory_source=source,
    )


# ---- async IonQ: submit → poll → result -----------------------------------
# QPU jobs queue for minutes–hours, far longer than the request timeout, so the
# frontend submits (gets a job id immediately), polls status, and fetches the
# memory once the job is done. Aer stays on the blocking /compute (it's instant).


class SubmitRequest(BaseModel):
    spec: CircuitSpec
    backend: str
    shots: int = Field(gt=0, le=100_000)
    ionq_api_key: str
    step: Optional[int] = None


class SubmitResponse(BaseModel):
    job_id: str
    backend: str


class JobRequest(BaseModel):
    job_id: str
    backend: str
    ionq_api_key: str


class PollResponse(BaseModel):
    status: Literal["queued", "running", "completed", "failed", "canceled"]
    memory: Optional[list[str]] = None
    memory_source: Optional[Literal["memory", "counts"]] = None
    completed_at: Optional[float] = None
    detail: Optional[str] = None


class CancelResponse(BaseModel):
    status: Literal["canceled"]


def _require_ionq(backend_id: str, api_key: str) -> None:
    if backend_id not in _IONQ_BACKENDS:
        raise HTTPException(
            status_code=400,
            detail=f"async compute is for IonQ backends only; '{backend_id}' is not one (use /compute for aer)",
        )
    if not api_key:
        raise HTTPException(status_code=400, detail="IonQ backends require an API key")


def _status_str(st) -> str:
    from qiskit.providers.jobstatus import JobStatus

    return {
        JobStatus.INITIALIZING: "queued",
        JobStatus.QUEUED: "queued",
        JobStatus.VALIDATING: "queued",
        JobStatus.RUNNING: "running",
        JobStatus.DONE: "completed",
        JobStatus.ERROR: "failed",
        JobStatus.CANCELLED: "canceled",
    }.get(st, "running")


@router.post("/compute/submit", response_model=SubmitResponse)
def compute_submit(req: SubmitRequest) -> SubmitResponse:
    _require_ionq(req.backend, req.ionq_api_key)
    if req.step is not None and not (0 <= req.step < req.spec.num_steps):
        raise HTTPException(status_code=400, detail=f"step {req.step} out of range")
    try:
        qc = build_full(req.spec) if req.step is None else build_subcircuit(req.spec, up_to_step=req.step)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    qc.measure_all()

    backend, run_kwargs = _ionq_backend(req.backend, req.ionq_api_key)
    try:
        job = backend.run(qc, shots=req.shots, **run_kwargs)  # submits; does NOT block
        job_id = job.job_id()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=_ionq_error_detail(e, req.backend, req.ionq_api_key)
        ) from e
    return SubmitResponse(job_id=str(job_id), backend=req.backend)


@router.post("/compute/poll", response_model=PollResponse)
def compute_poll(req: JobRequest) -> PollResponse:
    _require_ionq(req.backend, req.ionq_api_key)
    backend, _ = _ionq_backend(req.backend, req.ionq_api_key)
    try:
        job = backend.retrieve_job(req.job_id)
        status = _status_str(job.status())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=_ionq_error_detail(e, req.backend, req.ionq_api_key)
        ) from e

    if status == "completed":
        try:
            memory, source = _extract_memory(job.result())
        except Exception as e:
            raise HTTPException(
                status_code=502, detail=_ionq_error_detail(e, req.backend, req.ionq_api_key)
            ) from e
        return PollResponse(
            status="completed", memory=memory, memory_source=source, completed_at=time.time()
        )
    if status == "failed":
        return PollResponse(status="failed", detail="IonQ reported the job failed")
    return PollResponse(status=status)  # type: ignore[arg-type]


@router.post("/compute/cancel", response_model=CancelResponse)
def compute_cancel(req: JobRequest) -> CancelResponse:
    _require_ionq(req.backend, req.ionq_api_key)
    backend, _ = _ionq_backend(req.backend, req.ionq_api_key)
    try:
        backend.cancel_job(req.job_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=_ionq_error_detail(e, req.backend, req.ionq_api_key)
        ) from e
    return CancelResponse(status="canceled")
