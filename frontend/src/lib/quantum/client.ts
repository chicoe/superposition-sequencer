import type { CircuitResponse, CircuitSpec } from '$lib/types';
import type { BackendId } from '$lib/stores/run';

const BASE = ''; // proxied via Vite to http://localhost:8000

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, init);
  if (!r.ok) {
    const text = await r.text();
    // FastAPI returns {"detail": "..."} for errors; pull it out so the UI
    // doesn't have to display raw JSON.
    let msg = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.detail === 'string') msg = parsed.detail;
      else if (parsed?.detail) msg = JSON.stringify(parsed.detail);
    } catch {
      // not JSON; keep raw
    }
    throw new Error(`${r.status} ${msg}`);
  }
  return (await r.json()) as T;
}

/**
 * Build a circuit and fetch its full per-step state in one round trip.
 *
 * The backend is stateless — there is no circuit_id and nothing is stored — so
 * we post the whole gate-list every time the circuit changes and get back qasm
 * + every step's Bloch vectors and statevector.
 */
export async function syncCircuit(spec: CircuitSpec): Promise<CircuitResponse> {
  return jsonFetch<CircuitResponse>('/api/circuit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec)
  });
}

export interface ComputeResponse {
  backend: BackendId;
  shots: number;
  memory: string[];
  memory_source: 'memory' | 'counts';
  completed_at: number;
}

export async function compute(
  spec: CircuitSpec,
  backend: BackendId,
  shots: number,
  ionqApiKey?: string,
  step?: number
): Promise<ComputeResponse> {
  const body: Record<string, unknown> = { spec, backend, shots };
  if (ionqApiKey) body.ionq_api_key = ionqApiKey;
  if (step !== undefined) body.step = step;
  return jsonFetch<ComputeResponse>('/api/circuit/compute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// ---- async IonQ compute (submit → poll → result) -------------------------
// IonQ QPU jobs queue far longer than the request timeout, so we submit (get a
// job id back immediately), poll status, and fetch the memory once it's done.

export interface SubmitResponse {
  job_id: string;
  backend: BackendId;
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export interface PollResponse {
  status: JobStatus;
  memory?: string[];
  memory_source?: 'memory' | 'counts';
  completed_at?: number;
  detail?: string;
}

/** Submit an IonQ job; returns immediately with a job id (no waiting). */
export async function submitCompute(
  spec: CircuitSpec,
  backend: BackendId,
  shots: number,
  ionqApiKey: string,
  step?: number
): Promise<SubmitResponse> {
  const body: Record<string, unknown> = { spec, backend, shots, ionq_api_key: ionqApiKey };
  if (step !== undefined) body.step = step;
  return jsonFetch<SubmitResponse>('/api/circuit/compute/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/** Poll a submitted IonQ job; includes the memory once status is 'completed'. */
export async function pollCompute(
  jobId: string,
  backend: BackendId,
  ionqApiKey: string
): Promise<PollResponse> {
  return jsonFetch<PollResponse>('/api/circuit/compute/poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, backend, ionq_api_key: ionqApiKey })
  });
}

/** Cancel a queued/running IonQ job. */
export async function cancelCompute(
  jobId: string,
  backend: BackendId,
  ionqApiKey: string
): Promise<void> {
  await jsonFetch<{ status: string }>('/api/circuit/compute/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, backend, ionq_api_key: ionqApiKey })
  });
}

export interface ImportQasmResponse {
  spec: CircuitSpec;
}

export async function importQasm(qasm: string): Promise<CircuitSpec> {
  const r = await jsonFetch<ImportQasmResponse>('/api/qasm/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qasm })
  });
  return r.spec;
}
