<script lang="ts">
  import { sounds, assign } from '$lib/stores/sounds';
  import { numQubits } from '$lib/stores/circuit';
  import type { SoundName } from '$lib/types';

  const SOUND_OPTIONS: SoundName[] = [
    'kick',
    'snare',
    'hihat',
    'tom',
    'rim',
    'clap',
    'bass',
    'pluck',
    'pad',
    'bell'
  ];

  function onChange(q: number, e: Event) {
    const target = e.currentTarget as HTMLSelectElement;
    assign(q, target.value as SoundName);
  }
</script>

<div class="row">
  <span class="hint">Sounds:</span>
  {#each Array($numQubits) as _, q}
    <label>
      q{q}
      <select
        value={$sounds.assignments[q] ?? 'kick'}
        on:change={(e) => onChange(q, e)}
      >
        {#each SOUND_OPTIONS as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </label>
  {/each}
</div>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    background: #0c0e1a;
    padding: 0.6rem 0.8rem;
    border-radius: 0.5rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.8rem;
    color: #cfd8e8;
  }
  .hint {
    color: #6b7494;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  select {
    background: #1c2238;
    color: #cfd8e8;
    border: 1px solid #2a3247;
    border-radius: 4px;
    padding: 0.2rem 0.35rem;
  }
</style>
