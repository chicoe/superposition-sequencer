<script lang="ts">
  import { currentStep, numSteps } from '$lib/stores/circuit';
  import { noteStepChanged } from '$lib/audio/sequencer';

  function step(delta: number) {
    currentStep.update((s) => (s + delta + $numSteps) % $numSteps);
    // Keep shot history — the timeline shows the step-change marker.
    // shotCount + per-step rate% are derived from history, so no resets needed here.
    noteStepChanged();
  }
</script>

<div class="nav">
  <button on:click={() => step(-1)} aria-label="previous layer">◀</button>
  <span class="counter">layer <em>{String($currentStep + 1).padStart(2, '0')}</em> / {String($numSteps).padStart(2, '0')}</span>
  <button on:click={() => step(1)} aria-label="next layer">▶</button>
</div>

<style>
  .nav {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--mono);
    color: var(--fg);
    font-size: 0.72rem;
  }
  button {
    background: var(--bg-3);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 0;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    font: inherit;
  }
  button:hover {
    background: var(--bg-2);
    border-color: var(--mint);
    color: var(--mint);
  }
  .counter {
    min-width: 7rem;
    text-align: center;
    color: var(--fg-dim);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .counter em {
    color: var(--mint);
    font-style: normal;
  }
</style>
