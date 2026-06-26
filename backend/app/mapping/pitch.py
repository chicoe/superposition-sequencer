"""Bitstring → pitch mapping for melodic tracks (spec §8 pitch mapping)."""
from __future__ import annotations

# Semitone offsets from the root for common scales (one octave).
SCALES: dict[str, list[int]] = {
    "chromatic": list(range(12)),
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "minor_pentatonic": [0, 3, 5, 7, 10],
    "major_pentatonic": [0, 2, 4, 7, 9],
    "whole_tone": [0, 2, 4, 6, 8, 10],
    "blues": [0, 3, 5, 6, 7, 10],
}

_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _note_to_midi(note: str) -> int:
    """Parse a note name like 'C3' or 'Eb4' into a MIDI number."""
    name = note[0].upper()
    rest = note[1:]
    accidental = 0
    if rest and rest[0] in {"#", "b"}:
        accidental = 1 if rest[0] == "#" else -1
        rest = rest[1:]
    if not rest:
        raise ValueError(f"missing octave in note: {note}")
    octave = int(rest)
    base = _NOTE_NAMES.index(name)
    return 12 * (octave + 1) + base + accidental


def generate_scale(root: str, scale: str, octaves: int = 2) -> list[int]:
    """Return MIDI note numbers for `octaves` of `scale` starting at `root`."""
    if scale not in SCALES:
        raise ValueError(f"unknown scale: {scale}")
    root_midi = _note_to_midi(root)
    steps = SCALES[scale]
    return [root_midi + 12 * o + s for o in range(octaves) for s in steps]


def pitch_for_outcome(outcome: str, scale_notes: list[int]) -> int:
    """Pick a MIDI pitch from `scale_notes` indexed by the bitstring's integer value."""
    if not scale_notes:
        raise ValueError("empty scale")
    idx = int(outcome, 2) if outcome else 0
    return scale_notes[idx % len(scale_notes)]
