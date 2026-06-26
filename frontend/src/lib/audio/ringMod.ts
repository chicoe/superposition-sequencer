/**
 * Pairwise ring modulators between entangled oscillator-mode qubits.
 *
 * When two qubits are entangled (detected via the statevector's pairwise
 * correlation), and both are in `legato` or `gated` mode, we add a sidechain
 * channel: `oscA * oscB → ringGain → destination`. The oscillators still
 * play normally; the ring channel layers a difference/sum-frequency tone on
 * top whose amplitude tracks the strength of the entanglement.
 *
 * Implementation: a `Gain` whose input is one oscillator and whose `.gain`
 * AudioParam is driven by the other oscillator's signal — the canonical
 * Web Audio ring-mod trick (gain modulated at audio rate by a bipolar
 * signal produces the product of the two waveforms).
 */
import * as Tone from 'tone';
import { getOscNode } from './oscillators';
import { getMasterIn } from './master';

interface RingPair {
  i: number;
  j: number;
  ring: Tone.Gain; // gain is modulated by oscJ; input is oscI -> output = oscI * oscJ
  ringOut: Tone.Gain; // overall ring level (driven by correlation strength)
  panner: Tone.Panner; // stereo position (the pair's average)
}

export interface ActiveRing {
  i: number;
  j: number;
  strength: number; // 0..1, drives ring output level
  gateOpen: boolean; // both modulated voices are open this shot — else mute the ring
  pan: number; // stereo position -1..+1 (average of the pair)
}

const pairs = new Map<string, RingPair>();
const FADE = 0.06;
const MAX_RING_GAIN = 0.22; // keep below the direct oscillator output

function key(i: number, j: number): string {
  return i < j ? `${i}|${j}` : `${j}|${i}`;
}

function disposePair(p: RingPair): void {
  // Cancel any ramps then fade out, then dispose. Dispose disconnects upstream
  // taps from the oscillator nodes automatically.
  p.ringOut.gain.cancelScheduledValues(Tone.now());
  p.ringOut.gain.rampTo(0, FADE);
  setTimeout(() => {
    try {
      p.ring.dispose();
      p.ringOut.dispose();
      p.panner.dispose();
    } catch {
      // ignore — already disposed
    }
  }, (FADE + 0.04) * 1000);
}

export function updateRingMods(active: ActiveRing[]): void {
  const wanted = new Map<string, ActiveRing>();
  for (const a of active) wanted.set(key(a.i, a.j), a);

  // Drop pairs that are no longer active.
  for (const [k, p] of pairs.entries()) {
    if (!wanted.has(k)) {
      disposePair(p);
      pairs.delete(k);
    }
  }

  // Create or refresh active pairs.
  for (const [k, a] of wanted.entries()) {
    let p = pairs.get(k);
    if (!p) {
      const oscI = getOscNode(a.i);
      const oscJ = getOscNode(a.j);
      if (!oscI || !oscJ) continue;
      const ring = new Tone.Gain(0); // gain.value 0 initially; oscJ will drive it
      const ringOut = new Tone.Gain(0);
      const panner = new Tone.Panner(a.pan);
      oscI.connect(ring);
      // OmniOscillator's `connect` accepts a Param signature too — cast to
      // any to keep Tone's overload bookkeeping happy.
      (oscJ.connect as any)(ring.gain);
      ring.connect(ringOut);
      ringOut.connect(panner);
      panner.connect(getMasterIn());
      p = { i: a.i, j: a.j, ring, ringOut, panner };
      pairs.set(k, p);
    }
    // Gate the ring tone with the voices it modulates: the raw oscillators keep
    // running even when a gated voice is closed, so without this the ring would
    // drone on through shots where nothing fired.
    const level = a.gateOpen ? Math.max(0, Math.min(1, a.strength)) * MAX_RING_GAIN : 0;
    p.ringOut.gain.rampTo(level, FADE);
    p.panner.pan.rampTo(Math.max(-1, Math.min(1, a.pan)), FADE);
  }
}

export function stopAllRingMods(): void {
  for (const p of pairs.values()) disposePair(p);
  pairs.clear();
}
