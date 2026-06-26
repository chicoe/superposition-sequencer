<script lang="ts">
  import { bpm, epochStartIndex, shotHistory } from '$lib/stores/playback';
  import { currentStep } from '$lib/stores/circuit';
  import { assign, sounds } from '$lib/stores/sounds';
  import { BACKEND_LABELS, computedRun, computedSteps } from '$lib/stores/run';
  import { trackModes, setTrackMode, TRACK_MODE_LABELS, isOscMode, type TrackMode } from '$lib/stores/trackModes';
  import { trackWaves, setTrackWave, TRACK_WAVE_LABELS, type TrackWave } from '$lib/stores/trackWaves';
  import { trackOctaves, setTrackOctave, OCTAVE_OPTIONS, type OctaveBias } from '$lib/stores/trackOctaves';
  import { liveMidiEnabled } from '$lib/stores/midiOut';
  import { trackChannels, setTrackChannel } from '$lib/stores/trackChannels';
  import type { ShotRecord, SoundName } from '$lib/types';

  const CHANNEL_OPTIONS = Array.from({ length: 16 }, (_, i) => i + 1);

  // Track palette aligned with the new theme — mint, mauve, beige, steel.
  const COLORS = ['#cfe1b6', '#a698b0', '#c4b896', '#7ea0aa', '#cfe1b6', '#a698b0', '#c4b896', '#7ea0aa'];
  const MAX_SHOWN = 16;
  const SOUND_OPTIONS: SoundName[] = [
    'none', 'kick', 'snare', 'hihat', 'tom', 'rim', 'clap', 'bass', 'pluck', 'pad', 'bell'
  ];
  const MODE_OPTIONS: TrackMode[] = ['none', 'beat', 'gated', 'drone'];
  const WAVE_OPTIONS: TrackWave[] = ['sine', 'square', 'sawtooth', 'supersaw'];

  $: tracks = $shotHistory;
  $: maxLen = Math.max(0, ...tracks.map((t) => t.length));

  // One beat's duration. Shots/markers glide by exactly one slot over this, so
  // they scroll continuously (not in steps) and stay in sync — and freeze when
  // paused, since the glide only fires when a new shot changes their position.
  $: beatMs = Math.round((60 / $bpm) * 1000);

  // Shots are placed in fixed per-beat slots, newest on the right, counting
  // back to the left — NOT by elapsed time. So positions only change when a new
  // shot arrives (the timeline freezes when paused), and the step-marker lines —
  // which use the same slot coordinate — stay locked to the beats.
  // Bar (accumulating bar-chart) is capped to this fraction of lane width;
  // shots slide left and visually disappear behind it.
  const BAR_MAX_PCT = 20;

  // Rate considers only shots fired during the current step-visit (post-epoch).
  // Returns null when n=0 so the UI can render "—" instead of a misleading 0%.
  $: rateSinceEpoch = (arr: ShotRecord[]): number | null => {
    const here = arr.slice($epochStartIndex);
    if (here.length === 0) return null;
    return here.filter((s) => s.triggered).length / here.length;
  };

  // Bar rate counts ONLY shots that have scrolled OFF the visible window (this
  // step-visit), so beats appear to pass through the timeline and accumulate on
  // the bar as they exit. Empty until more than MAX_SHOWN shots have fired.
  $: offScreenRate = (arr: ShotRecord[]): number => {
    const offEnd = arr.length - MAX_SHOWN; // indices < offEnd have left the screen
    const start = $epochStartIndex;
    if (offEnd <= start) return 0; // nothing has left the screen this step yet
    const passed = arr.slice(start, offEnd);
    if (passed.length === 0) return 0;
    return passed.filter((s) => s.triggered).length / passed.length;
  };

  function visible(row: ShotRecord[]): ShotRecord[] {
    return row.slice(-MAX_SHOWN);
  }

  // All tracks see the same step sequence per shot index; compute transitions from track 0.
  $: ref = visible(tracks[0] ?? []);
  // Step-change boundaries, in the same right-anchored per-beat slot coordinate
  // as the shots, so each line lands exactly between the two beats where the
  // step changes (and never drifts, since it's index-based not time-based).
  $: transitions = (() => {
    const L = ref.length;
    const out: { id: number; right: number; step: number }[] = [];
    for (let i = 1; i < L; i++) {
      if (ref[i].step !== ref[i - 1].step) {
        // Key by the change-shot's time so the SAME marker element persists as it
        // scrolls (and glides via CSS) instead of being re-created — and jumping —
        // every beat. Re-creation each beat was why the line lagged the shots.
        out.push({
          id: ref[i].time,
          // Boundary between beats i-1 and i, matching the +0.5 slot-centring
          // of the shots so the line sits exactly between them.
          right: ((L - i) / MAX_SHOWN) * 100,
          step: ref[i].step
        });
      }
    }
    return out;
  })();

  function onSoundChange(q: number, e: Event) {
    const t = e.currentTarget as HTMLSelectElement;
    assign(q, t.value as SoundName);
  }
  function onModeChange(q: number, e: Event) {
    const t = e.currentTarget as HTMLSelectElement;
    setTrackMode(q, t.value as TrackMode);
  }
  function onWaveChange(q: number, e: Event) {
    const t = e.currentTarget as HTMLSelectElement;
    setTrackWave(q, t.value as TrackWave);
  }
  function onOctaveChange(q: number, e: Event) {
    const t = e.currentTarget as HTMLSelectElement;
    setTrackOctave(q, parseInt(t.value, 10) as OctaveBias);
  }
  function octaveLabel(o: OctaveBias): string {
    return o === 0 ? '0' : o > 0 ? `+${o}` : String(o);
  }
  function onChannelChange(q: number, e: Event) {
    const t = e.currentTarget as HTMLSelectElement;
    setTrackChannel(q, parseInt(t.value, 10));
  }

  // The current step's run (if it's been computed) — what playback is replaying
  // right now. Runs are per-step, so the badge reflects the active step.
  $: curRun = $computedRun?.steps[$currentStep];
  // Backend(s) the loaded run was computed on, for the badge shown when the
  // active step itself isn't covered. Steps can in principle come from
  // different backends, so dedupe.
  $: runBackendLabels = $computedRun
    ? [...new Set(Object.values($computedRun.steps).map((s) => BACKEND_LABELS[s.backend]))].join(' + ')
    : '';
</script>

<div class="panel">
  <div class="head">
    <span class="title">› Shot History</span>
    {#if curRun}
      <span class="source run" title="This layer is replaying a frozen backend run.">
        ◉ RUN · {BACKEND_LABELS[curRun.backend]} · {curRun.shots} shots
      </span>
    {:else if $computedRun}
      <span
        class="source run"
        title="A run is loaded, but this layer wasn't computed — it previews live. Computed layers: {$computedSteps
          .map((s) => s + 1)
          .join(', ')}."
      >
        ◉ RUN · {runBackendLabels} · {$computedSteps.length} {$computedSteps.length === 1 ? 'LAYER' : 'LAYERS'}
      </span>
    {:else}
      <span class="source preview" title="Each beat is a fresh local Aer-style sample of the live statevector.">
        ◌ PREVIEW · LOCAL SIM
      </span>
    {/if}
    <span class="meta">[ {maxLen} shots ]</span>
  </div>

  <div class="rows" style={`--beat-ms: ${beatMs}ms;`}>
    <!-- Step-change markers: one continuous line per transition, spanning all tracks -->
    {#if transitions.length}
      <div class="markers-overlay" aria-hidden="true">
        <div class="markers-grid">
          <div />
          <div class="markers-timeline">
            {#each transitions as t (t.id)}
              <div class="marker" style={`right: ${t.right}%;`}>
                <span class="num">{t.step + 1}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    {#each tracks as row, q (q)}
      {@const shots = visible(row)}
      {@const startOfVisible = Math.max(0, row.length - MAX_SHOWN)}
      {@const epochInVisible = Math.max(0, $epochStartIndex - startOfVisible)}
      {@const r = rateSinceEpoch(row)}
      {@const trackMode = $trackModes[q] ?? 'beat'}
      {@const osc = isOscMode(trackMode)}
      <div class="row">
        <div class="lbl">
          <span class="dot" style={`background: ${COLORS[q % COLORS.length]}`} />
          q{q}
          <select
            class="mode"
            value={trackMode}
            on:change={(e) => onModeChange(q, e)}
            title="Playback mode: none (silent), beat (drum-style trigger), gated osc (pulses), drone (continuous)"
          >
            {#each MODE_OPTIONS as m}
              <option value={m}>{TRACK_MODE_LABELS[m]}</option>
            {/each}
          </select>
          {#if osc}
            <select
              class="wave"
              value={$trackWaves[q] ?? 'sine'}
              on:change={(e) => onWaveChange(q, e)}
              title="Oscillator waveform"
            >
              {#each WAVE_OPTIONS as w}
                <option value={w}>{TRACK_WAVE_LABELS[w]}</option>
              {/each}
            </select>
            <select
              class="oct"
              value={String($trackOctaves[q] ?? 0)}
              on:change={(e) => onOctaveChange(q, e)}
              title="Octave bias relative to the root note"
            >
              {#each OCTAVE_OPTIONS as o}
                <option value={String(o)}>{octaveLabel(o)}</option>
              {/each}
            </select>
          {:else if trackMode === 'beat'}
            <select
              value={$sounds.assignments[q] ?? 'kick'}
              on:change={(e) => onSoundChange(q, e)}
              title="Sound (beat mode only)"
            >
              {#each SOUND_OPTIONS as s}
                <option value={s}>{s}</option>
              {/each}
            </select>
          {/if}
          {#if $liveMidiEnabled}
            <select
              class="chan"
              value={String($trackChannels[q] ?? q + 1)}
              on:change={(e) => onChannelChange(q, e)}
              title="MIDI output channel for this qubit's notes (and its entanglement CCs)"
            >
              {#each CHANNEL_OPTIONS as ch}
                <option value={String(ch)}>ch{ch}</option>
              {/each}
            </select>
          {/if}
          <!-- Per-lane trigger rate lives at the right end of the label cluster
               so the lane's right edge stays clear for the measurement harness
               to dock and continue into the MI matrix. -->
          <span class="stat">{r === null ? '—' : `${(r * 100).toFixed(0)}%`}</span>
        </div>
        <div class="timeline" data-tl-q={q}>
          <div class="grid-line" />
          {#each shots as shot, i (shot.time)}
            <!-- +0.5 centres each beat in its slot, so the newest lands fully
                 inside the lane instead of half-clipped at the right edge. -->
            {@const right = ((shots.length - 0.5 - i) / MAX_SHOWN) * 100}
            {@const historic = i < epochInVisible}
            {@const intensity = (0.5 + 0.5 * shot.velocity) * (historic ? 0.45 : 1)}
            {@const c = COLORS[q % COLORS.length]}
            {#if shot.triggered}
              <!-- Chromatic-aberration band: a cool (blue) fringe on the left and
                   a warm (amber) fringe on the right of the qubit-colour core, all
                   feathered to transparent and blurred so it reads as a hazy
                   split-light streak rather than a solid bar. -->
              <div
                class="shot hit"
                style={`right: ${right}%; opacity: ${intensity.toFixed(2)}; background: linear-gradient(90deg, transparent 0%, rgba(120,165,255,0.6) 24%, ${c} 50%, rgba(255,178,96,0.6) 76%, transparent 100%);`}
              />
            {:else}
              <div class="shot miss" class:historic style={`right: ${right}%;`} />
            {/if}
          {/each}
          <!-- Accumulating bar — capped to BAR_MAX_PCT of the lane width.
               Sits ABOVE the shots in z-order with the same colour, so shots
               sliding into it look like they're being absorbed. -->
          <div
            class="bar"
            style={`width: ${offScreenRate(row) * BAR_MAX_PCT}%; background: ${COLORS[q % COLORS.length]};`}
          />
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .panel {
    background: var(--bg-1);
    border: 1px solid var(--border);
    padding: 0.55rem 0.8rem;
    color: var(--fg);
    font-family: var(--mono);
    font-size: 0.7rem;
    flex-shrink: 0;
    letter-spacing: 0.04em;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .title {
    color: var(--fg-dim);
  }
  .meta {
    color: var(--fg-mute);
    margin-left: auto;
  }
  .source {
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    padding: 0.1rem 0.5rem;
    border: 1px solid currentColor;
  }
  .source.preview {
    color: var(--fg-mute);
  }
  .source.run {
    color: var(--mint);
  }
  .rows {
    position: relative;
    display: flex;
    flex-direction: column;
    /* Lanes butt together (no gap) so each row's height IS the lane pitch; the
       overlay sets --tl-row-h to the MI matrix's row pitch so every tap runs
       straight across into its matrix row. */
    gap: 0;
    padding-top: 16px; /* leaves space for the step-number badges */
  }
  .row {
    display: grid;
    grid-template-columns: 280px 1fr;
    align-items: center;
    gap: 0.5rem;
    height: var(--tl-row-h, 1.9rem);
  }
  .lbl {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--fg);
  }
  .dot {
    display: inline-block;
    width: 0.55rem;
    height: 0.55rem;
    flex-shrink: 0;
  }
  .lbl select {
    background: var(--bg-3);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 0;
    padding: 0.1rem 0.3rem;
    font: inherit;
    font-size: 0.65rem;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .lbl select:disabled {
    color: var(--fg-mute);
    cursor: not-allowed;
    opacity: 0.55;
  }
  .lbl select.mode {
    color: var(--beige);
    border-color: var(--border);
  }
  .lbl select.wave {
    color: var(--mauve);
    border-color: var(--border);
  }
  .lbl select.oct {
    color: var(--fg-dim);
    border-color: var(--border);
    min-width: 2.6rem;
  }
  .lbl select.chan {
    color: var(--mint);
    border-color: var(--mint);
    min-width: 3rem;
  }
  .timeline {
    position: relative;
    height: 22px;
    background: var(--bg);
    overflow: hidden;
  }
  /* Faint pixel-cell grid laid over the lane, so the hazy chromatic streaks read
     as a low-res / pixelated texture (the dark gridlines break them into cells).
     Static (no filter) so it costs nothing per frame. */
  .timeline::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    background-image:
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.04) 0 1px, transparent 1px 6px),
      repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0 1px, transparent 1px 6px);
  }
  .bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 0%;
    /* Sits in front of the shots so they appear to merge with it. */
    z-index: 2;
    /* Same hazy blur as the shots, so the accumulated bar reads as part of the
       same soft texture. */
    filter: blur(1.6px);
    /* Slow so the bar eases up as shots accumulate off-screen instead of jumping
       when the first one lands (its rate is noisy until many have passed). */
    transition: width 1.8s ease-out;
  }
  .grid-line {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--border-dim);
    opacity: 0.2;
    transform: translateY(-50%);
  }
  .shot {
    position: absolute;
    top: 50%;
    /* Right-anchored, centred on its per-beat slot. The position is index-based
       (only changes when a new shot arrives), and the transition lets shots
       glide left as new beats push in — while staying frozen when paused. */
    transform: translate(50%, -50%);
    z-index: 1;
    /* Glide one slot over exactly one beat → continuous scroll, in sync with the
       step markers (same duration), and frozen when paused (no new shot = no
       position change = no transition). Opacity transitions too so the historic
       dimming fades in rather than snapping. */
    transition: right var(--beat-ms, 300ms) linear, opacity var(--beat-ms, 300ms) linear;
  }
  .shot.hit {
    /* Soft chromatic band — feathered gradient edges (set inline) + a bit more
       blur so the blue/amber fringes bleed into a hazy split-light streak. */
    width: 9px;
    height: 100%;
    filter: blur(1.4px);
  }
  .shot.miss {
    width: 3px;
    height: 70%;
    background: var(--border);
    opacity: 0.3;
    filter: blur(0.6px);
  }
  .shot.historic.miss {
    opacity: 0.16;
  }

  /* Step-change overlay sits above the rows, spans the full vertical extent */
  .markers-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 2;
  }
  .markers-grid {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 0.5rem;
    height: 100%;
  }
  .markers-timeline {
    position: relative;
    height: 100%;
  }
  .marker {
    position: absolute;
    top: 16px;
    bottom: 0;
    width: 1px;
    background: var(--beige);
    opacity: 0.45;
    transform: translateX(50%);
    /* Same beat-synced glide as the shots so the lines track the beats exactly. */
    transition: right var(--beat-ms, 300ms) linear;
  }
  .marker .num {
    position: absolute;
    top: -16px;
    left: 50%;
    transform: translateX(-50%);
    background: transparent;
    color: var(--beige);
    border: 1px solid var(--beige);
    padding: 0 4px;
    font-size: 0.62rem;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
    letter-spacing: 0.08em;
  }
  .stat {
    margin-left: auto;
    min-width: 2.4rem;
    text-align: right;
    color: var(--mint);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
  }

  /* On narrow screens the lane selectors don't fit alongside the timeline.
     Split the row into two lines: selectors on top, timeline + stat below.
     Step-change markers assume a single horizontal grid, so we hide them. */
  @media (max-width: 800px) {
    .row {
      grid-template-columns: 1fr;
      grid-template-areas: 'lbl' 'timeline';
      row-gap: 0.25rem;
      /* The MI matrix (hence its row pitch) is hidden on mobile; let the
         stacked label + timeline size themselves. */
      height: auto;
    }
    .lbl {
      grid-area: lbl;
      flex-wrap: wrap;
    }
    .timeline {
      grid-area: timeline;
    }
    .markers-overlay {
      display: none;
    }
  }
</style>
