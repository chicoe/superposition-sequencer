/**
 * Rendered scale factor of the circuit SVG.
 *
 * The circuit's intrinsic dimensions are computed from STEP_W / WIRE_H, but on
 * screen the SVG gets scaled to fit its container — wider circuits with more
 * steps end up smaller. The BlochPanel needs the same scale so each sphere
 * aligns with its wire instead of staying at the original WIRE_H pixel size.
 *
 * 1.0 means "rendered at intrinsic size"; 0.5 means "half size."
 */
import { writable } from 'svelte/store';

export const circuitScale = writable(1);

/**
 * Horizontal spacing (in SVG units) between consecutive measurement gates —
 * the staircase step. Driven by the connector overlay so the staircase pitch,
 * once scaled to the screen, matches the MI matrix's column pitch exactly. That
 * lets every measurement drop fall straight down its own column with no jog.
 * Default mirrors the historical hand-tuned value used before alignment.
 */
export const measureStagger = writable(48);
