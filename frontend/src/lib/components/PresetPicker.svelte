<script lang="ts">
  import { PRESETS } from '$lib/quantum/presets';
  import { loadCircuit, currentStep } from '$lib/stores/circuit';
  import { bpm, mode, resetShots } from '$lib/stores/playback';
  import { computedRun, clearRun, parseRunFile } from '$lib/stores/run';
  import { resetRunCursor } from '$lib/audio/sequencer';
  import type { Preset } from '$lib/quantum/presets';

  export let onLoad: () => void = () => {};

  function load(p: Preset) {
    // If the preset ships a bundled hardware run, load its circuit + per-step
    // memory and switch to Auto so Play cycles the computed steps; otherwise
    // load the spec for live preview and drop any active run.
    const run = p.run ? parseRunFile(p.run) : null;
    const spec = run ? run.circuit : p.spec;
    loadCircuit(spec);
    bpm.set(p.suggestedBpm);
    resetShots(spec.num_qubits);
    if (run) {
      computedRun.set(run);
      mode.set('auto');
      // Land on the first computed step (loadCircuit defaults to the last step,
      // which a partial run may not cover) so playback starts on real data and
      // the run badge reads correctly straight away.
      const steps = Object.keys(run.steps).map(Number);
      if (steps.length) currentStep.set(Math.min(...steps));
      resetRunCursor();
    } else {
      clearRun();
    }
    onLoad();
  }
</script>

<div class="row">
  <span class="hint">› Presets</span>
  {#each PRESETS as p}
    <button on:click={() => load(p)} title={p.description}>{p.name}</button>
  {/each}
</div>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
    background: var(--bg-1);
    border: 1px solid var(--border);
    padding: 0.5rem 0.75rem;
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--fg);
    letter-spacing: 0.04em;
  }
  .hint {
    color: var(--fg-dim);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.7rem;
    margin-right: 0.25rem;
  }
  button {
    background: transparent;
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 0;
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font: inherit;
    letter-spacing: 0.04em;
  }
  button:hover {
    background: var(--bg-2);
    border-color: var(--mint);
    color: var(--mint);
  }
</style>
