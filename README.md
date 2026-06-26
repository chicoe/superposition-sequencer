# Superposition Sequencer

**A browser-based quantum music sequencer: build a quantum circuit, then measure it into music.**

Build a quantum circuit, press play, and listen to it being measured. Each qubit is a
**track**. The transport walks through the circuit's **layers** (its columns of gates),
and on every beat it takes one **measurement** — a *shot* — that fires the tracks. Each
layer is held for a handful of shots before moving on. Because the instrument is genuinely
*probabilistic*, no two shots are alike — the same layer never plays the same way twice —
and entangled qubits lock into correlated rhythms.

> *Built for the Qollab Quantum Creative Challenge (Spring 2026 cohort).*

🎛️ **Live app:** https://superposition-sequencer.incomputable.io

---

## The idea

A step sequencer has **tracks** down the side and time across the top; you program it,
press play, and it walks the grid triggering sounds. The Superposition Sequencer keeps the
tracks — one per qubit — but replaces the programmed grid with a **quantum circuit**, and
it doesn't *store* the rhythm so much as *generate* it.

You don't place hits. You place **gates**, and the gates shape a probability
distribution. The transport then walks through the circuit's **layers** (its columns of
gates), and on every beat it **measures** the current layer — one *shot* — collapsing the
state into a column of triggers across the tracks:

- **Each qubit is a track** — a drum or a synth voice.
- **Each layer** (a column of gates) is a stage the transport holds and re-measures.
- **Each measurement is a shot** — one beat, one fresh column of triggers across the tracks.

A layer is held for several shots (sixteen by default) before the transport advances, so the
music falls out of the quantum state rather than being written down.

---

## How a quantum state becomes music

This is the heart of the instrument. At every layer the backend gives the browser the
full quantum state, plus each qubit's Bloch vector — its angles **θ** (polar) and
**φ** (azimuth) and its length **r**. Those map directly onto musical parameters:

| Quantum quantity | Musical meaning |
|---|---|
| **θ — polar angle** | **Trigger probability.** A qubit fires on a beat when it measures \|0⟩; the chance of that is `cos²(θ/2)`. A qubit at the north pole fires every time; at the equator it's a coin flip; at the south pole it stays silent. |
| **φ — phase** | **Swing.** The phase angle shifts the hit earlier or later within the beat, so phase gates literally push the groove ahead of or behind the grid. |
| **r — Bloch-vector length (purity)** | **Timbre.** Entanglement makes an individual qubit's state mixed (`r < 1`), and the instrument treats that as real physics to be heard, not a value to normalize away. |
| **The full bitstring** | **Pitch (melodic voices).** The melodic synths (bass, pluck, pad, bell) read the whole measured bitstring as an index into the active scale, so the note follows the entire measurement, not one qubit. Drums keep a fixed pitch. |

So a single `Ry(θ)` gate is a "how often does this drum hit" knob. An `Rz(φ)` gate is a
swing knob. And an `H` on every qubit gives you four tracks each shimmering at 50% — a
generative haze that never repeats.

---

## Entanglement you can hear

The reason a quantum sequencer is more than a fancy random-number generator is
**entanglement**, and the instrument is built to make it audible rather than hide it.

- **Shots are sampled from the *whole* statevector**, never qubit-by-qubit. That's the
  one rule you can't break: sample each qubit independently and you destroy the
  correlations, and the entanglement presets become meaningless noise. Sampling the
  joint distribution keeps them intact, so two entangled qubits *always fire together*
  even though each one, alone, looks like a 50/50 coin.
- **A live mutual-information matrix** shows how connected each pair of qubits is, in
  bits, updating every beat as correlations build up in the shot stream.
- **Entangled oscillator pairs ring-modulate each other**, with the strength tracking
  that same mutual information — so as a Bell state locks in, you hear the voices
  fuse. (This is the headline entanglement effect; you can also export it as a MIDI CC to
  drive a filter on an external synth.)

Load **Entangled Pair** (a Bell state) and you'll hear two tracks that are individually
random but perfectly synchronized. Load **All or Nothing** (a 4-qubit GHZ state) and the
whole kit hits in unison — or everything drops to silence at once. Pure quantum lockstep.

---

## Features

- **Drag-and-drop circuit builder** with the standard gate set: H, X, Y, Z, S/T,
  parametrized **Rx / Ry / Rz** (dial the angle and the UI shows the resulting trigger
  probability), and two-qubit **CNOT, CZ, SWAP**.
- **Six presets** that each use all four qubits musically: Clear, Pulse, Entangled Pair,
  All or Nothing (GHZ), Phase Swing, and an eight-layer Cascade.
- **Per-track voicing:** drum and synth sounds, plus playback modes — *beat* (triggered
  hits), *gated* and *drone* oscillators, or *none* — with waveform and octave controls.
- **Live 3D Bloch spheres** (one per qubit) showing each state evolve through the circuit.
- **A shot-history timeline** and a mutual-information matrix wired into it so you can
  see correlations form in real time.
- **Layer navigation:** scrub through the circuit layer by layer and hear each
  intermediate state.

---

## Running it on real hardware

Preview mode samples the state locally in the browser for instant feedback. When you
want the real thing, **Compute** runs the circuit on a backend and freezes the result so
playback replays exactly what the hardware returned:

- **Qiskit Aer** for a fast, ideal local simulation.
- **IonQ** — via the Qiskit IonQ provider — for measurements on a trapped-ion quantum
  computer, including its simulator with realistic noise.

Compute is **per layer**, so you can run a circuit one layer at a time on hardware, see
which layers are done, and have playback cycle only the computed layers. Frozen runs can be
saved and reloaded, and the presets can ship with a bundled hardware run that loads
automatically — so a listener hears genuine quantum measurements, not just a simulation.

Your IonQ API key is entered in the browser, kept in memory only (never persisted),
sent in the body of the compute request over HTTPS, and used by the backend solely for
the lifetime of that request.

---

## Taking it out of the browser

The sequencer is meant to plug into the rest of your setup:

- **OpenQASM 3.0** import/export, so circuits move in and out of any quantum toolchain.
- **A self-contained Qiskit + Python script** you can copy and run on Qollab's backend to
  render the piece to MIDI server-side.
- **MIDI file export** — one track per qubit, with the per-qubit channel layout of your
  choice, plus a dedicated **entanglement track**: each qubit pair's mutual information is
  written as a continuous MIDI CC, so an external synth can map "how entangled is this
  pair" straight onto a filter.
- **Real-time MIDI output** (Web MIDI, in Chromium browsers): pick an output port and the
  sequencer streams notes *and* the live entanglement CCs to your hardware or DAW, so you
  can drive external synths from a running quantum circuit.

---

## Quick start (using the app)

1. **Load a preset** — *Entangled Pair* is the most illustrative — or drag gates onto the
   grid. The Bloch spheres show what each qubit is doing.
2. **Press Play.** Audio starts on that first click (browsers require a user gesture).
   Watch the shot history react on every beat.
3. **Tweak** gates, BPM, sounds, root note and scale. Switch a qubit to AUTO to hear the
   texture evolve across the circuit's layers.
4. **Go quantum:** open **Compute** to run real shots on a simulator or on IonQ hardware,
   then export to MIDI / OpenQASM or stream live MIDI to your synths.

---

## Under the hood

A two-tier app, fully serverless:

- **Frontend** (`frontend/`) — a SvelteKit single-page app using **Threlte** (Three.js)
  for the 3D Bloch spheres and **Tone.js** for sample-accurate audio scheduling. Builds
  to static files on **Firebase Hosting**.
- **Backend** (`backend/`) — a stateless **FastAPI** service running **Qiskit 1.x** on
  **Cloud Run** (scale-to-zero). It builds the circuit from a gate list, extracts each
  qubit's Bloch vector at every layer via partial trace, and samples measurement outcomes
  from the full statevector. Aer and IonQ sit behind the same API.


---

## Documentation

| Doc | What it covers |
|---|---|
| [`RUNNING.md`](RUNNING.md) | Running both dev servers locally (backend `:8000`, frontend `:5173`) and the test suite. |
| [`DEPLOY.md`](DEPLOY.md) | Deploying the frontend to Firebase Hosting and the backend to Cloud Run, end to end. |

---

## Links

- 🎛️ **Live app:** https://superposition-sequencer.incomputable.io
- 📄 **Project page:** https://qollab.xyz/u/incomputable/superposition-sequencer
- 🗺️ **The challenge:** https://qollab.xyz/rfp

---

## Credits

Built by Francisco Ramazzini Estivallet ([incomputable.io](https://incomputable.io)) for
Qollab's Quantum Creative Challenge — Spring 2026.

This effort is supported via compute credits from **Qollab** and **IonQ**.

Quantum SDK: **Qiskit**. Hardware: **IonQ** (trapped-ion). Released under the
**MIT** license — see [`LICENSE`](LICENSE).
