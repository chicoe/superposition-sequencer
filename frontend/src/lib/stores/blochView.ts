/**
 * Shared camera orientation for all Bloch spheres.
 * Drag on any sphere updates this store; all spheres render with the same view.
 */
import { derived, writable } from 'svelte/store';
import * as THREE from 'three';

const RADIUS = 3.2;
const MIN_EL = -Math.PI / 2 + 0.12;
const MAX_EL = Math.PI / 2 - 0.12;

export const azimuth = writable(Math.PI / 4); // angle around world Y axis
export const elevation = writable(Math.PI / 7); // angle above horizon

export function rotateBy(dAz: number, dEl: number) {
  azimuth.update((a) => a - dAz);
  elevation.update((e) => Math.max(MIN_EL, Math.min(MAX_EL, e + dEl)));
}

export const cameraPos = derived([azimuth, elevation], ([$az, $el]) => {
  const x = RADIUS * Math.cos($el) * Math.sin($az);
  const y = RADIUS * Math.sin($el);
  const z = RADIUS * Math.cos($el) * Math.cos($az);
  return [x, y, z] as [number, number, number];
});

const _eye = new THREE.Vector3();
const _target = new THREE.Vector3(0, 0, 0);
const _up = new THREE.Vector3(0, 1, 0);
const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();

export const cameraQuat = derived(cameraPos, ([x, y, z]) => {
  _eye.set(x, y, z);
  _mat.lookAt(_eye, _target, _up);
  _quat.setFromRotationMatrix(_mat);
  return [_quat.x, _quat.y, _quat.z, _quat.w] as [number, number, number, number];
});
