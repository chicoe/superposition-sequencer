<!--
  Gate glyph: a fixed isometric Bloch sphere (circle + three reference axes:
  X down-right, Y down-left, Z up) overlaid with a curved arrow that traces
  the actual 3D path the state vector takes during the gate, projected into
  that same isometric view.

  Conventions (qubit axes -> screen):
    +X  lower-right    (|+>)
    +Y  lower-left
    +Z  top            (|0>)

  Gates:
    H              path |0> -> |+>  (rotation around (X+Z)/sqrt(2) by pi)
    X / Rx         path |0> -> |1>  through -Y (rotation around X)
    Y / Ry         path |0> -> |1>  through +X (rotation around Y)
    Z / Rz         path |+> -> |->  along the equator (rotation around Z)
    S              quarter of the equator (Z by pi/2)
    T              eighth  of the equator (Z by pi/4)
    Rx / Ry / Rz   same arc as X / Y / Z but dashed = parameterized angle.
-->
<script lang="ts">
  export let name: string;
  export let x = 0;
  export let y = 0;
  export let size = 14;
  export let color = 'currentColor';

  $: cx = x + size / 2;
  $: cy = y + size / 2;
  $: r = size * 0.36;
  $: sw = size * 0.085; // arc stroke
  $: axW = size * 0.03; // axis stroke
  $: ahL = size * 0.14; // arrowhead length
  $: ahW = size * 0.085; // arrowhead half-width

  const COS30 = Math.cos(Math.PI / 6); // ~0.866
  const SIN30 = 0.5;

  // 3D -> screen (isometric): +X lower-right, +Y lower-left, +Z up.
  function project(
    px: number,
    py: number,
    pz: number,
    ccx: number,
    ccy: number,
    rr: number
  ): [number, number] {
    return [ccx + (px - py) * COS30 * rr, ccy + (px + py) * SIN30 * rr - pz * rr];
  }

  function gatePath(n: string): { samples: [number, number, number][]; dashed: boolean } | null {
    const dashed = n === 'rx' || n === 'ry' || n === 'rz';
    const N = 28;
    let fn: (t: number) => [number, number, number];
    let tMax: number;

    switch (n) {
      case 'h':
        // Rotation around (X+Z)/sqrt(2) by pi. Takes |0> -> |+>.
        fn = (t) => {
          const c = Math.cos(t);
          const s = Math.sin(t);
          return [(1 - c) / 2, -s / Math.SQRT2, (1 + c) / 2];
        };
        tMax = Math.PI;
        break;
      case 'x':
      case 'rx':
        // Rotation around X by pi. Path in the YZ plane, through -Y.
        fn = (t) => [0, -Math.sin(t), Math.cos(t)];
        tMax = Math.PI;
        break;
      case 'y':
      case 'ry':
        // Rotation around Y by pi. Path in the XZ plane, through +X.
        fn = (t) => [Math.sin(t), 0, Math.cos(t)];
        tMax = Math.PI;
        break;
      case 'z':
      case 'rz':
        // Rotation around Z by pi. Along the equator |+> -> |->.
        fn = (t) => [Math.cos(t), Math.sin(t), 0];
        tMax = Math.PI;
        break;
      case 's':
        // Quarter of the equator.
        fn = (t) => [Math.cos(t), Math.sin(t), 0];
        tMax = Math.PI / 2;
        break;
      case 't':
        // Eighth of the equator.
        fn = (t) => [Math.cos(t), Math.sin(t), 0];
        tMax = Math.PI / 4;
        break;
      default:
        return null;
    }

    const samples: [number, number, number][] = [];
    for (let i = 0; i <= N; i++) {
      samples.push(fn((i / N) * tMax));
    }
    return { samples, dashed };
  }

  $: g = gatePath(name);

  $: projected = g ? g.samples.map(([px, py, pz]) => project(px, py, pz, cx, cy, r)) : null;

  $: pathD = projected
    ? projected
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
        .join(' ')
    : '';

  // Arrowhead from the last segment's tangent.
  $: arrowPts = (() => {
    if (!projected || projected.length < 2) return '';
    const tip = projected[projected.length - 1];
    const prev = projected[projected.length - 2];
    let dx = tip[0] - prev[0];
    let dy = tip[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const bcx = tip[0] - ahL * dx;
    const bcy = tip[1] - ahL * dy;
    const blx = bcx + ahW * dy;
    const bly = bcy - ahW * dx;
    const brx = bcx - ahW * dy;
    const bry = bcy + ahW * dx;
    return `${tip[0].toFixed(2)},${tip[1].toFixed(2)} ${blx.toFixed(2)},${bly.toFixed(2)} ${brx.toFixed(2)},${bry.toFixed(2)}`;
  })();

  // Three reference axes from the centre to the sphere surface.
  $: xAx = project(1, 0, 0, cx, cy, r);
  $: yAx = project(0, 1, 0, cx, cy, r);
  $: zAx = project(0, 0, 1, cx, cy, r);
</script>

<g class="gate-icon">
  <!-- Sphere outline (an isometric-projected sphere is still a circle). -->
  <circle {cx} {cy} {r} fill="none" stroke={color} stroke-width={size * 0.045} opacity="0.4" />

  <!-- Three isometric reference axes (+X, +Y, +Z) drawn from the centre. -->
  <line x1={cx} y1={cy} x2={xAx[0]} y2={xAx[1]} stroke={color} stroke-width={axW} opacity="0.22" />
  <line x1={cx} y1={cy} x2={yAx[0]} y2={yAx[1]} stroke={color} stroke-width={axW} opacity="0.22" />
  <line x1={cx} y1={cy} x2={zAx[0]} y2={zAx[1]} stroke={color} stroke-width={axW} opacity="0.22" />

  {#if g && pathD}
    <path
      d={pathD}
      fill="none"
      stroke={color}
      stroke-width={sw}
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-dasharray={g.dashed ? `${size * 0.1} ${size * 0.07}` : ''}
    />
    <polygon points={arrowPts} fill={color} />
  {/if}
</g>
