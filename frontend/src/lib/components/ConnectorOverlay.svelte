<!--
  Mutual-information bus.

  The MI matrix is the convergence of two readouts, and this overlay draws the
  wiring that makes that literal:

    • measurement gates  ──┐ ┐ ┐ ┐   drop straight down into the matrix COLUMNS
                           ▼ ▼ ▼ ▼
    • timeline lanes  ───────────────▶  feed across into the matrix ROWS

  So cell (row i, col j) sits exactly where qubit i's shot stream crosses
  qubit j's measurement — which is what I(i:j) means. Wires are clean
  orthogonal traces (rounded corners), one per qubit colour, like a circuit
  board rather than free-floating curves.

  Anchor elements expose their qubit index via data attributes:
    data-meas-q   — circuit measurement gate (column feed, top)
    data-mi-col-q — MI matrix column header  (column port)
    data-tl-q     — timeline lane            (row feed, left)
    data-mi-row-q — MI matrix row header     (row port)

  Paths are recomputed from live bounding boxes, so the bus tracks layout
  changes. pointer-events: none, so it never blocks interaction.
-->
<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { numQubits } from '$lib/stores/circuit';
  import { bpm, shotHistory } from '$lib/stores/playback';
  import { measureStagger } from '$lib/stores/circuitMetrics';
  import { MAX_STAGGER } from './circuitLayout';
  import { QUBIT_COLORS } from '$lib/quantum/qubitColors';

  type Pt = { x: number; y: number };
  // `arrow` marks the flow DESTINATION with a heading (degrees): the bus reads
  // circuit → matrix → timeline, so column drops point down into the matrix and
  // row taps point left out of the matrix into the timeline lanes.
  type Wire = { d: string; color: string; arrow: { x: number; y: number; a: number } };

  const CORNER = 7; // rounded-corner radius for the orthogonal bends

  let svgEl: SVGSVGElement | null = null;
  let wires: Wire[] = [];
  let viewW = 0;
  let viewH = 0;
  let ro: ResizeObserver | null = null;
  let frameRequested = false;

  // Wire blink: each new measurement (beat) bumps beatTick, which re-keys the
  // glow group and restarts its flash. blinkMs ≈ one beat so the pulse stays in
  // time with measurements (and holds steady when paused — no new beats fire).
  let beatTick = 0;
  const unsubBeat = shotHistory.subscribe(() => (beatTick += 1));
  $: blinkMs = Math.min(700, Math.round((60 / $bpm) * 1000));

  // The chromatic-aberration fringe runs PERPENDICULAR to each trace, so split
  // the wires by orientation: horizontal taps (arrow points left, a=180) get a
  // vertical fringe; vertical drops (a=90) get a horizontal fringe.
  $: hWires = wires.filter((w) => w.arrow.a === 180);
  $: vWires = wires.filter((w) => w.arrow.a === 90);

  function scheduleCompute() {
    if (typeof window === 'undefined') return; // no-op during SSR
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(async () => {
      frameRequested = false;
      await tick();
      compute();
    });
  }

  function visible(r: DOMRect): boolean {
    return r.width > 0 && r.height > 0;
  }

  /** Set a CSS var on the host only when it actually changes (avoids churn). */
  function setHostVar(host: HTMLElement, name: string, px: number) {
    const next = `${px.toFixed(1)}px`;
    if (host.style.getPropertyValue(name) !== next) host.style.setProperty(name, next);
  }

  /** Center-to-center spacing of a list of coordinates (first → last). */
  function pitchOf(xs: number[]): number | null {
    const pts = xs.filter((x) => Number.isFinite(x));
    if (pts.length < 2) return null;
    return (pts[pts.length - 1] - pts[0]) / (pts.length - 1);
  }

  /**
   * The MI matrix is the fixed grid everything docks onto. Rather than squeeze
   * the matrix to the circuit, we conform the two feeds to it:
   *
   *  • the measurement staircase pitch is driven (via the measureStagger store)
   *    so, once the SVG is scaled to the screen, it equals the matrix's column
   *    pitch — every drop then falls straight down its column;
   *  • the timeline lane height is driven (via --tl-row-h) to the matrix's row
   *    pitch — every tap then runs straight across into its row.
   *
   * The matrix itself only offsets (--mi-band, a right-side margin pulling it
   * left, plus --mi-shift-y top padding) to dock its first column under
   * measurement 0 and its first row beside lane 0. All of it is measured live,
   * so the bus stays aligned at any window size.
   */
  function alignBus(
    host: HTMLElement,
    geo: { meas: number[]; col: number[]; row: number[]; lane: number[] }
  ): boolean {
    let settling = false;
    const colPitch = pitchOf(geo.col);
    const measPitch = pitchOf(geo.meas);
    const rowPitch = pitchOf(geo.row);

    // Columns: nudge the staircase step so the on-screen measurement pitch
    // matches the matrix column pitch. Scaling the *current* stagger by the
    // ratio of where it is to where it needs to be is self-correcting in one
    // step when the circuit is height-scaled, and converges cleanly even when
    // it's width-clamped (where the render scale itself depends on the stagger,
    // so dividing by scale would chase a moving target).
    if (colPitch != null && measPitch != null && measPitch > 1 && colPitch > 1) {
      const cur = get(measureStagger);
      // Floor is low on purpose: the drops are pure verticals at each gate's x,
      // so the on-screen gate pitch MUST equal the column pitch. When the
      // circuit is scaled up (few qubits filling a tall panel) the SVG-unit step
      // needed for that is small — a larger floor would force the gates wider
      // than the columns and break the drops. Staircase gates sit a full row
      // apart vertically, so a tight horizontal step never overlaps.
      // Clamp to MAX_STAGGER so a degenerate measurement can't run the staircase
      // away; the floor keeps the step positive.
      const next = Math.min(MAX_STAGGER, Math.max(4, (cur * colPitch) / measPitch));
      if (Math.abs(next - cur) > 0.5) {
        measureStagger.set(next);
        settling = true;
      }
    }

    // Rows: grow the timeline lanes to the matrix row pitch so taps stay level.
    if (rowPitch != null) setHostVar(host, '--tl-row-h', Math.max(22, rowPitch));

    // Dock the matrix onto the feeds. Both docks are additive: the current
    // offset is already applied, so we nudge by the residual gap and let it
    // converge to zero over a frame or two.
    const hostRect = host.getBoundingClientRect();
    const col0 = host.querySelector<HTMLElement>('[data-mi-col-q="0"]');
    const meas0 = host.querySelector<HTMLElement>('[data-meas-q="0"]');
    if (col0 && meas0) {
      const cb = col0.getBoundingClientRect();
      const mb = meas0.getBoundingClientRect();
      if (visible(cb) && visible(mb)) {
        const col0x = cb.left + cb.width / 2 - hostRect.left;
        const meas0x = mb.left + mb.width / 2 - hostRect.left;
        const residual = meas0x - col0x;
        if (Math.abs(residual) > 0.5) settling = true;
        // --mi-band is a right-side margin: GROWING it pulls the matrix LEFT, so
        // when col 0 sits right of meas 0 (residual < 0) we add the gap. Clamp
        // to >=0 (a margin can't push the matrix right past the panel edge) and
        // to a sane ceiling so a degenerate measurement never runs it away.
        const cur = parseFloat(host.style.getPropertyValue('--mi-band')) || 0;
        const band = Math.max(0, Math.min(hostRect.width * 0.6, cur - residual));
        setHostVar(host, '--mi-band', band);
      }
    }
    const row0 = host.querySelector<HTMLElement>('[data-mi-row-q="0"]');
    const lane0 = host.querySelector<HTMLElement>('[data-tl-q="0"]');
    if (row0 && lane0) {
      const rb = row0.getBoundingClientRect();
      const lb = lane0.getBoundingClientRect();
      if (visible(rb) && visible(lb)) {
        const row0y = rb.top + rb.height / 2 - hostRect.top;
        const lane0y = lb.top + lb.height / 2 - hostRect.top;
        const residual = lane0y - row0y;
        if (Math.abs(residual) > 0.5) settling = true;
        const cur = parseFloat(host.style.getPropertyValue('--mi-shift-y')) || 0;
        // Padding can't be negative; the matrix's first row always starts above
        // lane 0 (its column header is thinner than the shot-history header), so
        // the residual is positive in practice — clamp for safety.
        setHostVar(host, '--mi-shift-y', Math.max(0, cur + residual));
      }
    }
    return settling;
  }

  /**
   * Build a path through axis-aligned waypoints, rounding each interior corner
   * with a quadratic so the bus reads as tidy traces rather than hard Ls.
   */
  function orthoPath(pts: Pt[]): string {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const next = pts[i + 1];
      const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
      const outLen = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
      const r = Math.min(CORNER, inLen / 2, outLen / 2);
      const ax = cur.x - ((cur.x - prev.x) / inLen) * r;
      const ay = cur.y - ((cur.y - prev.y) / inLen) * r;
      const bx = cur.x + ((next.x - cur.x) / outLen) * r;
      const by = cur.y + ((next.y - cur.y) / outLen) * r;
      d += ` L ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${cur.x.toFixed(1)} ${cur.y.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
    return d;
  }

  function compute(): void {
    if (!svgEl) return;
    const host = svgEl.parentElement;
    if (!host) return;
    const H = host.getBoundingClientRect();
    viewW = H.width;
    viewH = H.height;

    const n = $numQubits;
    const next: Wire[] = [];
    const measCenters: number[] = [];
    const colCenters: number[] = [];
    const rowCenters: number[] = [];
    const laneCenters: number[] = [];
    for (let q = 0; q < n; q++) {
      const color = QUBIT_COLORS[q % QUBIT_COLORS.length];

      // ── Column feed: measurement gate → MI column header (drop down). ──
      const meas = host.querySelector<HTMLElement>(`[data-meas-q="${q}"]`);
      const col = host.querySelector<HTMLElement>(`[data-mi-col-q="${q}"]`);
      if (meas && col) {
        const mb = meas.getBoundingClientRect();
        const cb = col.getBoundingClientRect();
        if (visible(mb) && visible(cb)) {
          const mx = mb.left + mb.width / 2 - H.left;
          const my = mb.bottom - H.top;
          measCenters[q] = mx;
          const cx = cb.left + cb.width / 2 - H.left;
          colCenters[q] = cx;
          const cTop = cb.top - H.top;
          // Drop straight down the gate's OWN x into the column header. The
          // matrix is docked under the staircase, so this lands centred on the
          // column — and stays a clean vertical even if the dock is a sub-pixel
          // off, instead of folding the residual into a visible jog.
          const pts: Pt[] = [
            { x: mx, y: my },
            { x: mx, y: cTop }
          ];
          // Drop arrives pointing DOWN into the matrix column.
          next.push({ d: orthoPath(pts), color, arrow: { x: mx, y: cTop, a: 90 } });
        }
      }

      // ── Row feed: timeline lane → MI row header (across to the left edge). ──
      const tl = host.querySelector<HTMLElement>(`[data-tl-q="${q}"]`);
      const row = host.querySelector<HTMLElement>(`[data-mi-row-q="${q}"]`);
      if (tl && row) {
        const tb = tl.getBoundingClientRect();
        const rb = row.getBoundingClientRect();
        if (visible(tb) && visible(rb)) {
          const tx = tb.right - H.left;
          const ty = tb.top + tb.height / 2 - H.top;
          laneCenters[q] = ty;
          const rx = rb.left - H.left;
          const ry = rb.top + rb.height / 2 - H.top;
          rowCenters[q] = ry;
          // Run straight across at the lane's OWN y into the row header. Docked
          // rows keep this level with no vertical jog (same reasoning as the
          // column drops above).
          const pts: Pt[] = [
            { x: rx, y: ty },
            { x: tx, y: ty }
          ];
          // Tap leaves the matrix row pointing LEFT into the timeline lane.
          next.push({ d: orthoPath(pts), color, arrow: { x: tx, y: ty, a: 180 } });
        }
      }
    }
    wires = next;

    const settling = alignBus(host, {
      meas: measCenters,
      col: colCenters,
      row: rowCenters,
      lane: laneCenters
    });
    // The dock nudges the matrix by the residual gap each pass, so when a gap
    // remains ask for one more frame; it contracts to zero in a frame or two.
    if (settling) scheduleCompute();
  }

  onMount(() => {
    const host = svgEl?.parentElement;
    if (!host) return;
    ro = new ResizeObserver(() => scheduleCompute());
    ro.observe(host);
    host
      .querySelectorAll<HTMLElement>('[data-meas-q],[data-mi-col-q],[data-mi-row-q],[data-tl-q]')
      .forEach((el) => ro?.observe(el));
    window.addEventListener('resize', scheduleCompute);
    scheduleCompute();
  });

  onDestroy(() => {
    ro?.disconnect();
    unsubBeat();
    if (typeof window !== 'undefined') window.removeEventListener('resize', scheduleCompute);
  });

  $: $numQubits, scheduleCompute();
  $: $shotHistory, scheduleCompute();
</script>

<svg
  bind:this={svgEl}
  class="connector-overlay"
  width={viewW || '100%'}
  height={viewH || '100%'}
  viewBox={`0 0 ${viewW || 1} ${viewH || 1}`}
  style={`--blink-ms: ${blinkMs}ms;`}
>
  <defs>
    <!-- Chromatic aberration matching the timeline beats: a cool (blue) fringe
         and a warm (amber) fringe offset to either side of the qubit-colour
         core, all softly blurred so the wire reads as the same hazy split-light
         streak as the shots — no hard core. The offset is perpendicular to the
         trace, hence one filter per orientation. -->
    <filter id="wire-chroma-h" x="-50%" y="-120%" width="200%" height="340%">
      <feOffset in="SourceGraphic" dy="1.2" result="aOff" />
      <feColorMatrix
        in="aOff"
        type="matrix"
        values="0 0 0 0 1  0 0 0 0 0.698  0 0 0 0 0.376  0 0 0 0.65 0"
        result="amber"
      />
      <feOffset in="SourceGraphic" dy="-1.2" result="bOff" />
      <feColorMatrix
        in="bOff"
        type="matrix"
        values="0 0 0 0 0.47  0 0 0 0 0.647  0 0 0 0 1  0 0 0 0.65 0"
        result="blue"
      />
      <feMerge>
        <feMergeNode in="blue" />
        <feMergeNode in="amber" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
      <feGaussianBlur stdDeviation="0.9" />
    </filter>
    <filter id="wire-chroma-v" x="-120%" y="-50%" width="340%" height="200%">
      <feOffset in="SourceGraphic" dx="1.2" result="aOff" />
      <feColorMatrix
        in="aOff"
        type="matrix"
        values="0 0 0 0 1  0 0 0 0 0.698  0 0 0 0 0.376  0 0 0 0.65 0"
        result="amber"
      />
      <feOffset in="SourceGraphic" dx="-1.2" result="bOff" />
      <feColorMatrix
        in="bOff"
        type="matrix"
        values="0 0 0 0 0.47  0 0 0 0 0.647  0 0 0 0 1  0 0 0 0.65 0"
        result="blue"
      />
      <feMerge>
        <feMergeNode in="blue" />
        <feMergeNode in="amber" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
      <feGaussianBlur stdDeviation="0.9" />
    </filter>
  </defs>

  <!-- Hazy chromatic traces (no crisp core, like the beats). Re-keyed on every
       measurement so the blink restarts → the wires pulse in time with the beats. -->
  {#key beatTick}
    <g class="glow" filter="url(#wire-chroma-h)">
      {#each hWires as w}
        <path d={w.d} stroke={w.color} stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round" />
        <path
          d="M 0 0 L -6 -3.6 L -6 3.6 Z"
          fill={w.color}
          transform={`translate(${w.arrow.x.toFixed(1)} ${w.arrow.y.toFixed(1)}) rotate(${w.arrow.a})`}
        />
      {/each}
    </g>
    <g class="glow" filter="url(#wire-chroma-v)">
      {#each vWires as w}
        <path d={w.d} stroke={w.color} stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round" />
        <path
          d="M 0 0 L -6 -3.6 L -6 3.6 Z"
          fill={w.color}
          transform={`translate(${w.arrow.x.toFixed(1)} ${w.arrow.y.toFixed(1)}) rotate(${w.arrow.a})`}
        />
      {/each}
    </g>
  {/key}
</svg>

<style>
  .connector-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 4;
    overflow: visible;
  }
  /* Glow flares bright on each measurement then settles — restarted every beat
     by the {#key} above. `forwards` holds the dim resting state when paused. */
  .glow {
    animation: wireBlink var(--blink-ms, 500ms) ease-out forwards;
  }
  @keyframes wireBlink {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0.55;
    }
  }
  @media (max-width: 800px) {
    .connector-overlay {
      display: none;
    }
  }
</style>
