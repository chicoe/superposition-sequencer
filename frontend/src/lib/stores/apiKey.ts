/**
 * In-memory IonQ API key. NEVER persisted to localStorage / cookies / disk —
 * the value lives only inside this module's writable and is sent with the
 * single compute request that needs it. A page refresh wipes it.
 */
import { writable } from 'svelte/store';

export const ionqApiKey = writable<string>('');

export function setIonqApiKey(key: string): void {
  ionqApiKey.set(key.trim());
}

export function clearIonqApiKey(): void {
  ionqApiKey.set('');
}
