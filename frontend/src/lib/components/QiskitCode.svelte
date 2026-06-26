<script lang="ts">
  import { circuit, currentStep, numQubits } from '$lib/stores/circuit';
  import { allSteps } from '$lib/stores/quantum';
  import { sounds } from '$lib/stores/sounds';
  import { bpm, mode, shotsPerStep } from '$lib/stores/playback';
  import { generateQiskitCode } from '$lib/quantum/qiskitCode';
  import { buildMidiBytes, downloadMidi } from '$lib/quantum/midiWriter';
  import { ccMapText } from '$lib/quantum/midiCC';
  import { trackChannels } from '$lib/stores/trackChannels';
  import { liveMidiEnabled, midiSupported, midiOutputs, selectedOutputId } from '$lib/stores/midiOut';
  import { enableMidi, disableMidi, setOutput } from '$lib/midi/output';

  let open = false;
  let copied = false;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let midiMsg = '';

  $: code = generateQiskitCode({
    spec: $circuit,
    sounds: $sounds,
    bpm: $bpm,
    shotsPerStep: $shotsPerStep,
    mode: $mode,
    currentStep: $currentStep,
    channels: $trackChannels
  });

  async function toggleLiveMidi() {
    midiMsg = '';
    if ($liveMidiEnabled) {
      disableMidi();
      return;
    }
    const ok = await enableMidi();
    if (!ok) midiMsg = 'MIDI access unavailable or denied';
  }

  function onPort(e: Event) {
    setOutput((e.currentTarget as HTMLSelectElement).value || null);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1400);
    } catch {
      copied = false;
    }
  }

  function exportMidi() {
    const bytes = buildMidiBytes({
      spec: $circuit,
      sounds: $sounds,
      bpm: $bpm,
      allSteps: $allSteps,
      mode: $mode,
      currentStep: $currentStep,
      shotsPerStep: $shotsPerStep,
      channels: $trackChannels
    });
    const tag = $mode === 'manual' ? `layer${$currentStep + 1}` : 'all';
    downloadMidi(bytes, `circuit-${tag}-${$bpm}bpm.mid`);
  }
</script>

<section class="panel">
  <header>
    <button class="toggle" on:click={() => (open = !open)} aria-expanded={open}>
      <span class="caret">{open ? '▼' : '▶'}</span>
      <span class="title">› Qiskit / MIDI export</span>
    </button>
    {#if open}
      <span class="hint">
        paste into qollab.xyz — runs on the global <code>backend</code> · current mode: <code>{$mode}</code>
      </span>
    {/if}
    <button
      class="copy"
      class:active={$liveMidiEnabled}
      on:click={toggleLiveMidi}
      disabled={!midiSupported}
      title={midiSupported
        ? 'Stream notes + entanglement CCs to a MIDI output port in real time'
        : 'Real-time MIDI needs Chrome or Edge (Web MIDI API)'}
    >
      {$liveMidiEnabled ? '[ ◉ live midi ]' : '[ live midi ]'}
    </button>
    {#if $liveMidiEnabled}
      <select class="port" on:change={onPort} value={$selectedOutputId ?? ''} title="MIDI output port">
        {#if $midiOutputs.length === 0}
          <option value="">— no MIDI outputs —</option>
        {:else}
          {#each $midiOutputs as o (o.id)}
            <option value={o.id}>{o.name}</option>
          {/each}
        {/if}
      </select>
    {/if}
    <button class="copy" on:click={exportMidi} title="Generate a .mid file from the current circuit (simulated)">
      [ export midi ]
    </button>
    <button class="copy" on:click={copy}>
      {copied ? '[ copied ]' : '[ copy code ]'}
    </button>
  </header>

  {#if $liveMidiEnabled && $numQubits > 1}
    <div class="ccmap" title="Each qubit pair's mutual information is sent as this CC, on both qubits' channels.">
      entanglement → {ccMapText($numQubits)}
      {#if midiMsg}<span class="err"> · {midiMsg}</span>{/if}
    </div>
  {:else if midiMsg}
    <div class="ccmap"><span class="err">{midiMsg}</span></div>
  {/if}

  {#if open}
    <pre class="code">{code}</pre>
  {/if}
</section>

<style>
  .panel {
    background: var(--bg-1);
    border: 1px solid var(--border);
    color: var(--fg);
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.45rem 0.75rem;
  }
  .toggle {
    background: transparent;
    border: none;
    color: var(--fg-dim);
    cursor: pointer;
    font: inherit;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .toggle:hover {
    color: var(--mint);
  }
  .caret {
    color: var(--mint);
    font-size: 0.7rem;
  }
  .title {
    color: var(--fg-dim);
  }
  .hint {
    color: var(--fg-mute);
    flex: 1;
    font-size: 0.65rem;
  }
  .hint code {
    color: var(--mint);
    font-family: inherit;
    font-size: inherit;
  }
  .copy {
    background: transparent;
    border: none;
    color: var(--fg-mute);
    cursor: pointer;
    font: inherit;
    letter-spacing: 0.04em;
  }
  .copy:hover {
    color: var(--mint);
  }
  .copy:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .copy.active {
    color: var(--mint);
  }
  .port {
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 0;
    font: inherit;
    font-size: 0.66rem;
    padding: 0.1rem 0.25rem;
    max-width: 12rem;
  }
  .ccmap {
    padding: 0.3rem 0.75rem;
    border-top: 1px solid var(--border-dim);
    color: var(--fg-mute);
    font-size: 0.64rem;
    letter-spacing: 0.03em;
    overflow-x: auto;
    white-space: nowrap;
  }
  .ccmap .err {
    color: var(--mauve, #c98b9b);
  }
  .code {
    margin: 0;
    padding: 0.75rem 0.85rem;
    background: var(--bg);
    border-top: 1px solid var(--border-dim);
    color: var(--fg);
    font-family: var(--mono);
    font-size: 0.7rem;
    line-height: 1.45;
    white-space: pre;
    overflow: auto;
    max-height: 360px;
    tab-size: 4;
  }
  @media (max-width: 800px) {
    .hint {
      display: none;
    }
    header {
      flex-wrap: wrap;
    }
  }
</style>
