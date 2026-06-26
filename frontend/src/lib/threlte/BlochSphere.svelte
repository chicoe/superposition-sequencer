<!--
  Single Bloch sphere renderer.

  Coordinate convention: Bloch (x, y, z) → Three.js (x, z, y) so that |0⟩ points up (+Y).
  Bloch's z axis = vertical |0⟩/|1⟩, x axis = |+⟩/|-⟩, y axis = |+i⟩/|-i⟩.
-->
<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import * as THREE from 'three';
  import { cameraPos, cameraQuat, rotateBy } from '$lib/stores/blochView';

  export let theta = 0;
  export let phi = 0;
  export let r = 1;
  export let color = '#4a9eff';

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    rotateBy(dx * 0.008, dy * 0.008);
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onPointerUp(e: PointerEvent) {
    dragging = false;
    const t = e.currentTarget as HTMLElement;
    if (t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
  }

  // Bloch → scene mapping (swap y and z to put |0⟩ up).
  $: tipX = r * Math.sin(theta) * Math.cos(phi);
  $: tipY_bloch = r * Math.sin(theta) * Math.sin(phi);
  $: tipZ_bloch = r * Math.cos(theta);
  $: tipScene = [tipX, tipZ_bloch, tipY_bloch] as [number, number, number];

  // Arrow geometry: cylinder along its local +Y, then rotate to point from origin to tip.
  $: arrowLen = Math.max(0.001, Math.sqrt(tipX * tipX + tipY_bloch * tipY_bloch + tipZ_bloch * tipZ_bloch));
  $: arrowQuat = (() => {
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3(tipScene[0], tipScene[1], tipScene[2]);
    if (v.lengthSq() < 1e-10) return q; // degenerate; mesh isn't rendered anyway
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    return q;
  })();
  $: arrowPosition = [tipScene[0] / 2, tipScene[1] / 2, tipScene[2] / 2] as [number, number, number];

  // Phi ring sits at the tip's height on the z-axis (= scene y).
  $: ringRadius = Math.max(0.0005, Math.sqrt(tipX * tipX + tipY_bloch * tipY_bloch));
  $: ringY = tipZ_bloch;
</script>

<div
  class="sphere"
  on:pointerdown={onPointerDown}
  on:pointermove={onPointerMove}
  on:pointerup={onPointerUp}
  on:pointercancel={onPointerUp}
  on:lostpointercapture={onPointerUp}
>
  <Canvas>
    <T.PerspectiveCamera
      makeDefault
      position={$cameraPos}
      quaternion={$cameraQuat}
      fov={42}
    />

    <!-- Sphere outline as a single thin wireframe (cell-shaded look, no lighting) -->
    <T.Mesh>
      <T.SphereGeometry args={[1, 18, 12]} />
      <T.MeshBasicMaterial color="#2a3a40" wireframe transparent opacity={0.5} />
    </T.Mesh>

    <!-- Axes — flat lines in the muted palette -->
    <T.Group>
      <T.Mesh rotation={[0, 0, Math.PI / 2]}>
        <T.CylinderGeometry args={[0.003, 0.003, 2.0, 6]} />
        <T.MeshBasicMaterial color="#6a5d72" />
      </T.Mesh>
      <T.Mesh>
        <T.CylinderGeometry args={[0.003, 0.003, 2.0, 6]} />
        <T.MeshBasicMaterial color="#7d745c" />
      </T.Mesh>
      <T.Mesh rotation={[Math.PI / 2, 0, 0]}>
        <T.CylinderGeometry args={[0.003, 0.003, 2.0, 6]} />
        <T.MeshBasicMaterial color="#3d4f60" />
      </T.Mesh>
    </T.Group>

    <!-- Phi indicator ring -->
    {#if ringRadius > 0.02}
      <T.Mesh position={[0, ringY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <T.TorusGeometry args={[ringRadius, 0.005, 6, 48]} />
        <T.MeshBasicMaterial color={color} transparent opacity={0.5} />
      </T.Mesh>
      <T.Mesh position={[tipX, ringY, tipY_bloch]}>
        <T.SphereGeometry args={[0.035, 8, 6]} />
        <T.MeshBasicMaterial color={color} />
      </T.Mesh>
    {/if}

    <!-- State vector: flat-shaded arrow when r > threshold, ring marker otherwise. -->
    {#if arrowLen > 0.06}
      <T.Mesh position={arrowPosition} quaternion={[arrowQuat.x, arrowQuat.y, arrowQuat.z, arrowQuat.w]}>
        <T.CylinderGeometry args={[0.018, 0.018, arrowLen, 8]} />
        <T.MeshBasicMaterial color={color} />
      </T.Mesh>
      <T.Mesh position={tipScene} quaternion={[arrowQuat.x, arrowQuat.y, arrowQuat.z, arrowQuat.w]}>
        <T.ConeGeometry args={[0.055, 0.13, 8]} />
        <T.MeshBasicMaterial color={color} />
      </T.Mesh>
    {:else}
      <T.Mesh rotation={[Math.PI / 2, 0, 0]}>
        <T.TorusGeometry args={[0.1, 0.012, 6, 18]} />
        <T.MeshBasicMaterial color={color} />
      </T.Mesh>
      <T.Mesh>
        <T.SphereGeometry args={[0.05, 8, 6]} />
        <T.MeshBasicMaterial color={color} />
      </T.Mesh>
    {/if}
  </Canvas>
</div>

<style>
  .sphere {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
  }
  .sphere:active {
    cursor: grabbing;
  }
  /* let pointer events reach the wrapper div (we handle drag manually) */
  .sphere :global(canvas) {
    pointer-events: none;
  }
</style>
