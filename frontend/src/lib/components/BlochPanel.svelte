<script lang="ts">
  import BlochSphere from '$lib/threlte/BlochSphere.svelte';
  import { stepState } from '$lib/stores/quantum';
  import { swingOffset } from '$lib/quantum/blochMath';
  import { TOP_PAD, WIRE_H } from './circuitLayout';
  import { circuitScale } from '$lib/stores/circuitMetrics';

  // Track colors stay within the new palette: mint primary, mauve, beige, steel
  const COLORS = ['#cfe1b6', '#a698b0', '#c4b896', '#7ea0aa', '#cfe1b6', '#a698b0', '#c4b896', '#7ea0aa'];

  // Match the circuit's actual rendered scale so each sphere lines up with
  // its wire even when many steps shrink the SVG.
  $: rowH = WIRE_H * $circuitScale;
  $: topPad = TOP_PAD * $circuitScale;
</script>

<div class="panel">
  <!-- Spacer matches the SVG's TOP_PAD so sphere centers align with qubit wires -->
  <div class="spacer" style={`height: ${topPad}px; flex: 0 0 ${topPad}px;`} />
  {#if $stepState}
    {#each $stepState.bloch_vectors as bv, q (bv.qubit)}
      <div class="row" style={`height: ${rowH}px; flex: 0 0 ${rowH}px;`}>
        <div class="sphere-cell">
          <BlochSphere
            theta={bv.theta}
            phi={bv.phi}
            r={bv.r}
            color={COLORS[q % COLORS.length]}
          />
          <div class="tooltip">
            <span><b>θ</b> {((bv.theta * 180) / Math.PI).toFixed(0)}°</span>
            <span><b>φ</b> {((bv.phi * 180) / Math.PI).toFixed(0)}°</span>
            <span><b>P</b> {(bv.probability * 100).toFixed(0)}%</span>
            <span><b>sw</b> {(swingOffset(bv.phi) * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-height: 0;
  }
  .sphere-cell {
    position: relative;
    aspect-ratio: 1 / 1;
    height: 100%;
    max-width: 100%;
    flex-shrink: 0;
  }
  .tooltip {
    position: absolute;
    bottom: 0.25rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(12, 20, 24, 0.94);
    border: 1px solid var(--border);
    padding: 0.25rem 0.5rem;
    display: flex;
    gap: 0.6rem;
    font-family: var(--mono);
    font-size: 0.65rem;
    color: var(--fg);
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 120ms ease;
    letter-spacing: 0.04em;
  }
  .tooltip b {
    color: var(--fg-mute);
    font-weight: 500;
    margin-right: 0.15rem;
    text-transform: uppercase;
  }
  .sphere-cell:hover .tooltip {
    opacity: 1;
  }
</style>
