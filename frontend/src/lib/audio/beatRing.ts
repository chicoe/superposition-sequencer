/**
 * Per-qubit "entanglement ring" layer for BEAT-mode voices.
 *
 * Ring modulation needs two continuous signals, but a beat is a transient — and
 * the drum synths are shared per-sound, so there's no per-qubit beat node to
 * tap. Instead of modulating the drum itself, we layer a parallel percussive
 * ring-mod PING that fires *with* the beat, but only when that qubit is
 * entangled: a clean drum when it's independent, a metallic, measured-pitch
 * clang when it's entangled. The ping level tracks the qubit's pairwise mutual
 * information, so the effect fades in exactly as correlation builds.
 *
 * Signal: carrier osc ── ┐
 *                        ├─ ring (carrier × modulator) ─ amp env ─ level ─ out
 *         modulator osc ─┘   (audio-rate gain modulation = ring modulation)
 *
 * Both oscillators run continuously but are inaudible between hits — the
 * percussive amplitude envelope is what lets a short burst through.
 */
import * as Tone from 'tone';
import { getMasterIn } from './master';

interface RingVoice {
  carrier: Tone.Oscillator;
  mod: Tone.Oscillator;
  ring: Tone.Gain;
  env: Tone.AmplitudeEnvelope;
  level: Tone.Gain;
  panner: Tone.Panner;
}

const voices = new Map<number, RingVoice>();

// Peak ping level at full entanglement (kept below the dry drum so it colours
// rather than replaces the hit). Decay is the percussive tail. Both tunable.
const MAX_BEATRING = 0.3;
const DECAY = 0.18; // seconds

function ensure(q: number): RingVoice {
  let v = voices.get(q);
  if (!v) {
    const carrier = new Tone.Oscillator(220, 'triangle');
    const mod = new Tone.Oscillator(311, 'sine');
    const ring = new Tone.Gain(0); // base 0; the modulator drives .gain
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.001,
      decay: DECAY,
      sustain: 0,
      release: 0.08
    });
    const level = new Tone.Gain(0);
    const panner = new Tone.Panner(0);
    carrier.connect(ring);
    // Connecting an oscillator to a Gain's `.gain` AudioParam modulates it at
    // audio rate — output = carrier × modulator (the canonical ring-mod trick).
    (mod.connect as any)(ring.gain);
    ring.connect(env);
    env.connect(level);
    level.connect(panner);
    panner.connect(getMasterIn());
    carrier.start();
    mod.start();
    v = { carrier, mod, ring, env, level, panner };
    voices.set(q, v);
  }
  return v;
}

/**
 * Fire one ring ping for an entangled beat hit.
 *
 * @param when       audio-context time (seconds)
 * @param carrierHz  the ping's pitch (we feed the measured scale pitch)
 * @param modHz      modulator frequency — an inharmonic ratio of the carrier
 *                   gives the metallic, ring-modulated character
 * @param strength   entanglement 0..1 → ping level
 */
export function triggerBeatRing(
  q: number,
  when: number,
  carrierHz: number,
  modHz: number,
  strength: number,
  pan = 0
): void {
  const v = ensure(q);
  const safeWhen = Math.max(when, Tone.now() + 0.01);
  v.carrier.frequency.setValueAtTime(Math.max(20, carrierHz), safeWhen);
  v.mod.frequency.setValueAtTime(Math.max(20, modHz), safeWhen);
  v.panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), safeWhen);
  v.level.gain.setValueAtTime(Math.max(0, Math.min(1, strength)) * MAX_BEATRING, safeWhen);
  v.env.triggerAttackRelease(DECAY, safeWhen);
}

/** Tear down all ping voices (on stop). They re-create lazily on the next hit. */
export function stopAllBeatRings(): void {
  for (const v of voices.values()) {
    try {
      v.carrier.stop();
      v.mod.stop();
      v.carrier.dispose();
      v.mod.dispose();
      v.ring.dispose();
      v.env.dispose();
      v.level.dispose();
      v.panner.dispose();
    } catch {
      // ignore — already disposed
    }
  }
  voices.clear();
}
