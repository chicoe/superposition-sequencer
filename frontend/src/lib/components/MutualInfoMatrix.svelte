<script lang="ts">
  import { numQubits } from '$lib/stores/circuit';
  import { epochStartIndex, shotHistory, shotCount } from '$lib/stores/playback';
  import { empiricalMIMatrix } from '$lib/quantum/empiricalMI';

  // Mirrors ShotHistory / BlochPanel palette so each qubit reads in one color
  // across the whole UI.
  const COLORS = ['#cfe1b6', '#a698b0', '#c4b896', '#7ea0aa', '#cfe1b6', '#a698b0', '#c4b896', '#7ea0aa'];

  function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  }
  function soloRgba(i: number, alpha: number): string {
    const [r, g, b] = hexToRgb(COLORS[i % COLORS.length]);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  // Off-diagonal cells belong to BOTH qubits, so weave their two colours into
  // diagonal stripes (mirrors the sketch). Alpha tracks the MI strength, so a
  // 0-bit pair stays dark and a strong pair glows in both colours.
  function hatchBg(i: number, j: number, alpha: number): string {
    const a = soloRgba(i, alpha);
    const b = soloRgba(j, alpha);
    return `repeating-linear-gradient(45deg, ${a} 0, ${a} 5px, ${b} 5px, ${b} 10px)`;
  }

  // Recompute every shot. shotHistory + epochStartIndex changes per beat so
  // this reactive block re-runs naturally; for up to 8 qubits each call is
  // sub-millisecond.
  $: matrix =
    $numQubits > 1 ? empiricalMIMatrix($shotHistory, $epochStartIndex, $numQubits) : null;

  // Classical MI between two binary variables is bounded by 1 bit.
  const MAX_MI = 1;

  function fmt(v: number): string {
    if (v < 0.005) return '0%';
    return `${Math.round(v * 100)}%`;
  }
</script>

<div class="mi panel">
  {#if matrix}
    <table>
      <thead>
        <tr>
          <th class="corner" />
          {#each Array($numQubits) as _, q}
            <th data-mi-col-q={q} class="col" style={`color: ${COLORS[q % COLORS.length]};`}>q{q}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each Array($numQubits) as _, i}
          <tr>
            <th data-mi-row-q={i} class="rowh" style={`color: ${COLORS[i % COLORS.length]};`}>q{i}</th>
            {#each Array($numQubits) as _, j}
              {@const v = i === j ? 1 : (matrix[i][j] ?? 0)}
              {@const alpha = i === j ? 0.85 : Math.min(1, v / MAX_MI) * 0.85}
              {@const bg = i === j ? soloRgba(i, alpha) : hatchBg(i, j, alpha)}
              <td
                class:diag={i === j}
                style={`background: ${bg};`}
                title={i === j ? `q${i}` : `I(q${i} : q${j}) = ${v.toFixed(3)} bits`}
              >
                {i === j ? '' : fmt(v)}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="caption">
      <span class="title">› Mutual Info</span>
      <span class="meta">[ {$shotCount} shots ]</span>
    </div>
  {:else}
    <div class="empty">single qubit — no pairs</div>
  {/if}
</div>

<style>
  .mi {
    /* No panel chrome: the matrix is wired into the readout bus, so a border
       would fight the connectors landing on its edges. It's the grid everything
       docks onto; the overlay aligns it via two CSS vars set live (see below). */
    color: var(--fg);
    font-family: var(--mono);
    font-size: 0.65rem;
    letter-spacing: 0.04em;
    display: flex;
    flex-direction: column;
    /* Right-align so the columns hug the panel's right edge where the rightmost
       measurements fall. (The caption can be wider than a small 2–3 qubit table;
       left-aligning would pin the columns away from the measurements.) */
    align-items: flex-end;
    gap: 0.3rem;
    flex-shrink: 0;
    /* Size to content so the vertical dock grows the row instead of overflowing it. */
    align-self: flex-start;
    /* Horizontal dock: a right-side MARGIN (not a transform) pulls the matrix
       left until column 0 sits under measurement 0. Margin reflows, so Shot
       History (flex: 1 1 0) shrinks to stay flush instead of being overlapped;
       the leftover reads as the right-hand band. Vertical dock is PADDING so the
       row grows to contain it rather than overflowing onto the transport bar. */
    margin-right: var(--mi-band, 0px);
    padding-top: var(--mi-shift-y, 0px);
  }
  table {
    border-collapse: collapse;
    font-size: 0.62rem;
    /* Fixed layout so --mi-cell is the authoritative column width (auto layout
       silently widens columns past it, which is what made the drops drift). */
    table-layout: fixed;
  }
  th {
    color: var(--fg-mute);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    text-align: center;
  }
  /* The corner + row-header column is a fixed gutter; under table-layout: fixed
     its width has to be declared on the first row, hence on the corner too. */
  th.corner {
    width: 1.6rem;
  }
  /* Column headers double as the top ports the measurement drops land on. With
     fixed layout this width defines the whole column (and thus the pitch). */
  th.col {
    width: var(--mi-cell, 2.4rem);
    padding: 0 0 0.18rem;
    vertical-align: bottom;
    height: 1.1rem;
  }
  /* Row headers are the left ports the timeline taps land on. */
  th.rowh {
    width: 1.6rem;
    padding: 0 0.3rem 0 0;
    text-align: right;
  }
  td {
    border: 1px solid var(--border-dim);
    color: var(--fg);
    text-align: center;
    /* Square cells; width is driven to the measurement-staircase pitch so each
       column lands under its measurement gate (--mi-cell, set by the overlay). */
    width: var(--mi-cell, 2.4rem);
    height: var(--mi-cell, 2.4rem);
    padding: 0;
    font-variant-numeric: tabular-nums;
    vertical-align: middle;
  }
  td.diag {
    color: transparent;
  }
  .caption {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.62rem;
    padding-left: 1.5rem; /* clear the row-header column */
  }
  .title {
    color: var(--fg-dim);
  }
  .meta {
    color: var(--fg-mute);
  }
  .empty {
    color: var(--fg-mute);
    text-align: center;
    padding: 1rem 0;
  }
  @media (max-width: 800px) {
    .mi {
      display: none;
    }
  }
</style>
