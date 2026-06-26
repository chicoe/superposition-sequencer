/**
 * Compute state.
 *
 * `isComputing` is the blocking overlay flag — used ONLY for the instant local
 * Aer compute, so the user can't mutate state mid-request.
 *
 * `pendingJob` tracks an async IonQ job (which can sit queued for minutes–hours)
 * WITHOUT blocking the app. Its meta is persisted to localStorage so a reload
 * can resume tracking — but never the API key, which stays in-memory only
 * (`apiKey` store); resuming after a reload re-prompts for the key.
 */
import { writable } from 'svelte/store';
import type { BackendId } from './run';
import type { CircuitSpec } from '$lib/types';
import type { JobStatus } from '$lib/quantum/client';

export interface ComputingState {
  backend: BackendId;
  shots: number;
  startedAt: number;
}

export const isComputing = writable<ComputingState | null>(null);

export interface PendingJob {
  jobId: string;
  backend: BackendId;
  shots: number;
  step: number;
  circuit: CircuitSpec; // the circuit this job measures — applied when it lands
  startedAt: number; // unix ms
  status: JobStatus; // 'queued' | 'running' (terminal states clear the store)
}

const STORAGE_KEY = 'ssq.pendingJob';

function loadPending(): PendingJob | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingJob) : null;
  } catch {
    return null;
  }
}

export const pendingJob = writable<PendingJob | null>(loadPending());

// Persist meta only — never the API key.
pendingJob.subscribe((p) => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota / disabled storage
  }
});

export function clearPendingJob(): void {
  pendingJob.set(null);
}
