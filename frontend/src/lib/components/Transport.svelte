<script lang="ts">
  import { onMount } from 'svelte';
  import { isPlaying, bpm, mode, shotsPerStep, volume } from '$lib/stores/playback';
  import { sounds } from '$lib/stores/sounds';
  import { delayAmount, reverbAmount, stereoSeparation } from '$lib/stores/effects';
  import { startPlayback, stopPlayback } from '$lib/audio/sequencer';
  import { setMasterVolume } from '$lib/audio/engine';
  import { setDelayWet, setReverbWet } from '$lib/audio/master';
  import { randomizeSoundParams } from '$lib/audio/randomize';
  import { tip } from '$lib/stores/tooltip';

  // Push the current slider levels into the audio engine on mount, so values are
  // applied once the context starts.
  onMount(() => {
    setMasterVolume($volume);
    setDelayWet($delayAmount);
    setReverbWet($reverbAmount);
  });
  function onVolume(e: Event) {
    const v = +(e.currentTarget as HTMLInputElement).value;
    volume.set(v);
    setMasterVolume(v);
  }
  function onDelay(e: Event) {
    const v = +(e.currentTarget as HTMLInputElement).value;
    delayAmount.set(v);
    setDelayWet(v);
  }
  function onReverb(e: Event) {
    const v = +(e.currentTarget as HTMLInputElement).value;
    reverbAmount.set(v);
    setReverbWet(v);
  }
  function onStereo(e: Event) {
    // Stereo is read per-beat by the sequencer; just store it.
    stereoSeparation.set(+(e.currentTarget as HTMLInputElement).value);
  }

  const SCALE_OPTIONS = [
    { value: 'chromatic', label: 'chromatic' },
    { value: 'major', label: 'major' },
    { value: 'minor', label: 'minor' },
    { value: 'minor_pentatonic', label: 'minor pent' },
    { value: 'major_pentatonic', label: 'major pent' },
    { value: 'whole_tone', label: 'whole tone' },
    { value: 'blues', label: 'blues' }
  ];
  const ROOT_OPTIONS = ['C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'];

  function onScale(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    sounds.update((s) => ({ ...s, scale: v }));
  }
  function onRoot(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    sounds.update((s) => ({ ...s, rootNote: v }));
  }

  async function toggle() {
    if ($isPlaying) stopPlayback();
    else await startPlayback();
  }
</script>

<div class="transport">
  <!-- Player: transport essentials (play / volume). -->
  <div class="block player">
    <button
      class="play"
      on:click={toggle}
      aria-pressed={$isPlaying}
      use:tip={{
        title: 'Play / Stop',
        body: 'Run or stop the shot loop. Each beat measures the circuit and fires the per-qubit sounds.'
      }}
    >
      {$isPlaying ? '■ STOP' : '▶ PLAY'}
    </button>

    <label use:tip={{ title: 'Master volume', body: 'Overall output level for the whole mix.' }}>
      <span class="k">vol</span>
      <input type="range" min="0" max="1" step="0.01" value={$volume} on:input={onVolume} />
      <span class="v">{Math.round($volume * 100)}</span>
    </label>
  </div>

  <!-- Effects: master delay + reverb and the per-qubit stereo spread. -->
  <div class="block fx">
    <label use:tip={{ title: 'Delay', body: 'Tempo-synced echo across the whole mix.' }}>
      <span class="k">delay</span>
      <input type="range" min="0" max="1" step="0.01" value={$delayAmount} on:input={onDelay} />
      <span class="v">{Math.round($delayAmount * 100)}</span>
    </label>

    <label use:tip={{ title: 'Reverb', body: 'Ambient space added to the whole mix.' }}>
      <span class="k">reverb</span>
      <input type="range" min="0" max="1" step="0.01" value={$reverbAmount} on:input={onReverb} />
      <span class="v">{Math.round($reverbAmount * 100)}</span>
    </label>

    <label
      use:tip={{
        title: 'Stereo separation',
        body: 'Spreads the qubits across the stereo field — first qubits left, last qubits right.'
      }}
    >
      <span class="k">stereo</span>
      <input type="range" min="0" max="1" step="0.01" value={$stereoSeparation} on:input={onStereo} />
      <span class="v">{Math.round($stereoSeparation * 100)}</span>
    </label>
  </div>

  <!-- Parameters: how shots advance and map to pitch, plus the randomizer. -->
  <div class="block params">
    <button
      class="dice"
      on:click={randomizeSoundParams}
      aria-label="Randomize sounds"
      use:tip={{
        title: 'Randomize sounds',
        body: "Re-roll every track's mode, waveform, octave and sound, plus the root, scale and tempo."
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    </button>

    <label
      use:tip={{
        title: 'Playback mode',
        body: 'Manual stays on the current layer; Auto advances through the circuit’s layers as it plays.'
      }}
    >
      <span class="k">mode</span>
      <select bind:value={$mode}>
        <option value="manual">manual</option>
        <option value="auto">auto-advance</option>
      </select>
    </label>

    {#if $mode === 'auto'}
      <label
        use:tip={{
          title: 'Shots per layer',
          body: 'In Auto mode, how many beats play before advancing to the next layer.'
        }}
      >
        <span class="k">shots/layer</span>
        <input type="range" min="1" max="32" step="1" bind:value={$shotsPerStep} />
        <span class="v">{$shotsPerStep}</span>
      </label>
    {/if}

    <span class="sep" />

    <label
      use:tip={{
        title: 'Root note',
        body: 'Base pitch for the oscillator and melodic-sound tracks.'
      }}
    >
      <span class="k">root</span>
      <select value={$sounds.rootNote} on:change={onRoot}>
        {#each ROOT_OPTIONS as r}
          <option value={r}>{r}</option>
        {/each}
      </select>
    </label>

    <label
      use:tip={{
        title: 'Scale',
        body: 'Maps each measured bitstring to a pitch within this scale.'
      }}
    >
      <span class="k">scale</span>
      <select value={$sounds.scale} on:change={onScale}>
        {#each SCALE_OPTIONS as s}
          <option value={s.value}>{s.label}</option>
        {/each}
      </select>
    </label>

    <label use:tip={{ title: 'Tempo (BPM)', body: 'Beats per minute — how fast shots fire.' }}>
      <span class="k">bpm</span>
      <input type="range" min="40" max="240" step="1" bind:value={$bpm} />
      <span class="v">{$bpm}</span>
    </label>
  </div>
</div>

<style>
  .transport {
    display: flex;
    align-items: stretch;
    gap: 0.6rem;
    flex-wrap: wrap;
    color: var(--fg);
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
  }
  /* Each control group is its own boxed block. */
  .block {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
    border: 1px solid var(--border);
    background: var(--bg-1);
    padding: 0.55rem 0.8rem;
  }
  /* Player block (play / volume / tempo) — content-sized and tinted slightly so
     the transport essentials read apart from the sound & sequence parameters. */
  .block.player {
    flex: 0 0 auto;
    background: var(--bg-2);
    border-color: rgba(207, 225, 182, 0.3);
  }
  /* Effects block — content-sized, sits beside the player; tinted a touch toward
     mauve so it reads apart from the player and params. */
  .block.fx {
    flex: 0 0 auto;
    background: var(--bg-2);
    border-color: rgba(166, 152, 176, 0.3);
  }
  /* Parameters block sits to the right of the player when its controls fit on
     one line beside it; otherwise it wraps to its own line and fills the width
     (basis auto wraps before squeezing, so the controls never cram). */
  .block.params {
    flex: 1 1 auto;
    min-width: 0;
  }
  .play {
    background: var(--mint);
    color: var(--bg);
    font-weight: 700;
    border: 1px solid var(--mint);
    padding: 0.4rem 1rem;
    cursor: pointer;
    letter-spacing: 0.14em;
    font-family: var(--mono);
    font-size: 0.72rem;
  }
  .play[aria-pressed='true'] {
    background: var(--mauve);
    border-color: var(--mauve);
  }
  .dice {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--beige);
    border: 1px solid var(--beige);
    padding: 0.3rem 0.5rem;
    cursor: pointer;
    line-height: 0;
  }
  .dice:hover {
    background: var(--beige);
    color: var(--bg);
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .k {
    color: var(--fg-mute);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.65rem;
  }
  input[type='range'] {
    width: 80px;
    accent-color: var(--mint);
  }
  select {
    background: var(--bg-3);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 0;
    padding: 0.2rem 0.4rem;
    font-family: inherit;
    font-size: inherit;
  }
  .v {
    width: 2rem;
    display: inline-block;
    text-align: right;
    color: var(--mint);
  }
  label.dim {
    opacity: 0.4;
  }
  .sep {
    display: inline-block;
    width: 1px;
    height: 1rem;
    background: var(--border);
    margin: 0 0.3rem;
  }
</style>
