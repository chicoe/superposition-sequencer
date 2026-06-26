<script lang="ts">
  import { onMount } from 'svelte';
  import { circuit, currentStep, numQubits, loadCircuit } from '$lib/stores/circuit';
  import { findPreset } from '$lib/quantum/presets';
  import { resetRunCursor } from '$lib/audio/sequencer';
  import { allSteps } from '$lib/stores/quantum';
  import { resetShots } from '$lib/stores/playback';
  import { syncCircuit } from '$lib/quantum/client';
  import { randomizeSoundParams } from '$lib/audio/randomize';
  import type { GateName } from '$lib/types';

  import CircuitDiagram from '$lib/components/CircuitDiagram.svelte';
  import MutualInfoMatrix from '$lib/components/MutualInfoMatrix.svelte';
  import ConnectorOverlay from '$lib/components/ConnectorOverlay.svelte';
  import ShotHistory from '$lib/components/ShotHistory.svelte';
  import Transport from '$lib/components/Transport.svelte';
  import GatePalette from '$lib/components/GatePalette.svelte';
  import StepNavigator from '$lib/components/StepNavigator.svelte';
  import PresetPicker from '$lib/components/PresetPicker.svelte';
  import QiskitCode from '$lib/components/QiskitCode.svelte';
  import ComputePanel from '$lib/components/ComputePanel.svelte';
  import GateIcon from '$lib/components/GateIcon.svelte';
  import { paletteDrag } from '$lib/stores/paletteDrag';
  import { computedRun, clearRun, parseRunFile } from '$lib/stores/run';
  import { circuitQasm } from '$lib/stores/qasm';
  import { WIRE_H, TOP_PAD, STEP_W } from '$lib/components/circuitLayout';

  // The circuit area grows to fill the screen, but we bound how much the SVG
  // may scale so it neither balloons (a 2-qubit circuit blowing the spheres up
  // to fill a tall panel) nor shrinks into illegibility (8 qubits squeezed onto
  // a short laptop). Below the floor we'd rather keep the circuit readable and
  // let the page scroll; above the cap we'd rather leave a little slack than
  // cartoon-size the spheres. CHROME is the title row + footer wrapped around
  // the SVG inside the panel.
  const MIN_SCALE = 0.72;
  const MAX_SCALE = 1.5;
  const CHROME = 74;
  $: intrinsicH = TOP_PAD * 2 + WIRE_H * $circuit.num_qubits;
  $: circuitMinH = Math.max(360, Math.round(MIN_SCALE * intrinsicH + CHROME));
  $: circuitMaxH = Math.round(MAX_SCALE * intrinsicH + CHROME);

  // The UI starts narrow (centred, with bands either side) for a short circuit
  // and widens toward the full 1400px as steps/qubits are added — so the
  // horizontal space tracks how much circuit there is to show, instead of one
  // fixed-width layout that looks empty when the circuit is small.
  $: mainMaxW = Math.round(
    Math.min(1400, Math.max(1000, 700 + $circuit.num_steps * STEP_W + $circuit.num_qubits * 18))
  );

  let selectedGate: GateName | null = null;
  let pendingControl: { step: number; qubit: number } | null = null;
  let error: string | null = null;
  let syncing = false;

  let syncToken = 0;
  async function resync() {
    syncing = true;
    error = null;
    const token = ++syncToken;
    try {
      // One stateless round trip: post the whole circuit, get qasm + all steps.
      const res = await syncCircuit($circuit);
      if (token !== syncToken) return; // stale
      circuitQasm.set(res.qasm ?? '');
      allSteps.set(res.steps);
      // Clamp current step.
      currentStep.update((s) => Math.min(s, res.total_steps - 1));
    } catch (e) {
      if (token === syncToken) {
        error = e instanceof Error ? e.message : String(e);
      }
    } finally {
      if (token === syncToken) syncing = false;
    }
  }

  // Resync whenever the circuit changes. Debounced via microtask coalescing.
  // Editing the circuit invalidates any active computed run — the bitstrings
  // no longer reflect what the circuit produces — *unless* this change is
  // itself the snapshot being restored by a Load Run.
  let lastSerialized = '';
  $: {
    const ser = JSON.stringify($circuit);
    if (ser !== lastSerialized) {
      lastSerialized = ser;
      // fire-and-forget; errors surface via the `error` reactive var
      resync();
      resetShots($circuit.num_qubits);
      const run = $computedRun;
      if (run && JSON.stringify(run.circuit) !== ser) {
        clearRun();
      }
    }
  }

  onMount(() => {
    randomizeSoundParams();
    resetShots($numQubits);
    // Start with the default preset's bundled hardware run loaded, but unlike
    // a PresetPicker load stay in manual mode, landing on the run's deepest
    // computed layer — so the page opens on real IonQ shots, as far into the
    // circuit as the bundled run reaches.
    const p = findPreset('entangled-pair');
    const run = p?.run ? parseRunFile(p.run) : null;
    if (run) {
      loadCircuit(run.circuit);
      computedRun.set(run);
      const steps = Object.keys(run.steps).map(Number);
      if (steps.length) currentStep.set(Math.max(...steps));
      resetRunCursor();
    }
  });

  function addQubit() {
    circuit.update((c) => ({ ...c, num_qubits: Math.min(8, c.num_qubits + 1) }));
  }
  function removeQubit() {
    circuit.update((c) => {
      const next = Math.max(1, c.num_qubits - 1);
      return { ...c, num_qubits: next, gates: c.gates.filter((g) => {
        if (g.qubit !== undefined) return g.qubit < next;
        if (g.control !== undefined && g.target !== undefined) return g.control < next && g.target < next;
        if (g.qubit1 !== undefined && g.qubit2 !== undefined) return g.qubit1 < next && g.qubit2 < next;
        return true;
      }) };
    });
  }
  function addStep() {
    circuit.update((c) => ({ ...c, num_steps: Math.min(32, c.num_steps + 1) }));
  }
  function removeStep() {
    circuit.update((c) => {
      const next = Math.max(1, c.num_steps - 1);
      return { ...c, num_steps: next, gates: c.gates.filter((g) => g.step < next) };
    });
  }
</script>

<main style={`max-width: ${mainMaxW}px`}>
  <header>
    <div class="title">
      <span class="bracket">[</span>
      <h1>SUPERPOSITION · SEQUENCER</h1>
      <span class="bracket">]</span>
    </div>
    <p class="sub">The quantum circuit controls the sequence · qubits = tracks · measurements = beats</p>
  </header>

  <div class="top-bar">
    <PresetPicker onLoad={() => (selectedGate = null)} />
    <ComputePanel />
  </div>

  <div class="diagram-block">
    <section
      class="circuit-area brackets grid-bg"
      style={`--circuit-min-h: ${circuitMinH}px; --circuit-max-h: ${circuitMaxH}px;`}
    >
      <div class="title-row">
        <span class="section-label">› Quantum Circuit</span>
        {#if syncing}<span class="status">syncing…</span>{/if}
        {#if error}<span class="error">{error}</span>{/if}
      </div>
      <div class="body">
        <GatePalette bind:selected={selectedGate} bind:pendingControl />
        <div class="center-group">
          <CircuitDiagram bind:selectedGate bind:pendingControl />
        </div>
      </div>
      <div class="footer">
        <StepNavigator />
        <div class="size-controls">
          <span class="lbl">qubits</span>
          <button class="ctl" on:click={removeQubit}>−</button>
          <span class="val">{$circuit.num_qubits}</span>
          <button class="ctl" on:click={addQubit}>+</button>
          <span class="sep" />
          <span class="lbl">layers</span>
          <button class="ctl" on:click={removeStep}>−</button>
          <span class="val">{$circuit.num_steps}</span>
          <button class="ctl" on:click={addStep}>+</button>
        </div>
      </div>
    </section>

    <div class="timeline-row">
      <ShotHistory />
      <!-- The MI matrix sits at the far right (under the staircase, which now
           reaches the right edge of the circuit); Shot History fills all the
           space to its left. -->
      <MutualInfoMatrix />
    </div>

    <ConnectorOverlay />
  </div>

  <Transport />

  <QiskitCode />
</main>

{#if $paletteDrag}
  {@const dragGate = $paletteDrag.gate}
  {@const dragAccent = dragGate.startsWith('r') ? 'var(--beige)' : 'var(--mint)'}
  {@const dragLabel = dragGate === 'rx' ? 'Rx' : dragGate === 'ry' ? 'Ry' : dragGate === 'rz' ? 'Rz' : dragGate.toUpperCase()}
  <div class="palette-ghost" style="left: {$paletteDrag.x}px; top: {$paletteDrag.y}px;">
    <svg viewBox="0 0 48 26" width="48" height="26">
      <rect x={0.5} y={0.5} width={47} height={25} fill={dragAccent} stroke={dragAccent} stroke-width="1" />
      <rect x={1.5} y={1.5} width={45} height={23} fill="var(--bg-1)" />
      <GateIcon name={dragGate} x={2} y={5} size={16} color={dragAccent} />
      <text x={33} y={17} text-anchor="middle" fill={dragAccent} font-family="var(--mono)" font-size="11" font-weight="600" letter-spacing="0.05em">
        {dragLabel}
      </text>
    </svg>
  </div>
{/if}

<style>
  main {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    /* Fills the shell minus the footer; grows past it (page scrolls) only when
       a big circuit needs the room. flex-shrink 0 so it never collapses below
       its content (which would overlap the transport bar). */
    flex: 1 0 auto;
    min-height: 0;
    box-sizing: border-box;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    flex-wrap: wrap;
    flex-shrink: 0;
  }
  .title {
    display: inline-flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .bracket {
    color: var(--mint);
    font-family: var(--mono);
    font-size: 1.15rem;
  }
  h1 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--mint);
    letter-spacing: 0.18em;
    font-weight: 500;
    text-transform: uppercase;
  }
  .sub {
    margin: 0;
    color: var(--fg-mute);
    font-size: 0.72rem;
    letter-spacing: 0.05em;
  }
  .top-bar {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex-shrink: 0;
  }
  .diagram-block {
    /* Positioning context for the connector overlay so it can absolutely-
       position itself over circuit + timeline-row as one cohesive block. */
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    /* Size to content (don't grow, don't shrink). The circuit-area already
       grows to its min/max-height band internally, so the block doesn't need to
       stretch — and NOT stretching means a tall screen leaves its slack at the
       bottom (everything stays grouped at the top) instead of opening a gap
       between the timeline and the transport. On short screens the page scrolls. */
    flex: 0 0 auto;
  }
  .timeline-row {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .timeline-row > :global(.panel:first-child) {
    /* Shot History fills everything left of the (right-docked) matrix. */
    flex: 1 1 0;
    min-width: 0;
  }
  .circuit-area {
    background: var(--bg-1);
    border: 1px solid var(--border);
    padding: 0.7rem 0.85rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    /* Grow to fill the block's height (the readout row below is fixed), so the
       circuit + Bloch spheres scale up to use the screen instead of leaving a
       dead band — bounded by min/max-height (driven off the qubit count) so the
       circuit stays legible on short screens and doesn't balloon on tall ones. */
    flex: 1 1 auto;
    min-height: var(--circuit-min-h, 360px);
    max-height: var(--circuit-max-h, none);
  }
  .title-row {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }
  .body {
    display: grid;
    /* Toolbox hugs the left edge; the center group (circuit + spheres) takes the
       remaining space. The circuit fills that width (stepW solves to it), so its
       measurements reach the right edge and flow straight down into the matrix. */
    grid-template-columns: max-content minmax(0, 1fr);
    /* One row that FILLS (and can shrink within) the body's height, rather than
       the default `auto` row that sizes to the SVG's content — otherwise the
       circuit's height:100% chain never resolves and the SVG renders taller than
       the panel on short windows, spilling the bottom wire/sphere past it. */
    grid-template-rows: minmax(0, 1fr);
    gap: 0.6rem;
    align-items: stretch;
    flex: 1 1 0;
    min-height: 0;
  }
  .center-group {
    display: flex;
    align-items: stretch;
    justify-content: center;
    min-width: 0;
  }
  /* Circuit (which embeds the sphere column) sizes to its content. */
  .center-group :global(.wrap) {
    flex: 0 1 auto;
    min-width: 0;
  }
  .footer {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    padding-top: 0.35rem;
    border-top: 1px dashed var(--border-dim);
  }
  .size-controls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--fg);
    font-family: var(--mono);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .size-controls .ctl {
    padding: 0.1rem 0.4rem;
    min-width: 1.5rem;
  }
  .lbl {
    color: var(--fg-mute);
  }
  .val {
    width: 1.5rem;
    text-align: center;
    color: var(--mint);
  }
  .sep {
    display: inline-block;
    width: 1px;
    height: 1rem;
    background: var(--border);
    margin: 0 0.3rem;
  }
  .status {
    color: var(--fg-mute);
    font-family: var(--mono);
    font-size: 0.7rem;
  }
  .error {
    color: var(--mauve);
    font-size: 0.7rem;
    word-break: break-word;
  }
  @media (max-width: 800px) {
    .body {
      grid-template-columns: 1fr;
      gap: 0.4rem;
      /* Size to content (the width-driven SVG height), don't fill/collapse —
         otherwise the flexed body shrinks while the SVG keeps its intrinsic
         height and overflows onto the footer controls. */
      flex: 0 0 auto;
      min-height: auto;
    }
    .circuit-area {
      /* Drop the desktop min/max-height and growth — on mobile the circuit
         auto-sizes off width and the page just scrolls. */
      flex: 0 0 auto;
      min-height: 0;
      max-height: none;
    }
  }
  .palette-ghost {
    position: fixed;
    pointer-events: none;
    transform: translate(-50%, -50%);
    z-index: 1000;
    opacity: 0.9;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
  }
</style>
