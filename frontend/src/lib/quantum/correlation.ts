/**
 * Pairwise correlation between two qubits, computed from the joint measurement
 * distribution of the full statevector.
 *
 * Returns Pearson correlation in [-1, +1]:
 *   |00>+|11>  -> +1 (perfectly correlated, e.g. Bell phi+)
 *   |01>-|10>  -> -1 (anti-correlated, Bell singlet)
 *   product    ->  0
 *
 * For pure global states this is non-zero iff the two qubits are entangled —
 * exactly the property we want to drive a ring modulator between them.
 *
 * Qubit indexing follows Qiskit's little-endian convention used throughout
 * the app: bit `q` of the basis index `k` is `(k >> q) & 1`.
 */
import type { ComplexAmplitude } from '$lib/types';

export function pairCorrelation(
  sv: ComplexAmplitude[],
  i: number,
  j: number
): number {
  let p00 = 0;
  let p01 = 0;
  let p10 = 0;
  let p11 = 0;
  for (let k = 0; k < sv.length; k++) {
    const a = sv[k];
    const prob = a.re * a.re + a.im * a.im;
    if (prob === 0) continue;
    const bi = (k >> i) & 1;
    const bj = (k >> j) & 1;
    if (bi === 0 && bj === 0) p00 += prob;
    else if (bi === 0 && bj === 1) p01 += prob;
    else if (bi === 1 && bj === 0) p10 += prob;
    else p11 += prob;
  }
  const pI = p10 + p11; // P(bit_i = 1)
  const pJ = p01 + p11; // P(bit_j = 1)
  const cov = p11 - pI * pJ;
  const varI = pI * (1 - pI);
  const varJ = pJ * (1 - pJ);
  const denom = Math.sqrt(varI * varJ);
  if (denom < 1e-9) return 0; // one of the marginals is degenerate
  return cov / denom;
}
