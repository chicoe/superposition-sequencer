/**
 * Real-time MIDI output over the Web MIDI API (Chromium only). Wraps a single
 * selected output port; the sequencer calls sendNote/sendCC each beat while
 * playing. Channels are 1-based (1..16) to match the UI; the wire status byte
 * uses (channel - 1).
 *
 * CC sends are deduped against the last value per (channel, cc) so we only emit
 * when the quantized mutual information actually moves — keeps the bus quiet.
 *
 * Timestamps are DOMHighResTimeStamp (performance.now() domain), so the
 * sequencer can pre-schedule swing-offset notes a few ms ahead.
 */
import { get } from 'svelte/store';
import { liveMidiEnabled, midiOutputs, selectedOutputId } from '$lib/stores/midiOut';

let access: MIDIAccess | null = null;
let currentOutput: MIDIOutput | null = null;

// (channel,cc) -> last value sent, so we don't re-send unchanged controllers.
const ccCache = new Map<string, number>();

function refreshOutputs(): void {
  if (!access) {
    midiOutputs.set([]);
    return;
  }
  const list: { id: string; name: string }[] = [];
  access.outputs.forEach((out) => list.push({ id: out.id, name: out.name ?? out.id }));
  midiOutputs.set(list);

  // Keep the selection valid: if nothing chosen (or it vanished), pick the first.
  const sel = get(selectedOutputId);
  const stillThere = sel && list.some((o) => o.id === sel);
  if (!stillThere) setOutput(list[0]?.id ?? null);
  else bindOutput(sel);
}

function bindOutput(id: string | null): void {
  currentOutput = id && access ? access.outputs.get(id) ?? null : null;
}

/** Choose which output port to send to. */
export function setOutput(id: string | null): void {
  selectedOutputId.set(id);
  bindOutput(id);
}

/**
 * Request MIDI access and turn live output on. Resolves false if Web MIDI is
 * unavailable or the user denies access (the toggle should revert in that case).
 */
export async function enableMidi(): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
    return false;
  }
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    access = null;
    return false;
  }
  access.onstatechange = () => refreshOutputs();
  refreshOutputs();
  resetCCCache();
  liveMidiEnabled.set(true);
  return true;
}

/** Turn live output off, silencing any held notes. */
export function disableMidi(): void {
  allNotesOff();
  liveMidiEnabled.set(false);
}

/** Forget the last-sent CC values (call on enable / port change / play start). */
export function resetCCCache(): void {
  ccCache.clear();
}

/** Send a control-change, skipping it if the value is unchanged on this (ch,cc). */
export function sendCC(channel: number, cc: number, value: number): void {
  if (!currentOutput) return;
  const key = `${channel}:${cc}`;
  if (ccCache.get(key) === value) return;
  ccCache.set(key, value);
  currentOutput.send([0xb0 | ((channel - 1) & 0x0f), cc & 0x7f, value & 0x7f]);
}

/**
 * Schedule a note: on at `whenMs`, off `durMs` later. `whenMs` is a
 * performance.now()-domain timestamp (or 0/undefined for "now").
 */
export function sendNote(
  channel: number,
  note: number,
  velocity: number,
  whenMs?: number,
  durMs = 150
): void {
  if (!currentOutput) return;
  const ch = (channel - 1) & 0x0f;
  const n = note & 0x7f;
  const v = Math.max(1, Math.min(127, Math.round(velocity))) & 0x7f;
  currentOutput.send([0x90 | ch, n, v], whenMs);
  currentOutput.send([0x80 | ch, n, 0], (whenMs ?? performance.now()) + durMs);
}

/** Silence every channel (CC 123 = All Notes Off) and clear the CC cache. */
export function allNotesOff(): void {
  if (currentOutput) {
    for (let ch = 0; ch < 16; ch++) currentOutput.send([0xb0 | ch, 123, 0]);
  }
  resetCCCache();
}

/** Whether a port is currently selected and ready to receive. */
export function hasOutput(): boolean {
  return currentOutput !== null;
}
