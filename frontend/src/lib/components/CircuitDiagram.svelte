<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy, tick } from 'svelte';
  import { circuit, currentStep, setGate, removeGateAt, qubitsTouched } from '$lib/stores/circuit';
  import type { Gate, GateName } from '$lib/types';
  import { LEFT_PAD, TOP_PAD, WIRE_H } from './circuitLayout';
  import GateIcon from './GateIcon.svelte';
  import { paletteDrag } from '$lib/stores/paletteDrag';
  import { GATE_INFO } from '$lib/quantum/gateInfo';
  import { hideTooltip, moveTooltip, showTooltip } from '$lib/stores/tooltip';
  import { circuitScale, measureStagger } from '$lib/stores/circuitMetrics';
  import { stepState } from '$lib/stores/quantum';
  import { computedSteps } from '$lib/stores/run';
  import { swingOffset } from '$lib/quantum/blochMath';
  import BlochSphere from '$lib/threlte/BlochSphere.svelte';

  // Track colors mirror BlochPanel's palette.
  const SPHERE_COLORS = [
    '#cfe1b6', '#a698b0', '#c4b896', '#7ea0aa',
    '#cfe1b6', '#a698b0', '#c4b896', '#7ea0aa'
  ];
  // The sphere column sits flush against the last gate column. Width = WIRE_H
  // (square sphere matching wire row height) plus a small left margin.
  const SPHERE_GAP = 12;
  const SPHERE_SIZE = WIRE_H;

  // Measurement gate icon at the far right of each wire — the explicit end
  // of the quantum stage before the bits flow into the timeline / MI matrix.
  // Each qubit's gate is nudged right by the staircase step so the column
  // descends as a staircase: every gate then sits above its own MI-matrix
  // column, letting the readout drops fall straight down without crossing.
  // The step itself ($measureStagger) is driven by the connector overlay so,
  // once the SVG is scaled to the screen, it equals the matrix column pitch.
  const MEASURE_GAP = 10;
  // Square readout cap — same height as the gate cards (26) and the same
  // framed-box treatment, so it reads as part of the same family rather than a
  // stretched outlier.
  const MEASURE_SIZE = 26;

  function onGateEnter(e: PointerEvent, g: Gate) {
    const info = GATE_INFO[g.gate];
    if (!info) return;
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

  function placeFromPalette(gate: GateName, step: number, qubit: number) {
    if (gate === 'cnot' || gate === 'cx' || gate === 'cz' || gate === 'swap') return;
    if (gate === 'rx' || gate === 'ry') {
      setGate({ gate, qubit, step, params: { theta: Math.PI / 4 } });
    } else if (gate === 'rz') {
      setGate({ gate, qubit, step, params: { phi: Math.PI / 4 } });
    } else {
      setGate({ gate, qubit, step });
    }
  }

  function onCellPointerUp(step: number, qubit: number) {
    const d = get(paletteDrag);
    if (!d) return;
    placeFromPalette(d.gate, step, qubit);
  }

  export let selectedGate: GateName | null;
  export let pendingControl: { step: number; qubit: number } | null;

  // ── Horizontal layout ───────────────────────────────────────────────────
  // The circuit fills the available width. The vertical size (row height /
  // render scale) is driven by the panel height as before; the step columns
  // then divide the remaining horizontal space — few steps spread wide, many
  // steps pack tight. stepW is solved so the rendered SVG width matches its
  // container, undoing the height-driven render scale.
  const MIN_STEP_W = 50; // gate cards are 48 wide — keep them from overlapping
  // Cap kept moderate on purpose: letting steps grow very wide makes the SVG's
  // aspect ratio wide enough to trip the fragile width:auto/height:100%/max-width
  // sizing, which Chrome and Safari resolve differently (one overflows vertically,
  // the other leaves a gap). A lone gate also shouldn't float in an ocean of space.
  const MAX_STEP_W = 132;
  const DEFAULT_STEP_W = 54;

  let availW = 0; // rendered width of the circuit container (.center-group)
  let lastScale = 0;

  // Fixed (non-step) part of the intrinsic width: left pad, sphere column,
  // measure gap, the descending staircase, and the readout cap.
  $: fixedW =
    LEFT_PAD +
    SPHERE_GAP +
    SPHERE_SIZE +
    MEASURE_GAP +
    Math.max(0, $circuit.num_qubits - 1) * $measureStagger +
    MEASURE_SIZE +
    4;

  $: stepW =
    availW > 0 && $circuitScale > 0.05
      ? Math.max(
          MIN_STEP_W,
          Math.min(MAX_STEP_W, ((availW * 0.985) / $circuitScale - fixedW) / $circuit.num_steps)
        )
      : DEFAULT_STEP_W;

  $: sphereX = LEFT_PAD + stepW * $circuit.num_steps + SPHERE_GAP;
  $: measureX = sphereX + SPHERE_SIZE + MEASURE_GAP;
  // Per-qubit measurement x — staircase descending to the right. Step is driven
  // by the overlay so it lands each gate above its MI-matrix column.
  $: measureXAt = (q) => measureX + q * $measureStagger;
  $: width =
    measureX + Math.max(0, $circuit.num_qubits - 1) * $measureStagger + MEASURE_SIZE + 4;
  $: height = TOP_PAD * 2 + WIRE_H * $circuit.num_qubits;

  // Track colors for the measurement icons — same palette ShotHistory and
  // MutualInfoMatrix use, so each qubit reads in one color across the UI.
  const TRACK_COLORS = [
    '#cfe1b6', '#a698b0', '#c4b896', '#7ea0aa',
    '#cfe1b6', '#a698b0', '#c4b896', '#7ea0aa'
  ];

  // Keep a live measurement of the SVG's rendered height so the BlochPanel
  // can scale its rows in lockstep. The SVG element itself uses CSS
  // aspect-ratio so its box matches the content exactly — no letterbox.
  let resizeObs: ResizeObserver | null = null;
  $: if (svgEl) attachResize(svgEl);

  function attachResize(el: SVGSVGElement) {
    if (resizeObs) resizeObs.disconnect();
    // Observe the container (not the SVG) so measuring its width to drive stepW
    // can't feed back on the SVG's own size and oscillate.
    const container = el.closest('.center-group');
    resizeObs = new ResizeObserver(() => measureLayout(el, container));
    if (container) resizeObs.observe(container);
    measureLayout(el, container);
  }

  function measureLayout(el: SVGSVGElement, container: Element | null) {
    const renderedH = el.clientHeight;
    if (renderedH > 0 && height > 0) {
      const s = renderedH / height;
      if (Math.abs(s - lastScale) > 0.002) {
        lastScale = s;
        circuitScale.set(s);
      }
    }
    if (container) {
      const w = container.clientWidth;
      if (w > 0 && Math.abs(w - availW) > 0.5) availW = w;
    }
    scheduleSphereMeasure();
  }

  // ── Bloch spheres as a measured HTML overlay ───────────────────────────────
  // The spheres used to live in SVG <foreignObject>, but WebKit scales
  // foreignObject content inside a viewBox-scaled SVG inconsistently — the
  // spheres drifted far out of place in Safari and overflowed in Chrome. Instead
  // we keep invisible anchor <rect>s in the SVG (which DO scale correctly) and
  // lay the spheres over them as plain absolutely-positioned HTML, measured from
  // the anchors' on-screen boxes — the same robust trick the connector bus uses.
  let wrapEl: HTMLDivElement;
  let spherePos: { x: number; y: number; size: number }[] = [];
  let sphereFrame = false;

  function measureSpheres() {
    if (!wrapEl) return;
    const wrapRect = wrapEl.getBoundingClientRect();
    const next: { x: number; y: number; size: number }[] = [];
    for (let q = 0; q < $circuit.num_qubits; q++) {
      const a = wrapEl.querySelector(`[data-sphere-q="${q}"]`);
      if (!a) continue;
      const r = a.getBoundingClientRect();
      if (r.width > 0) next[q] = { x: r.left - wrapRect.left, y: r.top - wrapRect.top, size: r.width };
    }
    spherePos = next;
  }

  function scheduleSphereMeasure() {
    if (typeof window === 'undefined' || sphereFrame) return;
    sphereFrame = true;
    requestAnimationFrame(async () => {
      sphereFrame = false;
      await tick();
      measureSpheres();
    });
  }

  // Re-place the spheres whenever the circuit, its render scale, or the state
  // changes (the anchors move; the overlay follows on the next frame).
  $: {
    $circuit;
    $stepState;
    $circuitScale;
    svgEl;
    scheduleSphereMeasure();
  }

  // Also recompute the render scale when intrinsic height changes (qubit count)
  // before the observer fires.
  $: if (svgEl && height > 0) {
    const renderedH = svgEl.clientHeight;
    if (renderedH > 0) {
      const s = renderedH / height;
      if (Math.abs(s - lastScale) > 0.002) {
        lastScale = s;
        circuitScale.set(s);
      }
    }
  }

  onDestroy(() => {
    resizeObs?.disconnect();
  });

  /**
   * Drag state. For single-qubit gates the role is 'qubit'; for two-qubit gates
   * the role names the specific endpoint being moved while the other end stays
   * anchored. Step is locked for two-qubit drags.
   */
  type DragRole = 'qubit' | 'control' | 'target' | 'qubit1' | 'qubit2';
  let svgEl: SVGSVGElement | null = null;
  let dragging: {
    gate: Gate;
    role: DragRole;
    fromStep: number;
    fromQubit: number;
    cursorX: number; // current cursor in SVG coords
    cursorY: number;
  } | null = null;

  function svgPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!svgEl) return null;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const t = pt.matrixTransform(ctm.inverse());
    return { x: t.x, y: t.y };
  }

  // Distinguish a click (open the angle editor) from a drag (move the gate):
  // track whether the pointer moved more than a few px between down and up.
  let dragMoved = false;
  let dragStartClient: { x: number; y: number } | null = null;

  function startDrag(g: Gate, role: DragRole, fromQubit: number, e: PointerEvent) {
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    dragMoved = false;
    dragStartClient = { x: e.clientX, y: e.clientY };
    dragging = {
      gate: g,
      role,
      fromStep: g.step,
      fromQubit,
      cursorX: pt.x,
      cursorY: pt.y
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function onDragMove(e: PointerEvent) {
    if (!dragging) return;
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    if (!dragMoved && dragStartClient) {
      const dx = e.clientX - dragStartClient.x;
      const dy = e.clientY - dragStartClient.y;
      if (Math.hypot(dx, dy) > 4) dragMoved = true;
    }
    dragging = { ...dragging, cursorX: pt.x, cursorY: pt.y };
  }

  function endDrag(e: PointerEvent) {
    if (!dragging) return;
    const g = dragging.gate;
    const role = dragging.role;
    const wasClick = !dragMoved;
    const targetStep = Math.floor((dragging.cursorX - LEFT_PAD) / stepW);
    const targetQubit = Math.floor((dragging.cursorY - TOP_PAD) / WIRE_H);
    if (
      isValidDrop(dragging.gate, dragging.role, dragging.fromQubit, targetStep, targetQubit)
    ) {
      commitDrop(dragging.gate, dragging.role, dragging.fromQubit, targetStep, targetQubit);
    }
    dragging = null;
    // A click (no drag) on a rotation gate opens its angle editor.
    if (wasClick && role === 'qubit' && (g.gate === 'rx' || g.gate === 'ry' || g.gate === 'rz')) {
      openAngleEditor(g, e.clientX, e.clientY);
    }
    e.stopPropagation();
  }

  /** Is some other gate already touching this cell? */
  function isCellOccupied(step: number, qubit: number, exceptGate: Gate): boolean {
    return $circuit.gates.some(
      (g) => g !== exceptGate && g.step === step && qubitsTouched(g).includes(qubit)
    );
  }

  /** Return the qubit of the "other" endpoint on a two-qubit gate. */
  function otherEndpointQubit(g: Gate, role: DragRole): number | null {
    if (role === 'control') return g.target ?? null;
    if (role === 'target') return g.control ?? null;
    if (role === 'qubit1') return g.qubit2 ?? null;
    if (role === 'qubit2') return g.qubit1 ?? null;
    return null;
  }

  function isValidDrop(
    g: Gate,
    role: DragRole,
    fromQubit: number,
    targetStep: number,
    targetQubit: number
  ): boolean {
    if (targetStep < 0 || targetStep >= $circuit.num_steps) return false;
    if (targetQubit < 0 || targetQubit >= $circuit.num_qubits) return false;

    // Two-qubit gates are locked to their step and can't overlap their partner.
    if (role !== 'qubit') {
      if (targetStep !== g.step) return false;
      const other = otherEndpointQubit(g, role);
      if (other !== null && targetQubit === other) return false;
    }

    // Either kind of gate: target cell must not already host a different gate.
    if (isCellOccupied(targetStep, targetQubit, g)) return false;

    // No-op drop is allowed (we just won't change anything).
    if (targetStep === g.step && targetQubit === fromQubit) return true;
    return true;
  }

  function commitDrop(
    g: Gate,
    role: DragRole,
    fromQubit: number,
    targetStep: number,
    targetQubit: number
  ) {
    if (targetStep === g.step && targetQubit === fromQubit) return; // no-op
    if (role === 'qubit') {
      removeGateAt(g.step, fromQubit);
      setGate({ ...g, step: targetStep, qubit: targetQubit });
      return;
    }
    // Two-qubit endpoint move: replace the gate in the list with an updated copy.
    circuit.update((c) => {
      const next = c.gates.filter((other) => other !== g);
      const updated: Gate = { ...g };
      if (role === 'control') updated.control = targetQubit;
      else if (role === 'target') updated.target = targetQubit;
      else if (role === 'qubit1') updated.qubit1 = targetQubit;
      else if (role === 'qubit2') updated.qubit2 = targetQubit;
      next.push(updated);
      return { ...c, gates: next };
    });
  }

  function removeWholeGate(g: Gate, e: Event) {
    e.stopPropagation();
    const q = qubitsTouched(g)[0];
    removeGateAt(g.step, q);
  }

  /** Target cell under the cursor (may be out-of-bounds). */
  $: dropTarget = !dragging
    ? null
    : {
        step: Math.floor((dragging.cursorX - LEFT_PAD) / stepW),
        qubit: Math.floor((dragging.cursorY - TOP_PAD) / WIRE_H)
      };

  /** Live validity of the in-progress drag. */
  $: dropValid =
    !dragging || !dropTarget
      ? true
      : isValidDrop(
          dragging.gate,
          dragging.role,
          dragging.fromQubit,
          dropTarget.step,
          dropTarget.qubit
        );

  /**
   * Where the dragged endpoint is rendered. When the drop is legal we snap to
   * the target cell center (so the icon shows you the would-be position). When
   * illegal we stay at the origin so dropping is a visible no-op.
   */
  $: dragRenderPos = !dragging
    ? null
    : dropValid && dropTarget
      ? { x: cx(dropTarget.step), y: cy(dropTarget.qubit) }
      : { x: cx(dragging.fromStep), y: cy(dragging.fromQubit) };

  /**
   * Render-side endpoint position. `drag` / `snap` are passed in explicitly so
   * Svelte's reactivity at the call site can track them — closing over them
   * inside the function silently skips reactive updates.
   */
  function endpointXY(
    g: Gate,
    role: DragRole,
    qubit: number,
    drag: typeof dragging,
    snap: typeof dragRenderPos,
    sw: number
  ): { x: number; y: number } {
    if (drag && drag.gate === g && drag.role === role && snap) return snap;
    // `sw` (stepW) is passed in so the call site tracks it reactively — column
    // positions then follow the adaptive step width on resize.
    return { x: LEFT_PAD + g.step * sw + sw / 2, y: cy(qubit) };
  }

  // cx is reactive: it depends on the adaptive stepW, so every position derived
  // from it re-renders when the step spacing changes.
  $: cx = (step: number) => LEFT_PAD + step * stepW + stepW / 2;
  function cy(qubit: number): number {
    return TOP_PAD + qubit * WIRE_H + WIRE_H / 2;
  }

  function gateLabel(g: Gate): string {
    if (g.gate === 'cnot' || g.gate === 'cx') return 'CNOT';
    return g.gate.toUpperCase();
  }

  // ── Rotation angle editor ──────────────────────────────────────────────────
  // Rx/Ry carry `theta`, Rz carries `phi` (both radians); the UI works in
  // degrees and converts. Identify the edited gate by (step, qubit) so the live
  // lookup survives setGate replacing the gate object.
  const param = (g: Gate): number =>
    (g.gate === 'rz' ? g.params?.phi : g.params?.theta) ?? 0;
  const norm360 = (deg: number): number => ((Math.round(deg) % 360) + 360) % 360;
  const rotDeg = (g: Gate): number => norm360((param(g) * 180) / Math.PI);

  let angleEditor: { gate: GateName; step: number; qubit: number; x: number; y: number } | null =
    null;

  function openAngleEditor(g: Gate, clientX: number, clientY: number) {
    angleEditor = { gate: g.gate, step: g.step, qubit: qubitsTouched(g)[0], x: clientX, y: clientY };
  }
  function closeAngleEditor() {
    angleEditor = null;
  }

  // The gate currently being edited, looked up live from the circuit.
  $: editedGate = angleEditor
    ? $circuit.gates.find(
        (gt) =>
          gt.gate === angleEditor!.gate &&
          gt.step === angleEditor!.step &&
          qubitsTouched(gt)[0] === angleEditor!.qubit
      )
    : null;
  $: editAngleDeg = editedGate ? rotDeg(editedGate) : 0;
  // For Rx/Ry the angle sets the trigger probability cos²(θ/2); show it as a
  // musical hint. Rz only shifts phase (swing), not whether the track fires.
  $: editFirePct =
    angleEditor && angleEditor.gate !== 'rz'
      ? Math.round(Math.cos(((editAngleDeg * Math.PI) / 180) / 2) ** 2 * 100)
      : null;

  function setAngleDeg(deg: number) {
    if (!angleEditor) return;
    const rad = (norm360(deg) * Math.PI) / 180;
    const params = angleEditor.gate === 'rz' ? { phi: rad } : { theta: rad };
    setGate({ gate: angleEditor.gate, qubit: angleEditor.qubit, step: angleEditor.step, params });
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && angleEditor) closeAngleEditor();
  }

  function handleClick(step: number, qubit: number) {
    // Removal is via the per-gate X button now, not by clicking the empty cell.
    if (!selectedGate) return;

    if (selectedGate === 'cnot' || selectedGate === 'cx' || selectedGate === 'cz') {
      if (pendingControl === null) {
        pendingControl = { step, qubit };
        return;
      }
      // Two-qubit gates live on a single step — if the second click lands on a
      // different step, treat it as re-anchoring the control, not a placement.
      if (pendingControl.step !== step) {
        pendingControl = { step, qubit };
        return;
      }
      if (pendingControl.qubit !== qubit) {
        setGate({
          gate: selectedGate,
          control: pendingControl.qubit,
          target: qubit,
          step
        });
      }
      pendingControl = null;
      return;
    }

    if (selectedGate === 'swap') {
      if (pendingControl === null) {
        pendingControl = { step, qubit };
        return;
      }
      if (pendingControl.step !== step) {
        pendingControl = { step, qubit };
        return;
      }
      if (pendingControl.qubit !== qubit) {
        setGate({
          gate: 'swap',
          qubit1: pendingControl.qubit,
          qubit2: qubit,
          step
        });
      }
      pendingControl = null;
      return;
    }

    if (selectedGate === 'rx' || selectedGate === 'ry' || selectedGate === 'rz') {
      const params =
        selectedGate === 'rz'
          ? { phi: Math.PI / 4 }
          : { theta: Math.PI / 4 };
      setGate({ gate: selectedGate, qubit, step, params });
      return;
    }

    setGate({ gate: selectedGate, qubit, step });
  }
</script>

<div class="wrap" bind:this={wrapEl}>
  <svg
    bind:this={svgEl}
    viewBox={`0 0 ${width} ${height}`}
    width={width}
    height={height}
    preserveAspectRatio="xMinYMin meet"
    role="img"
    aria-label="quantum circuit"
    style={`aspect-ratio: ${width} / ${height};`}
  >
    <!-- Wires (stop just before the sphere column so the sphere sits cleanly
         next to the last gate cell). A second short segment connects the
         sphere column to the measurement gate. -->
    {#each Array($circuit.num_qubits) as _, q}
      <line
        x1={LEFT_PAD - 16}
        y1={cy(q)}
        x2={sphereX - 4}
        y2={cy(q)}
        stroke="var(--border)"
        stroke-width="1"
        stroke-dasharray="2 2"
      />
      <line
        x1={sphereX + SPHERE_SIZE + 4}
        y1={cy(q)}
        x2={measureXAt(q)}
        y2={cy(q)}
        stroke="var(--border)"
        stroke-width="1"
        stroke-dasharray="2 2"
      />
      <text
        x={LEFT_PAD - 28}
        y={cy(q) + 4}
        fill={TRACK_COLORS[q % TRACK_COLORS.length]}
        text-anchor="end"
        font-size="11"
        font-family="var(--mono)"
      >
        q{q}
      </text>
    {/each}

    <!-- Measurement gates at the right end of every wire. The arc + arrow is
         the standard quantum-circuit measurement glyph; coloured per qubit so
         the eye can trace each wire down into the timeline + MI matrix.
         Each <g> carries data-meas-q so the connector overlay can find it. -->
    {#each Array($circuit.num_qubits) as _, q}
      {@const c = TRACK_COLORS[q % TRACK_COLORS.length]}
      {@const mx = measureXAt(q)}
      {@const my = cy(q) - MEASURE_SIZE / 2}
      {@const gcx = mx + MEASURE_SIZE / 2}
      {@const piv = cy(q) + 4.5}
      {@const r = 7.5}
      <g class="measure" data-meas-q={q}>
        <!-- Framed box, same 1px accent border as the gate cards. -->
        <rect x={mx} y={my} width={MEASURE_SIZE} height={MEASURE_SIZE} fill={c} stroke={c} stroke-width="1" />
        <rect x={mx + 1} y={my + 1} width={MEASURE_SIZE - 2} height={MEASURE_SIZE - 2} fill="var(--bg-1)" />
        <!-- Gauge dial: a true semicircle (circular, not squished) with a needle
             swung up to the right and a small pivot — the standard measurement
             glyph, sized to sit centred in the square like the gate icons. -->
        <path
          d={`M ${gcx - r} ${piv} A ${r} ${r} 0 0 1 ${gcx + r} ${piv}`}
          fill="none"
          stroke={c}
          stroke-width="1.2"
          stroke-linecap="round"
        />
        <line
          x1={gcx}
          y1={piv}
          x2={gcx + r * 0.82}
          y2={piv - r * 1.05}
          stroke={c}
          stroke-width="1.2"
          stroke-linecap="round"
        />
        <circle cx={gcx} cy={piv} r="1.3" fill={c} />
      </g>
    {/each}

    <!-- Current-step column highlight. Width is capped (and centred on the
         column) so that when few steps spread wide it stays a tasteful band
         rather than ballooning into a giant translucent box across the step. -->
    <rect
      x={cx($currentStep) - Math.min(stepW - 8, 96) / 2}
      y={TOP_PAD - 6}
      width={Math.min(stepW - 8, 96)}
      height={WIRE_H * $circuit.num_qubits + 12}
      fill="var(--mint)"
      opacity="0.04"
    />

    <!-- Layer labels. A dot under the number marks layers that have a computed
         (backend-measured) run — see ComputePanel / the Compute feature. -->
    {#each Array($circuit.num_steps) as _, s}
      <text
        x={cx(s)}
        y={TOP_PAD - 10}
        fill={s === $currentStep ? 'var(--mint)' : 'var(--fg-mute)'}
        text-anchor="middle"
        font-size="9"
        font-family="var(--mono)"
        letter-spacing="0.1em"
      >
        {String(s + 1).padStart(2, '0')}
      </text>
      {#if $computedSteps.includes(s)}
        <circle cx={cx(s)} cy={TOP_PAD - 3} r="1.7" fill="var(--mint)">
          <title>layer {s + 1} computed</title>
        </circle>
      {/if}
    {/each}

    <!-- Click targets (empty cells) -->
    {#each Array($circuit.num_steps) as _, s}
      {#each Array($circuit.num_qubits) as _, q}
        <rect
          class="cell"
          x={cx(s) - stepW / 2 + 4}
          y={cy(q) - WIRE_H / 2 + 6}
          width={stepW - 8}
          height={WIRE_H - 12}
          fill="transparent"
          style="cursor: pointer"
          role="button"
          tabindex="0"
          aria-label={`place gate at layer ${s + 1} qubit ${q}`}
          on:click={() => handleClick(s, q)}
          on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick(s, q)}
          on:pointerup={() => onCellPointerUp(s, q)}
        />
      {/each}
    {/each}

    <!-- Pending control marker — anchored at the cell the user clicked first. -->
    {#if pendingControl !== null && selectedGate}
      <circle
        cx={cx(pendingControl.step)}
        cy={cy(pendingControl.qubit)}
        r="8"
        fill="none"
        stroke="var(--beige)"
        stroke-dasharray="3 2"
        stroke-width="1"
      />
    {/if}

    <!-- Bloch sphere position anchors: invisible rects that scale with the SVG.
         The spheres themselves are an HTML overlay measured from these (below),
         since foreignObject content doesn't scale reliably in WebKit. -->
    {#each Array($circuit.num_qubits) as _, q}
      <rect
        class="sphere-anchor"
        data-sphere-q={q}
        x={sphereX}
        y={cy(q) - SPHERE_SIZE / 2}
        width={SPHERE_SIZE}
        height={SPHERE_SIZE}
        fill="none"
      />
    {/each}

    <!-- Gates -->
    {#each $circuit.gates as g}
      {@const touched = qubitsTouched(g)}
      {@const isDragging = dragging?.gate === g}
      {@const gateOpacity = isDragging && !dropValid ? 0.35 : 1}
      {#if g.gate === 'cnot' || g.gate === 'cx'}
        {@const ctrl = endpointXY(g, 'control', g.control ?? 0, dragging, dragRenderPos, stepW)}
        {@const tgt = endpointXY(g, 'target', g.target ?? 0, dragging, dragRenderPos, stepW)}
        {@const topQ = Math.min(g.control ?? 0, g.target ?? 0)}
        {@const botQ = Math.max(g.control ?? 0, g.target ?? 0)}
        <g
          class="gate"
          style={`opacity: ${gateOpacity};`}
          on:pointerenter={(e) => onGateEnter(e, g)}
          on:pointermove={onGateMove}
          on:pointerleave={hideTooltip}
        >
          <!-- Invisible hover region spanning the whole gate + the X badge, so
               moving the cursor from an endpoint toward the X never breaks hover. -->
          <rect
            class="hover-area"
            x={cx(g.step) - 14}
            y={cy(topQ) - 22}
            width={38}
            height={cy(botQ) - cy(topQ) + 36}
            fill="none"
            pointer-events="all"
          />
          <!-- Connecting line -->
          <line x1={ctrl.x} y1={ctrl.y} x2={tgt.x} y2={tgt.y} stroke="var(--mint)" stroke-width="1" />
          <!-- Control endpoint (draggable) -->
          <g
            class="endpoint"
            style="cursor: grab;"
            on:pointerdown={(e) => startDrag(g, 'control', g.control ?? 0, e)}
            on:pointermove={onDragMove}
            on:pointerup={endDrag}
            on:lostpointercapture={endDrag}
            on:pointercancel={endDrag}
          >
            <circle cx={ctrl.x} cy={ctrl.y} r="12" fill="transparent" />
            <circle cx={ctrl.x} cy={ctrl.y} r="5" fill="var(--mint)" />
          </g>
          <!-- Target endpoint (draggable) -->
          <g
            class="endpoint"
            style="cursor: grab;"
            on:pointerdown={(e) => startDrag(g, 'target', g.target ?? 0, e)}
            on:pointermove={onDragMove}
            on:pointerup={endDrag}
            on:lostpointercapture={endDrag}
            on:pointercancel={endDrag}
          >
            <circle cx={tgt.x} cy={tgt.y} r="14" fill="transparent" />
            <circle cx={tgt.x} cy={tgt.y} r="10" fill="var(--bg-1)" stroke="var(--mint)" stroke-width="1" />
            <line x1={tgt.x - 7} y1={tgt.y} x2={tgt.x + 7} y2={tgt.y} stroke="var(--mint)" stroke-width="1" />
            <line x1={tgt.x} y1={tgt.y - 7} x2={tgt.x} y2={tgt.y + 7} stroke="var(--mint)" stroke-width="1" />
          </g>
          <!-- Remove button -->
          <g
            class="x-btn"
            role="button"
            tabindex="0"
            aria-label="remove CNOT"
            on:pointerdown={(e) => e.stopPropagation()}
            on:click={(e) => removeWholeGate(g, e)}
            on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && removeWholeGate(g, e)}
            style="cursor: pointer;"
          >
            <circle cx={cx(g.step) + 16} cy={cy(topQ) - 14} r="7" fill="var(--bg-1)" stroke="var(--mauve)" stroke-width="1" />
            <line x1={cx(g.step) + 13} y1={cy(topQ) - 17} x2={cx(g.step) + 19} y2={cy(topQ) - 11} stroke="var(--mauve)" stroke-width="1.2" />
            <line x1={cx(g.step) + 19} y1={cy(topQ) - 17} x2={cx(g.step) + 13} y2={cy(topQ) - 11} stroke="var(--mauve)" stroke-width="1.2" />
          </g>
        </g>
      {:else if g.gate === 'cz'}
        {@const ctrl = endpointXY(g, 'control', g.control ?? 0, dragging, dragRenderPos, stepW)}
        {@const tgt = endpointXY(g, 'target', g.target ?? 0, dragging, dragRenderPos, stepW)}
        {@const topQ = Math.min(g.control ?? 0, g.target ?? 0)}
        {@const botQ = Math.max(g.control ?? 0, g.target ?? 0)}
        <g
          class="gate"
          style={`opacity: ${gateOpacity};`}
          on:pointerenter={(e) => onGateEnter(e, g)}
          on:pointermove={onGateMove}
          on:pointerleave={hideTooltip}
        >
          <rect
            class="hover-area"
            x={cx(g.step) - 14}
            y={cy(topQ) - 22}
            width={38}
            height={cy(botQ) - cy(topQ) + 36}
            fill="none"
            pointer-events="all"
          />
          <line x1={ctrl.x} y1={ctrl.y} x2={tgt.x} y2={tgt.y} stroke="var(--mauve)" stroke-width="1" />
          <g
            class="endpoint"
            style="cursor: grab;"
            on:pointerdown={(e) => startDrag(g, 'control', g.control ?? 0, e)}
            on:pointermove={onDragMove}
            on:pointerup={endDrag}
            on:lostpointercapture={endDrag}
            on:pointercancel={endDrag}
          >
            <circle cx={ctrl.x} cy={ctrl.y} r="12" fill="transparent" />
            <circle cx={ctrl.x} cy={ctrl.y} r="5" fill="var(--mauve)" />
          </g>
          <g
            class="endpoint"
            style="cursor: grab;"
            on:pointerdown={(e) => startDrag(g, 'target', g.target ?? 0, e)}
            on:pointermove={onDragMove}
            on:pointerup={endDrag}
            on:lostpointercapture={endDrag}
            on:pointercancel={endDrag}
          >
            <circle cx={tgt.x} cy={tgt.y} r="12" fill="transparent" />
            <circle cx={tgt.x} cy={tgt.y} r="5" fill="var(--mauve)" />
          </g>
          <g
            class="x-btn"
            role="button"
            tabindex="0"
            aria-label="remove CZ"
            on:pointerdown={(e) => e.stopPropagation()}
            on:click={(e) => removeWholeGate(g, e)}
            on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && removeWholeGate(g, e)}
            style="cursor: pointer;"
          >
            <circle cx={cx(g.step) + 16} cy={cy(topQ) - 14} r="7" fill="var(--bg-1)" stroke="var(--mauve)" stroke-width="1" />
            <line x1={cx(g.step) + 13} y1={cy(topQ) - 17} x2={cx(g.step) + 19} y2={cy(topQ) - 11} stroke="var(--mauve)" stroke-width="1.2" />
            <line x1={cx(g.step) + 19} y1={cy(topQ) - 17} x2={cx(g.step) + 13} y2={cy(topQ) - 11} stroke="var(--mauve)" stroke-width="1.2" />
          </g>
        </g>
      {:else if g.gate === 'swap'}
        {@const a = endpointXY(g, 'qubit1', g.qubit1 ?? 0, dragging, dragRenderPos, stepW)}
        {@const b = endpointXY(g, 'qubit2', g.qubit2 ?? 0, dragging, dragRenderPos, stepW)}
        {@const topQ = Math.min(g.qubit1 ?? 0, g.qubit2 ?? 0)}
        {@const botQ = Math.max(g.qubit1 ?? 0, g.qubit2 ?? 0)}
        <g
          class="gate"
          style={`opacity: ${gateOpacity};`}
          on:pointerenter={(e) => onGateEnter(e, g)}
          on:pointermove={onGateMove}
          on:pointerleave={hideTooltip}
        >
          <rect
            class="hover-area"
            x={cx(g.step) - 14}
            y={cy(topQ) - 22}
            width={38}
            height={cy(botQ) - cy(topQ) + 36}
            fill="none"
            pointer-events="all"
          />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--beige)" stroke-width="1" />
          <g
            class="endpoint"
            style="cursor: grab;"
            on:pointerdown={(e) => startDrag(g, 'qubit1', g.qubit1 ?? 0, e)}
            on:pointermove={onDragMove}
            on:pointerup={endDrag}
            on:lostpointercapture={endDrag}
            on:pointercancel={endDrag}
          >
            <circle cx={a.x} cy={a.y} r="12" fill="transparent" />
            <line x1={a.x - 5} y1={a.y - 5} x2={a.x + 5} y2={a.y + 5} stroke="var(--beige)" stroke-width="1" />
            <line x1={a.x - 5} y1={a.y + 5} x2={a.x + 5} y2={a.y - 5} stroke="var(--beige)" stroke-width="1" />
          </g>
          <g
            class="endpoint"
            style="cursor: grab;"
            on:pointerdown={(e) => startDrag(g, 'qubit2', g.qubit2 ?? 0, e)}
            on:pointermove={onDragMove}
            on:pointerup={endDrag}
            on:lostpointercapture={endDrag}
            on:pointercancel={endDrag}
          >
            <circle cx={b.x} cy={b.y} r="12" fill="transparent" />
            <line x1={b.x - 5} y1={b.y - 5} x2={b.x + 5} y2={b.y + 5} stroke="var(--beige)" stroke-width="1" />
            <line x1={b.x - 5} y1={b.y + 5} x2={b.x + 5} y2={b.y - 5} stroke="var(--beige)" stroke-width="1" />
          </g>
          <g
            class="x-btn"
            role="button"
            tabindex="0"
            aria-label="remove SWAP"
            on:pointerdown={(e) => e.stopPropagation()}
            on:click={(e) => removeWholeGate(g, e)}
            on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && removeWholeGate(g, e)}
            style="cursor: pointer;"
          >
            <circle cx={cx(g.step) + 16} cy={cy(topQ) - 14} r="7" fill="var(--bg-1)" stroke="var(--mauve)" stroke-width="1" />
            <line x1={cx(g.step) + 13} y1={cy(topQ) - 17} x2={cx(g.step) + 19} y2={cy(topQ) - 11} stroke="var(--mauve)" stroke-width="1.2" />
            <line x1={cx(g.step) + 19} y1={cy(topQ) - 17} x2={cx(g.step) + 13} y2={cy(topQ) - 11} stroke="var(--mauve)" stroke-width="1.2" />
          </g>
        </g>
      {:else}
        {@const q = touched[0]}
        {@const accent = g.gate.startsWith('r') ? 'var(--beige)' : 'var(--mint)'}
        {@const tx = isDragging && dragRenderPos ? dragRenderPos.x - cx(g.step) : 0}
        {@const ty = isDragging && dragRenderPos ? dragRenderPos.y - cy(q) : 0}
        <g
          class="gate"
          transform={isDragging ? `translate(${tx}, ${ty})` : ''}
          style={`cursor: grab; opacity: ${gateOpacity};`}
          on:pointerdown={(e) => startDrag(g, 'qubit', q, e)}
          on:pointermove={(e) => {
            onDragMove(e);
            onGateMove(e);
          }}
          on:pointerenter={(e) => onGateEnter(e, g)}
          on:pointerleave={hideTooltip}
          on:pointerup={endDrag}
          on:lostpointercapture={endDrag}
          on:pointercancel={endDrag}
        >
          <!-- Card body (frame). The visible "frame" is the 1px gap between
               outer and inner rects — kept thin to match CNOT/CZ line weight. -->
          <rect
            x={cx(g.step) - 24}
            y={cy(q) - 13}
            width={48}
            height={26}
            fill={accent}
            stroke={accent}
            stroke-width="1"
          />
          <rect
            x={cx(g.step) - 23}
            y={cy(q) - 12}
            width={46}
            height={24}
            fill="var(--bg-1)"
            stroke="none"
          />
          <!-- Glyph (axis + rotation arc) on the left half of the card. -->
          <GateIcon name={g.gate} x={cx(g.step) - 22} y={cy(q) - 8} size={16} color={accent} />
          <!-- Letter label on the right half. -->
          <text
            x={cx(g.step) + 9}
            y={cy(q) + 4}
            text-anchor="middle"
            fill={accent}
            font-family="var(--mono)"
            font-size="11"
            font-weight="600"
            letter-spacing="0.05em"
            style="pointer-events: none;"
          >
            {gateLabel(g)}
          </text>
          <!-- Rotation angle, shown under the card (click the gate to edit it). -->
          {#if g.gate === 'rx' || g.gate === 'ry' || g.gate === 'rz'}
            <text
              x={cx(g.step)}
              y={cy(q) + 23}
              text-anchor="middle"
              fill={accent}
              font-family="var(--mono)"
              font-size="8"
              opacity="0.75"
              style="pointer-events: none;"
            >
              {rotDeg(g)}°
            </text>
          {/if}
          <!-- Remove button (top-right corner). Hidden until the gate is hovered. -->
          <g
            class="x-btn"
            role="button"
            tabindex="0"
            aria-label={`remove ${gateLabel(g)} on qubit ${q}`}
            on:pointerdown={(e) => e.stopPropagation()}
            on:click={(e) => removeWholeGate(g, e)}
            on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && removeWholeGate(g, e)}
            style="cursor: pointer;"
          >
            <circle
              cx={cx(g.step) + 24}
              cy={cy(q) - 13}
              r="7"
              fill="var(--bg-1)"
              stroke="var(--mauve)"
              stroke-width="1"
            />
            <line
              x1={cx(g.step) + 21}
              y1={cy(q) - 16}
              x2={cx(g.step) + 27}
              y2={cy(q) - 10}
              stroke="var(--mauve)"
              stroke-width="1.2"
            />
            <line
              x1={cx(g.step) + 27}
              y1={cy(q) - 16}
              x2={cx(g.step) + 21}
              y2={cy(q) - 10}
              stroke="var(--mauve)"
              stroke-width="1.2"
            />
          </g>
        </g>
      {/if}
    {/each}
  </svg>

  <!-- Bloch spheres: HTML overlay laid over the SVG anchors. Positioned in px
       from the measured anchor boxes so they track the SVG's scale in every
       browser (no foreignObject). -->
  {#if $stepState}
    <div class="sphere-overlay">
      {#each $stepState.bloch_vectors as bv, q (bv.qubit)}
        {@const p = spherePos[q]}
        {#if p}
          <div
            class="sphere-cell"
            style={`left:${p.x}px; top:${p.y}px; width:${p.size}px; height:${p.size}px;`}
          >
            <BlochSphere
              theta={bv.theta}
              phi={bv.phi}
              r={bv.r}
              color={SPHERE_COLORS[q % SPHERE_COLORS.length]}
            />
            <div class="sphere-tip">
              <span><b>θ</b> {((bv.theta * 180) / Math.PI).toFixed(0)}°</span>
              <span><b>φ</b> {((bv.phi * 180) / Math.PI).toFixed(0)}°</span>
              <span><b>P</b> {(bv.probability * 100).toFixed(0)}%</span>
              <span><b>sw</b> {(swingOffset(bv.phi) * 100).toFixed(0)}%</span>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<svelte:window on:keydown={onWindowKeydown} />

{#if angleEditor}
  <!-- Click-away backdrop (transparent) closes the editor. -->
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="ae-backdrop" on:click={closeAngleEditor} />
  <div class="angle-editor" style={`left: ${angleEditor.x}px; top: ${angleEditor.y}px;`}>
    <div class="ae-head">
      <span class="ae-title">
        {angleEditor.gate.toUpperCase()} · q{angleEditor.qubit} · step {angleEditor.step + 1}
      </span>
      <button class="ae-close" aria-label="close" on:click={closeAngleEditor}>×</button>
    </div>
    <div class="ae-readout">
      <span class="ae-deg">{editAngleDeg}°</span>
      {#if editFirePct !== null}
        <span class="ae-hint">fires {editFirePct}%</span>
      {:else}
        <span class="ae-hint">phase · swing</span>
      {/if}
    </div>
    <input
      class="ae-slider"
      type="range"
      min="0"
      max="360"
      step="1"
      value={editAngleDeg}
      on:input={(e) => setAngleDeg(+e.currentTarget.value)}
    />
    <div class="ae-quick">
      {#each [0, 45, 90, 135, 180, 270] as d}
        <button class:on={editAngleDeg === d} on:click={() => setAngleDeg(d)}>{d}°</button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .wrap {
    /* Positioning context for the Bloch sphere HTML overlay (absolutely placed
       over the SVG anchors). */
    position: relative;
    border-radius: 0.5rem;
    padding: 0.25rem 0;
    height: 100%;
    min-height: 0;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
  }
  /* Sphere overlay: transparent layer over the SVG; only the sphere cells take
     pointer events (so dragging a sphere works, clicks elsewhere fall through to
     the circuit). */
  .sphere-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
  }
  /* Sized off the available height; width: auto derives the width from the
     intrinsic ratio, max-width clamps it to the wrap when steps overflow.
     The ratio comes from the width/height ATTRIBUTES, not the inline
     aspect-ratio — Safari won't derive a replaced element's auto dimension from
     CSS aspect-ratio alone, so without the attributes the grid collapsed there. */
  svg {
    display: block;
    height: 100%;
    width: auto;
    max-width: 100%;
    /* Clamp height too: when the width hits max-width (wide + short windows) the
       height would otherwise grow past the panel to keep the aspect ratio, and
       the bottom wire/sphere spilled below the panel. max-height bounds it so the
       circuit always fits its container (it letterboxes instead of overflowing). */
    max-height: 100%;
  }

  /* Suppress browser default focus rings on SVG interactive elements. */
  .cell,
  .cell:focus,
  .cell:focus-visible {
    outline: none;
  }

  /* Gate — subtle hover/focus indicator; remove the default browser focus ring. */
  .gate {
    outline: none;
    transition: opacity 80ms ease;
  }
  .gate:hover,
  .gate:focus-visible {
    opacity: 0.95;
  }
  .gate:active {
    cursor: grabbing;
  }

  /* X button — hidden until hover/focus, fades in subtly. */
  .gate .x-btn {
    opacity: 0;
    transition: opacity 100ms ease;
    pointer-events: none;
  }
  .gate:hover .x-btn,
  .gate:focus-within .x-btn,
  .gate:focus-visible .x-btn {
    opacity: 1;
    pointer-events: auto;
  }

  /* One sphere cell, absolutely placed over its SVG anchor (left/top/width/height
     come from the measured anchor box, set inline). The threlte Canvas inside
     fills it. Hover reveals the per-qubit stats overlay. */
  .sphere-cell {
    position: absolute;
    pointer-events: auto;
  }
  .sphere-cell :global(canvas) {
    display: block;
  }
  .sphere-tip {
    position: absolute;
    bottom: 0.15rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(12, 20, 24, 0.94);
    border: 1px solid var(--border);
    padding: 0.2rem 0.45rem;
    display: flex;
    gap: 0.55rem;
    font-family: var(--mono);
    font-size: 0.6rem;
    color: var(--fg);
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 120ms ease;
    letter-spacing: 0.04em;
  }
  .sphere-tip b {
    color: var(--fg-mute);
    font-weight: 500;
    margin-right: 0.12rem;
    text-transform: uppercase;
  }
  .sphere-cell:hover .sphere-tip {
    opacity: 1;
  }

  /* On mobile drive the SVG off available width (not height) so the circuit
     fills the column instead of shrinking down to fit some smaller height. */
  @media (max-width: 800px) {
    .wrap {
      height: auto;
      align-items: stretch;
    }
    svg {
      width: 100%;
      height: auto;
      max-height: none;
    }
  }

  /* ── Rotation angle editor ── */
  .ae-backdrop {
    position: fixed;
    inset: 0;
    z-index: 6500;
    background: transparent;
  }
  .angle-editor {
    position: fixed;
    z-index: 6600;
    transform: translate(-50%, 12px);
    background: var(--bg-1);
    border: 1px solid var(--mint);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
    padding: 0.55rem 0.65rem;
    width: 200px;
    font-family: var(--mono);
    color: var(--fg);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .ae-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .ae-title {
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fg-dim);
  }
  .ae-close {
    background: none;
    border: none;
    color: var(--fg-mute);
    font-size: 0.9rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.15rem;
  }
  .ae-close:hover {
    color: var(--mint);
  }
  .ae-readout {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .ae-deg {
    color: var(--mint);
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
  }
  .ae-hint {
    font-size: 0.6rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-mute);
  }
  .ae-slider {
    width: 100%;
    accent-color: var(--mint);
    cursor: pointer;
  }
  .ae-quick {
    display: flex;
    gap: 0.25rem;
  }
  .ae-quick button {
    flex: 1;
    background: var(--bg-3);
    border: 1px solid var(--border);
    color: var(--fg-dim);
    font-family: var(--mono);
    font-size: 0.58rem;
    padding: 0.2rem 0;
    cursor: pointer;
    transition: border-color 100ms ease, color 100ms ease;
  }
  .ae-quick button:hover {
    color: var(--mint);
    border-color: var(--mint);
  }
  .ae-quick button.on {
    color: var(--bg);
    background: var(--mint);
    border-color: var(--mint);
  }
</style>
