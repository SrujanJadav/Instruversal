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

  describe('effectiveKey', () => {
    it('returns project key in linked mode even if track has its own key', async () => {
      const { effectiveKey } = await import('./scales');
      const track: any = { trackType: 'melodic', key: { root: 9, scale: 'minor pentatonic' } };
      const project: any = { keyMode: 'linked', rootNote: 0, scaleName: 'major pentatonic' };

      const key = effectiveKey(track, project);
      expect(key.root).toBe(0);
      expect(key.scale).toBe('major pentatonic');
    });

    it('returns track own key in perColour mode', async () => {
      const { effectiveKey } = await import('./scales');
      const track: any = { trackType: 'melodic', key: { root: 9, scale: 'minor pentatonic' } };
      const project: any = { keyMode: 'perColour', rootNote: 0, scaleName: 'major pentatonic' };

      const key = effectiveKey(track, project);
      expect(key.root).toBe(9);
      expect(key.scale).toBe('minor pentatonic');
    });

    it('falls back to project key in perColour mode if track has no key', async () => {
      const { effectiveKey } = await import('./scales');
      const track: any = { trackType: 'melodic', key: undefined };
      const project: any = { keyMode: 'perColour', rootNote: 2, scaleName: 'dorian' };

      const key = effectiveKey(track, project);
      expect(key.root).toBe(2);
      expect(key.scale).toBe('dorian');
    });

    it('returns project key for beat tracks', async () => {
      const { effectiveKey } = await import('./scales');
      const track: any = { trackType: 'beat', key: { root: 9, scale: 'blues' } };
      const project: any = { keyMode: 'perColour', rootNote: 5, scaleName: 'mixolydian' };

      const key = effectiveKey(track, project);
      expect(key.root).toBe(5);
      expect(key.scale).toBe('mixolydian');
    });
  });

  describe('Register window consistency', () => {
    it('ensures all 12 roots and 6 scales span exactly 3 octaves from 3rd to 6th octave', () => {
      const scaleNames = Object.keys(SCALES) as (keyof typeof SCALES)[];
      for (let root = 0; root < 12; root++) {
        for (const scale of scaleNames) {
          const notes = buildScaleNotes(root, scale, 3, 6);
          const lowest = notes[0];
          const highest = notes[notes.length - 1];

          // Lowest note should be in octave 3 (MIDI 48 to 59)
          expect(lowest).toBeGreaterThanOrEqual(48);
          expect(lowest).toBeLessThanOrEqual(59);

          // Highest note should be exactly 36 semitones (3 octaves) higher
          expect(highest).toBe(lowest + 36);

          // Notes should be strictly monotonically increasing
          for (let i = 1; i < notes.length; i++) {
            expect(notes[i]).toBeGreaterThan(notes[i - 1]);
          }
        }
      }
    });
  });

  describe('Pitch quantization fixture regression test', () => {
    it('preserves exact pitch mappings for standard Y positions in C major pentatonic', () => {
      const notes = buildScaleNotes(0, 'major pentatonic', 3, 6);

      // Verify exact fixture output
      expect(yToMidi(0.0, notes)).toBe(84); // Top edge -> C6
      expect(yToMidi(0.2, notes)).toBe(76); // Y=0.2 -> E5
      expect(yToMidi(0.4, notes)).toBe(69); // Y=0.4 -> A4
      expect(yToMidi(0.5, notes)).toBe(67); // Y=0.5 -> G4 (index 8)
      expect(yToMidi(0.8, notes)).toBe(55); // Y=0.8 -> G3 (index 3)
      expect(yToMidi(1.0, notes)).toBe(48); // Bottom edge -> C3
    });
  });

  describe('formatShortKeyLabel', () => {
    it('formats short labels cleanly', async () => {
      const { formatShortKeyLabel } = await import('./scales');
      expect(formatShortKeyLabel({ root: 9, scale: 'minor pentatonic' })).toBe('Am');
      expect(formatShortKeyLabel({ root: 0, scale: 'major pentatonic' })).toBe('C pent');
      expect(formatShortKeyLabel({ root: 2, scale: 'dorian' })).toBe('D dor');
      expect(formatShortKeyLabel({ root: 4, scale: 'major' })).toBe('E maj');
      expect(formatShortKeyLabel({ root: 7, scale: 'mixolydian' })).toBe('G mix');
      expect(formatShortKeyLabel({ root: 3, scale: 'natural minor' })).toBe('D# min');
    });
  });
});
