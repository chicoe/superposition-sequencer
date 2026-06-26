// Shared layout constants for the circuit + Bloch column.
// Keep these in sync — CircuitDiagram and BlochPanel use them to align qubit rows.
export const WIRE_H = 80;
export const STEP_W = 54;
export const LEFT_PAD = 40;
export const TOP_PAD = 24;

// Upper bound (SVG units) on the measurement-staircase step. The connector
// overlay nudges `measureStagger` so the on-screen staircase pitch matches the MI
// matrix column pitch; this clamps it so a degenerate measurement can't run the
// staircase away. (The render scale is height-driven, so the stagger doesn't feed
// back into the circuit width — the circuit sizes to its actual content.)
export const MAX_STAGGER = 64;
