import { describe, it, expect } from 'vitest';
import {
  buildScaleNotes,
  yToMidi,
  midiToNoteName,
  midiToFreq,
  isRootNote,
  SCALES,
} from './scales';

describe('Scales module', () => {
  it('builds C major pentatonic scale from C3 to C6', () => {
    const notes = buildScaleNotes(0, 'major pentatonic', 3, 6);
    expect(notes[0]).toBe(48); // C3
    expect(notes[notes.length - 1]).toBe(84); // C6
    expect(notes.length).toBe(16); // 3 octaves * 5 notes + 1 top root note
    expect(notes).toEqual([
      48, 50, 52, 55, 57, // Octave 3 (C3, D3, E3, G3, A3)
      60, 62, 64, 67, 69, // Octave 4 (C4, D4, E4, G4, A4)
      72, 74, 76, 79, 81, // Octave 5 (C5, D5, E5, G5, A5)
      84                  // Octave 6 (C6)
    ]);
  });

  it('builds all 6 supported scales without error', () => {
    const scaleNames = Object.keys(SCALES) as (keyof typeof SCALES)[];
    for (const name of scaleNames) {
      const notes = buildScaleNotes(0, name, 3, 6);
      expect(notes.length).toBeGreaterThan(10);
      expect(notes[0]).toBe(48);
      expect(notes[notes.length - 1]).toBe(84);
    }
  });

  describe('yToMidi edge cases and pitch direction', () => {
    const notes = buildScaleNotes(0, 'major pentatonic', 3, 6);

    it('maps top of canvas (y = 0) to highest pitch', () => {
      expect(yToMidi(0, notes)).toBe(84); // C6
    });

    it('maps bottom of canvas (y = 1) to lowest pitch', () => {
      expect(yToMidi(1, notes)).toBe(48); // C3
    });

    it('clamps values out of bounds (y < 0 or y > 1)', () => {
      expect(yToMidi(-0.5, notes)).toBe(84);
      expect(yToMidi(1.5, notes)).toBe(48);
    });

    it('maps middle of canvas (y = 0.5) to midpoint note', () => {
      const mid = yToMidi(0.5, notes);
      const midIndex = Math.round(0.5 * (notes.length - 1));
      expect(mid).toBe(notes[midIndex]);
    });
  });

  describe('midi helper functions', () => {
    it('converts midi to note name correctly', () => {
      expect(midiToNoteName(48)).toBe('C3');
      expect(midiToNoteName(60)).toBe('C4');
      expect(midiToNoteName(69)).toBe('A4');
      expect(midiToNoteName(84)).toBe('C6');
    });

    it('converts midi to frequency correctly', () => {
      expect(midiToFreq(69)).toBeCloseTo(440, 2);
      expect(midiToFreq(57)).toBeCloseTo(220, 2);
    });

    it('identifies root notes across octaves', () => {
      expect(isRootNote(48, 0)).toBe(true);
      expect(isRootNote(60, 0)).toBe(true);
      expect(isRootNote(72, 0)).toBe(true);
      expect(isRootNote(84, 0)).toBe(true);

      expect(isRootNote(50, 0)).toBe(false); // D3
      expect(isRootNote(64, 0)).toBe(false); // E4
    });
  });
});
