import { writable, derived, get } from 'svelte/store';
import type { StepState } from '$lib/types';
import { currentStep } from './circuit';

export const allSteps = writable<StepState[]>([]);

export const stepState = derived([allSteps, currentStep], ([$all, $s]) => $all[$s] ?? null);

export function getStep(index: number): StepState | null {
  return get(allSteps)[index] ?? null;
}
