/**
 * Global hover-tooltip state. Components call `showTooltip` on mouseenter /
 * mousemove and `hideTooltip` on mouseleave. The layout renders the tooltip
 * card and follows the cursor.
 */
import { writable } from 'svelte/store';

export interface TooltipState {
  title: string;
  subtitle?: string;
  body: string;
  x: number; // viewport coords
  y: number;
}

export const tooltip = writable<TooltipState | null>(null);

export function showTooltip(state: TooltipState) {
  tooltip.set(state);
}

export function moveTooltip(x: number, y: number) {
  tooltip.update((t) => (t ? { ...t, x, y } : t));
}

export function hideTooltip() {
  tooltip.set(null);
}

/**
 * Svelte action: show the global hover tooltip for any element.
 *   <button use:tip={{ title: 'Tempo', body: 'Beats per minute…' }}>…</button>
 */
export function tip(node: HTMLElement | SVGElement, params: Omit<TooltipState, 'x' | 'y'>) {
  let p = params;
  const enter = (e: PointerEvent) => showTooltip({ ...p, x: e.clientX, y: e.clientY });
  const move = (e: PointerEvent) => moveTooltip(e.clientX, e.clientY);
  const leave = () => hideTooltip();
  node.addEventListener('pointerenter', enter);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerleave', leave);
  return {
    update(next: Omit<TooltipState, 'x' | 'y'>) {
      p = next;
    },
    destroy() {
      node.removeEventListener('pointerenter', enter);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerleave', leave);
      hideTooltip();
    }
  };
}
