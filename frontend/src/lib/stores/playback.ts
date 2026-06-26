import { derived, get, writable } from 'svelte/store';
import type { ShotRecord } from '$lib/types';
import { currentStep } from './circuit';

export type PlaybackMode = 'manual' | 'auto';

export const isPlaying = writable(false);
export const bpm = writable(110);
export const mode = writable<PlaybackMode>('manual');
export const shotsPerStep = writable(16); // auto-advance after this many shots
export const volume = writable(0.5); // master output level, 0..1 (applied as dB)

// shotHistory[qubit] = list of shots (kept across step navigation)
export const shotHistory = writable<ShotRecord[][]>([[], [], [], []]);

// Index into shotHistory[*] that marks "the moment we arrived at the current step".
// Anything before this is from a previous step-visit and counts as historic.
export const epochStartIndex = writable(0);

// Every step change (manual or auto-advance) resets the epoch boundary to the
// current end of history — so the next shot fired here is the first of the visit.
currentStep.subscribe(() => {
  const h = get(shotHistory);
  epochStartIndex.set(h[0]?.length ?? 0);
});

// Shots fired since arriving at the current step.
export const shotCount = derived([shotHistory, epochStartIndex], ([$h, $b]) => {
  return Math.max(0, ($h[0]?.length ?? 0) - $b);
});

export function resetShots(numQubits: number) {
  shotHistory.set(Array.from({ length: numQubits }, () => [] as ShotRecord[]));
  epochStartIndex.set(0);
}

export function pushShots(perQubit: ShotRecord[]) {
  shotHistory.update((rows) => {
    const next = rows.map((r) => r.slice());
    perQubit.forEach((shot, q) => {
      if (!next[q]) next[q] = [];
      next[q].push(shot);
      // Cap per-track history. Keep epoch in sync so the boundary doesn't drift.
      if (next[q].length > 200) {
        next[q].shift();
      }
    });
    return next;
  });
  // If the cap kicked in, the boundary shifts forward by 1 to stay aligned.
  shotHistory.update((rows) => {
    const refLen = rows[0]?.length ?? 0;
    epochStartIndex.update((b) => Math.min(b, refLen));
    return rows;
  });
}
