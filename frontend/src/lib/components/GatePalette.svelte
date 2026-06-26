<script lang="ts">
  import type { GateName } from '$lib/types';
  import GateIcon from './GateIcon.svelte';
  import { paletteDrag } from '$lib/stores/paletteDrag';
  import { GATE_INFO } from '$lib/quantum/gateInfo';
  import { hideTooltip, moveTooltip, showTooltip } from '$lib/stores/tooltip';

  export let selected: GateName | null;
  export let pendingControl: { step: number; qubit: number } | null;

  const SINGLE_GATES: GateName[] = ['h', 'x', 'y', 'z', 's', 't', 'rx', 'ry', 'rz'];
  const TWO_GATES: GateName[] = ['cnot', 'cz', 'swap'];

  // Collapsed by default on mobile to give the circuit more room. The CSS
  // hides this toggle entirely on wide screens.
  let mobileOpen = false;

  function closeMobile() {
    mobileOpen = false;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && mobileOpen) closeMobile();
  }

  function onGateEnter(e: PointerEvent, g: GateName) {
    const info = GATE_INFO[g];
    showTooltip({
      title: info.label,
      subtitle: info.full,
      body: info.desc,
      x: e.clientX,
      y: e.clientY
    });
  }
  function onGateMove(e: PointerEvent) {
    moveTooltip(e.clientX, e.clientY);
  }

  function pick(g: GateName) {
    selected = selected === g ? null : g;
    pendingControl = null;
  }
  function clear() {
    selected = null;
    pendingControl = null;
  }

  // ---- drag-from-palette ----------------------------------------------

  function accentFor(name: GateName): string {
    return name.startsWith('r') ? 'var(--beige)' : 'var(--mint)';
  }

  function startPaletteDrag(e: PointerEvent, g: GateName) {
    // Single-qubit gates support direct drag-onto-circuit. Two-qubit gates
    // still require selecting + clicking control then target.
    const isSingle = SINGLE_GATES.includes(g);
    if (!isSingle) {
      pick(g);
      return;
    }
    e.preventDefault();
    selected = g; // also visually mark as selected for visual feedback
    pendingControl = null;
    paletteDrag.set({ gate: g, x: e.clientX, y: e.clientY });

    const onMove = (ev: PointerEvent) => {
      paletteDrag.update((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY } : null));
    };
    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      // The circuit listens to paletteDrag and handles the drop in its own
      // pointerup handlers; just clear the store here so the ghost hides.
      // We need a tiny delay so CircuitDiagram has a chance to react to the
      // final state before we null it out.
      setTimeout(() => paletteDrag.set(null), 0);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }
</script>

<svelte:window on:keydown={onKey} />

{#if mobileOpen}
  <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
  <div class="palette-backdrop" on:click={closeMobile} />
{/if}

<aside class="palette" class:mobile-open={mobileOpen}>
  <button
    class="mobile-toggle"
    on:click={() => (mobileOpen = !mobileOpen)}
    aria-expanded={mobileOpen}
  >
    <span class="caret">{mobileOpen ? '▼' : '▶'}</span>
    <span>Tools{selected ? ` · ${selected.toUpperCase()}` : ''}</span>
  </button>

  <div class="contents">
  <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
  <div class="head" on:click={closeMobile}>
    <span>› Toolbox / Gates</span>
    <span class="spacer" />
    {#if selected}<button class="clear" on:click|stopPropagation={clear}>[ clear ]</button>{/if}
    <button class="close-x" on:click|stopPropagation={closeMobile} aria-label="close toolbox">[ × ]</button>
  </div>

  <div class="grid">
    {#each SINGLE_GATES as g}
      {@const info = GATE_INFO[g]}
      <button
        class="card single"
        class:active={selected === g}
        on:pointerenter={(ev) => onGateEnter(ev, g)}
        on:pointermove={onGateMove}
        on:pointerleave={hideTooltip}
        on:pointerdown={(ev) => startPaletteDrag(ev, g)}
        on:click|preventDefault={() => pick(g)}
        style={`--accent: ${accentFor(g)};`}
      >
        <svg class="card-svg" viewBox="0 0 48 26" width="48" height="26">
          <rect x={0.5} y={0.5} width={47} height={25} fill="var(--accent)" stroke="var(--accent)" stroke-width="1" />
          <rect x={1.5} y={1.5} width={45} height={23} fill="var(--bg-1)" />
          <GateIcon name={g} x={2} y={5} size={16} color="var(--accent)" />
          <text
            x={33}
            y={17}
            text-anchor="middle"
            fill="var(--accent)"
            font-family="var(--mono)"
            font-size="11"
            font-weight="600"
            letter-spacing="0.05em"
          >
            {info.label}
          </text>
        </svg>
        <span class="card-label">{info.label}</span>
      </button>
    {/each}
  </div>

  <div class="head sub">› Two-qubit</div>

  <div class="grid two">
    {#each TWO_GATES as g}
      {@const info = GATE_INFO[g]}
      <button
        class="card two"
        class:active={selected === g}
        on:pointerenter={(ev) => onGateEnter(ev, g)}
        on:pointermove={onGateMove}
        on:pointerleave={hideTooltip}
        on:click={() => pick(g)}
        style={`--accent: ${g === 'cz' ? 'var(--mauve)' : g === 'swap' ? 'var(--beige)' : 'var(--mint)'};`}
      >
        <span class="lbl">{info.label}</span>
      </button>
    {/each}
  </div>

  {#if pendingControl !== null}
    <div class="pending">
      target… (control = q{pendingControl.qubit} @ step {pendingControl.step + 1})
    </div>
  {/if}
  </div>
</aside>

<style>
  .palette {
    display: flex;
    flex-direction: column;
    min-height: 0;
    font-family: var(--mono);
    font-size: 0.7rem;
    border-right: 1px dashed var(--border-dim);
    padding-right: 0.7rem;
    gap: 0.4rem;
  }
  .contents {
    display: contents;
  }
  .mobile-toggle {
    display: none;
  }
  @media (max-width: 800px) {
    .palette {
      border-right: none;
      padding-right: 0;
      /* Provide a positioning context for the absolute popover so the
         expanded toolbox floats over the circuit instead of pushing it. */
      position: relative;
      gap: 0;
    }
    .mobile-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: var(--bg-1);
      border: 1px solid var(--border);
      color: var(--fg-dim);
      cursor: pointer;
      font: inherit;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 0.45rem 0.6rem;
      align-self: flex-start;
    }
    .palette.mobile-open .mobile-toggle {
      border-color: var(--mint);
      color: var(--mint);
    }
    .mobile-toggle .caret {
      color: var(--mint);
    }
    .mobile-toggle:hover {
      color: var(--mint);
    }
    .contents {
      display: none;
    }
    .palette.mobile-open .contents {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      margin-top: 0.3rem;
      background: var(--bg-1);
      border: 1px solid var(--mint);
      padding: 0.65rem 0.75rem 0.75rem;
      z-index: 50;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55);
      max-height: 70vh;
      overflow-y: auto;
    }
    .palette.mobile-open .head {
      cursor: pointer;
      padding-bottom: 0.35rem;
      border-bottom: 1px dashed var(--border-dim);
    }
    .palette.mobile-open .head:hover {
      color: var(--mint);
    }
    .palette.mobile-open .close-x {
      display: inline-block;
    }
    /* On mobile every card looks like the simple text-label two-qubit card:
       letter centered, accent border, fills its grid cell. The icon SVG
       is hidden so all rows read the same. */
    .palette.mobile-open .grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 0.45rem;
    }
    .palette.mobile-open .card {
      height: 36px;
      padding: 0;
      border: 1px solid var(--accent, var(--border));
      background: var(--bg-1);
      color: var(--accent, var(--fg));
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      font-weight: 600;
    }
    .palette.mobile-open .card-svg {
      display: none;
    }
    .palette.mobile-open .card-label {
      display: inline-block;
      color: var(--accent, var(--fg));
      font-weight: 600;
    }
  }
  .palette-backdrop {
    display: none;
  }
  @media (max-width: 800px) {
    .palette-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(12, 20, 24, 0.4);
      z-index: 40;
    }
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    color: var(--fg-dim);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }
  .head .spacer {
    flex: 1;
  }
  .close-x {
    display: none;
    background: transparent;
    color: var(--fg-mute);
    border: none;
    padding: 0;
    cursor: pointer;
    font: inherit;
  }
  .close-x:hover {
    color: var(--mauve);
  }
  .head.sub {
    margin-top: 0.2rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.3rem;
  }
  .grid.two {
    grid-template-columns: repeat(3, 1fr);
  }
  .card {
    background: transparent;
    border: none;
    padding: 2px;
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
  }
  .card svg {
    display: block;
  }
  .card.two {
    height: 28px;
    cursor: pointer;
    border: 1px solid var(--accent, var(--border));
    color: var(--accent, var(--fg));
    background: var(--bg-1);
    font: inherit;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
  }
  .card.two .lbl {
    color: var(--accent, var(--fg));
    font-weight: 600;
  }
  .card.two:hover {
    background: var(--bg-2);
  }
  .card.active {
    background: var(--bg-2);
    box-shadow: 0 0 0 1px var(--accent, var(--mint));
  }
  .card.single:active {
    cursor: grabbing;
  }
  .card .card-label {
    display: none; /* shown on mobile (see media query below) */
  }
  .clear {
    background: transparent;
    color: var(--fg-mute);
    border: none;
    padding: 0;
    cursor: pointer;
    font: inherit;
    text-transform: lowercase;
    letter-spacing: 0;
  }
  .clear:hover {
    color: var(--mauve);
  }
  .pending {
    color: var(--beige);
    margin-top: 0.4rem;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
  }
</style>
