/**
 * Quantum mutual information between every pair of qubits in the current
 * step's pure statevector.
 *
 *   I(i:j) = S(rho_i) + S(rho_j) - S(rho_ij)
 *
 * where S is the von Neumann entropy and rho_X is the reduced density matrix
 * obtained by tracing out everything outside X. For a pure global state I(i:j)
 * is non-zero iff i and j are entangled or share classical correlation through
 * the state — i.e. it's the natural "how connected are these qubits" number.
 *
 * Bounds (per pair): 0 <= I <= 2 (in bits, two qubits each carry log2(2) = 1
 * bit of entropy maximum).
 *
 * Single-qubit entropies use the analytic Bloch-radius formula. Two-qubit
 * reduced density matrices are 4x4 complex Hermitian — we diagonalise by
 * embedding into 8x8 real symmetric form ([[A,-B],[B,A]] for rho = A + iB)
 * and running Jacobi.
 */
import type { ComplexAmplitude } from '$lib/types';

function singleQubitEntropy(r: number): number {
  const radius = Math.max(0, Math.min(1, r));
  const lp = (1 + radius) / 2;
  const lm = (1 - radius) / 2;
  return -(xlogx(lp) + xlogx(lm));
}

function xlogx(x: number): number {
  return x > 1e-12 ? x * Math.log2(x) : 0;
}

/**
 * Build the 8x8 real symmetric matrix that encodes the 4x4 complex
 * Hermitian reduced density matrix rho_ij. Eigenvalues of the 8x8 equal the
 * eigenvalues of rho_ij with multiplicity 2.
 */
function reducedDensityReal8(
  sv: ComplexAmplitude[],
  n: number,
  i: number,
  j: number
): number[][] {
  const A: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const B: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];

  const otherBits: number[] = [];
  for (let k = 0; k < n; k++) if (k !== i && k !== j) otherBits.push(k);
  const eCount = 1 << otherBits.length;

  for (let e = 0; e < eCount; e++) {
    let base = 0;
    for (let m = 0; m < otherBits.length; m++) {
      if ((e >> m) & 1) base |= 1 << otherBits[m];
    }
    // Cache the four amplitudes that share these "other" bits.
    const camps: ComplexAmplitude[] = new Array(4);
    for (let r = 0; r < 4; r++) {
      const a = (r >> 1) & 1; // bit_i
      const b = r & 1; // bit_j
      camps[r] = sv[base | (a << i) | (b << j)];
    }
    for (let r1 = 0; r1 < 4; r1++) {
      const c1 = camps[r1];
      for (let r2 = 0; r2 < 4; r2++) {
        const c2 = camps[r2];
        // c1 * conj(c2)
        A[r1][r2] += c1.re * c2.re + c1.im * c2.im;
        B[r1][r2] += c1.im * c2.re - c1.re * c2.im;
      }
    }
  }

  const S: number[][] = Array.from({ length: 8 }, () => new Array(8).fill(0));
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      S[r][c] = A[r][c];
      S[r][c + 4] = -B[r][c];
      S[r + 4][c] = B[r][c];
      S[r + 4][c + 4] = A[r][c];
    }
  }
  return S;
}

/** Cyclic Jacobi eigenvalues for an n x n real symmetric matrix. */
function jacobiEigenvalues(input: number[][]): number[] {
  const n = input.length;
  const A: number[][] = input.map((row) => row.slice());
  const MAX_SWEEPS = 50;
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    }
    if (off < 1e-22) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-14) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * apq);
        let t: number;
        if (!isFinite(theta) || Math.abs(theta) > 1e12) {
          t = 1 / (2 * theta);
        } else {
          const sgn = theta >= 0 ? 1 : -1;
          t = sgn / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        }
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          if (k !== p && k !== q) {
            const akp = A[k][p];
            const akq = A[k][q];
            A[k][p] = c * akp - s * akq;
            A[k][q] = s * akp + c * akq;
            A[p][k] = A[k][p];
            A[q][k] = A[k][q];
          }
        }
        const app = A[p][p];
        const aqq = A[q][q];
        A[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
        A[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
        A[p][q] = 0;
        A[q][p] = 0;
      }
    }
  }
  const eigs: number[] = new Array(n);
  for (let i = 0; i < n; i++) eigs[i] = A[i][i];
  return eigs;
}

function vonNeumannEntropy(eigs: number[]): number {
  let s = 0;
  for (const l of eigs) s -= xlogx(Math.max(0, l));
  return s;
}

/**
 * Compute the symmetric n x n MI matrix. Diagonal is 0; entry (i, j) is
 * the mutual information in bits.
 */
export function mutualInfoMatrix(
  sv: ComplexAmplitude[],
  n: number,
  blochR: number[]
): number[][] {
  const sQ = new Array(n);
  for (let q = 0; q < n; q++) sQ[q] = singleQubitEntropy(blochR[q] ?? 0);

  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let sIJ: number;
      if (n === 2) {
        // Global state is pure on these two qubits — S(rho_ij) = 0.
        sIJ = 0;
      } else {
        const S = reducedDensityReal8(sv, n, i, j);
        const eigs8 = jacobiEigenvalues(S);
        // Each rho_ij eigenvalue appears twice; sort and pair consecutively.
        eigs8.sort((a, b) => b - a);
        const eigs4: number[] = [
          (eigs8[0] + eigs8[1]) / 2,
          (eigs8[2] + eigs8[3]) / 2,
          (eigs8[4] + eigs8[5]) / 2,
          (eigs8[6] + eigs8[7]) / 2
        ];
        sIJ = vonNeumannEntropy(eigs4);
      }
      const mi = Math.max(0, sQ[i] + sQ[j] - sIJ);
      out[i][j] = mi;
      out[j][i] = mi;
    }
  }
  return out;
}
