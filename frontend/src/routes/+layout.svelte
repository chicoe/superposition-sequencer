<script lang="ts">
  import './app.css';
  import { isComputing } from '$lib/stores/compute';
  import { BACKEND_LABELS, isHardware } from '$lib/stores/run';
  import { tooltip } from '$lib/stores/tooltip';
  import IntroModal from '$lib/components/IntroModal.svelte';
  import { onDestroy } from 'svelte';

  let elapsed = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  $: if ($isComputing) {
    if (timer === null) {
      elapsed = 0;
      timer = setInterval(() => {
        if ($isComputing) {
          elapsed = Math.floor((Date.now() - $isComputing.startedAt) / 1000);
        }
      }, 500);
    }
  } else if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  onDestroy(() => {
    if (timer !== null) clearInterval(timer);
  });
</script>

<IntroModal />

<div class="shell">
  <slot />

  <footer>
    [ built by
    <a href="https://www.incomputable.io" target="_blank" rel="noopener noreferrer">incomputable.io</a>
    for Qollab's Quantum Creative Challenge — Spring 2026 ]
    <span class="attribution">This effort is supported via compute credits from Qollab and IonQ.</span>
  </footer>
</div>

{#if $isComputing}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="compute-overlay" role="alertdialog" aria-modal="true" aria-busy="true">
    <div class="card">
      <div class="spinner" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <div class="lbl">
        <span class="tag">{isHardware($isComputing.backend) ? '! HARDWARE' : '· COMPUTING'}</span>
        {BACKEND_LABELS[$isComputing.backend]}
      </div>
      <div class="meta">
        {$isComputing.shots} shots · {elapsed}s elapsed
      </div>
      <div class="hint">
        {#if isHardware($isComputing.backend)}
          waiting in the QPU queue. don't refresh — your job is in flight.
        {:else}
          running locally, this should be quick.
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if $tooltip}
  <div class="gate-tooltip" style="left: {$tooltip.x}px; top: {$tooltip.y}px;">
    <div class="tt-head">
      <span class="tt-title">{$tooltip.title}</span>
      {#if $tooltip.subtitle}<span class="tt-sub">· {$tooltip.subtitle}</span>{/if}
    </div>
    <div class="tt-body">{$tooltip.body}</div>
  </div>
{/if}

<style>
  /* main (the slot) + footer share one viewport: main flexes to fill, the
     footer sits under it, and the whole thing only scrolls when the circuit is
     too big to fit. Without this the footer hangs below a 100vh main and the
     page always scrolled by its height. */
  .shell {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  footer {
    text-align: center;
    color: var(--fg-mute);
    font-size: 0.65rem;
    padding: 0.6rem;
    font-family: var(--mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  /* Required challenge attribution — its own line, kept subtle. */
  footer .attribution {
    display: block;
    margin-top: 0.35rem;
    color: var(--fg-mute);
    text-transform: none;
    letter-spacing: 0.06em;
    opacity: 0.85;
  }
  footer a {
    color: var(--mint);
    text-decoration: none;
    border-bottom: 1px dashed var(--mint);
  }
  footer a:hover {
    color: var(--mint-bright);
    border-bottom-color: var(--mint-bright);
  }

  .compute-overlay {
    position: fixed;
    inset: 0;
    background: rgba(12, 20, 24, 0.85);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5000;
    cursor: wait;
  }
  .compute-overlay .card {
    background: var(--bg-1);
    border: 1px solid var(--mint);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(207, 225, 182, 0.18);
    padding: 1.4rem 1.8rem;
    color: var(--fg);
    font-family: var(--mono);
    text-align: center;
    min-width: 280px;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    align-items: center;
  }
  .compute-overlay .tag {
    color: var(--mint);
    background: var(--bg-3);
    border: 1px solid var(--mint);
    padding: 0.1rem 0.5rem;
    margin-right: 0.5rem;
    font-size: 0.65rem;
    letter-spacing: 0.14em;
  }
  .compute-overlay .lbl {
    font-size: 0.85rem;
    color: var(--fg);
    letter-spacing: 0.08em;
  }
  .compute-overlay .meta {
    font-size: 0.72rem;
    color: var(--fg-dim);
    letter-spacing: 0.06em;
  }
  .compute-overlay .hint {
    font-size: 0.7rem;
    color: var(--fg-mute);
    max-width: 28ch;
    line-height: 1.45;
  }

  /* Four-dot pulse spinner — matches the blueprint aesthetic. */
  .compute-overlay .spinner {
    display: inline-flex;
    gap: 0.35rem;
    margin-bottom: 0.2rem;
  }
  .compute-overlay .spinner span {
    width: 0.5rem;
    height: 0.5rem;
    background: var(--mint);
    border-radius: 50%;
    animation: pulse 1.1s ease-in-out infinite;
  }
  .compute-overlay .spinner span:nth-child(2) {
    animation-delay: 0.15s;
  }
  .compute-overlay .spinner span:nth-child(3) {
    animation-delay: 0.3s;
  }
  .compute-overlay .spinner span:nth-child(4) {
    animation-delay: 0.45s;
  }
  @keyframes pulse {
    0%,
    80%,
    100% {
      opacity: 0.25;
      transform: scale(0.7);
    }
    40% {
      opacity: 1;
      transform: scale(1);
    }
  }

  .gate-tooltip {
    position: fixed;
    pointer-events: none;
    transform: translate(12px, 14px);
    z-index: 6000;
    background: var(--bg-1);
    border: 1px solid var(--mint);
    padding: 0.45rem 0.6rem;
    max-width: 280px;
    color: var(--fg);
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.55);
  }
  .gate-tooltip .tt-head {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    color: var(--mint);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.7rem;
    margin-bottom: 0.25rem;
  }
  .gate-tooltip .tt-sub {
    color: var(--fg-mute);
    text-transform: none;
    letter-spacing: 0.04em;
    font-weight: normal;
  }
  .gate-tooltip .tt-body {
    color: var(--fg-dim);
    line-height: 1.45;
  }
</style>
