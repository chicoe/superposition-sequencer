<script lang="ts">
  // Shown on every load (it's an SSR-disabled SPA, so this renders client-side
  // on each page open / refresh). Dismissing only closes it for the current
  // session — refreshing brings it back.
  let open = true;

  function dismiss() {
    open = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dismiss();
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="intro-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="intro-title"
    on:click|self={dismiss}
  >
    <div class="card">
      <div class="head">
        <span class="bracket">[</span>
        <h2 id="intro-title">Superposition · Sequencer</h2>
        <span class="bracket">]</span>
      </div>

      <p class="what">
        The quantum circuit is your score, each <strong>qubit is a track</strong>. Playing it <em>measures</em> the circuit, and those
        shots trigger the sounds: the same pattern plays differently every time, entangled
        qubits share correlated rhythms and modulated sounds.
      </p>

      <ol class="steps">
        <li>
          <span class="n">1</span>
          <span class="txt">
            Load a preset (try <strong>Entangled Pair</strong>) or drag gates from the toolbox onto
            the circuit. Bloch spheres represent the qubits' states.
          </span>
        </li>
        <li>
          <span class="n">2</span>
          <span class="txt">
            Press <strong>Play</strong> to measure — watch the shot history react on every beat.
          </span>
        </li>
        <li>
          <span class="n">3</span>
          <span class="txt">
            Tweak gates, BPM, sounds and scale. Open <strong>Compute</strong> to run real shots on a
            simulator or IonQ hardware.
          </span>
        </li>
      </ol>

      <p class="note">Audio starts on Play — your browser needs that first click.</p>

      <p class="cohort">
        An experimental tool, still under development —
        <a
          href="https://qollab.xyz/u/incomputable/superposition-sequencer"
          target="_blank"
          rel="noopener noreferrer">more about this project</a
        >.
        <br />
        Part of the
        <a href="https://qollab.xyz/rfp" target="_blank" rel="noopener noreferrer">Spring 2026 cohort</a>
        of Qollab's Quantum Creative Challenge.
      </p>

      <button class="start" on:click={dismiss}>Start playing →</button>
    </div>
  </div>
{/if}

<style>
  .intro-overlay {
    position: fixed;
    inset: 0;
    background: rgba(12, 20, 24, 0.85);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 7000;
    padding: 1rem;
  }
  .card {
    background: var(--bg-1);
    border: 1px solid var(--mint);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(207, 225, 182, 0.18);
    padding: 1.5rem 1.6rem;
    color: var(--fg);
    font-family: var(--mono);
    max-width: 460px;
    width: min(460px, 100%);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    justify-content: center;
  }
  .head .bracket {
    color: var(--mint);
    font-size: 1rem;
  }
  .head h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mint-bright);
  }
  .what {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.6;
    color: var(--fg-dim);
  }
  .what strong {
    color: var(--fg);
    font-weight: 600;
  }
  .what em {
    color: var(--beige);
    font-style: normal;
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .steps li {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
    font-size: 0.76rem;
    line-height: 1.5;
    color: var(--fg-dim);
  }
  /* The text is one flex item beside the number badge, so the prose (and its
     <strong> spans) flows and wraps as a single paragraph instead of each run
     becoming its own flex column. */
  .steps .txt {
    flex: 1;
    min-width: 0;
  }
  .steps strong {
    color: var(--fg);
    font-weight: 600;
  }
  .steps .n {
    flex: 0 0 auto;
    width: 1.25rem;
    height: 1.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--mint);
    color: var(--mint);
    font-size: 0.65rem;
    border-radius: 50%;
  }
  .note {
    margin: 0;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    color: var(--fg-mute);
  }
  .cohort {
    margin: 0;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    line-height: 1.5;
    color: var(--fg-mute);
  }
  .cohort a {
    color: var(--mint);
    text-decoration: none;
    border-bottom: 1px dashed var(--mint);
  }
  .cohort a:hover {
    color: var(--mint-bright);
    border-bottom-color: var(--mint-bright);
  }
  .start {
    align-self: flex-end;
    background: var(--bg-3);
    border: 1px solid var(--mint);
    color: var(--mint);
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
    transition: background 100ms ease, color 100ms ease;
  }
  .start:hover {
    background: var(--mint);
    color: var(--bg);
  }
</style>
