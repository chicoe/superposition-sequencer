/**
 * Pairwise classical mutual information between qubits, computed from the
 * actual stream of measured shots at the current step. Updates every beat
 * as new shots come in.
 *
 *   I(i:j) = sum_{x,y} P(xi, xj) log2[ P(xi, xj) / (P(xi) * P(xj)) ]
 *
 * Bounds: 0 <= I <= 1 bit (between two binary variables). Will be 0 with
 * fewer than two shots, and noisy until enough shots accumulate.
 *
 * `triggered` is used as the binary value (true=|0> measured). MI is invariant
 * under per-qubit bit flips so this is equivalent to using the raw bit.
 */
import type { ShotRecord } from '$lib/types';

function term(pXY: number, pX: number, pY: number): number {
  if (pXY < 1e-12 || pX < 1e-12 || pY < 1e-12) return 0;
  return pXY * Math.log2(pXY / (pX * pY));
}

export function empiricalMIMatrix(
  history: ShotRecord[][],
  epoch: number,
  n: number
): number[][] {
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  // Per-qubit slices since arriving at the current step. We use the
  // shortest row as N so all qubits are aligned shot-for-shot.
  const rows: ShotRecord[][] = new Array(n);
  let N = Infinity;
  for (let q = 0; q < n; q++) {
    const r = (history[q] ?? []).slice(epoch);
    rows[q] = r;
    if (r.length < N) N = r.length;
  }
  if (!isFinite(N) || N < 2) return matrix;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let c00 = 0, c01 = 0, c10 = 0, c11 = 0;
      const ri = rows[i];
      const rj = rows[j];
      for (let k = 0; k < N; k++) {
        const xi = ri[k].triggered ? 1 : 0;
        const xj = rj[k].triggered ? 1 : 0;
        if (xi === 0 && xj === 0) c00++;
        else if (xi === 0 && xj === 1) c01++;
        else if (xi === 1 && xj === 0) c10++;
        else c11++;
      }
      const p00 = c00 / N;
      const p01 = c01 / N;
      const p10 = c10 / N;
      const p11 = c11 / N;
      const pI0 = p00 + p01;
      const pI1 = p10 + p11;
      const pJ0 = p00 + p10;
      const pJ1 = p01 + p11;
      const mi =
        term(p00, pI0, pJ0) +
        term(p01, pI0, pJ1) +
        term(p10, pI1, pJ0) +
        term(p11, pI1, pJ1);
      const v = Math.max(0, mi);
      matrix[i][j] = v;
      matrix[j][i] = v;
    }
  }
  return matrix;
}
