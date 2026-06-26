/**
 * Latest OpenQASM 3 representation of the current circuit. Set by +page.svelte
 * after every successful sync. Used by the Export QASM button.
 */
import { writable } from 'svelte/store';

export const circuitQasm = writable<string>('');
