export const SCALES = {
  'major pentatonic': [0, 2, 4, 7, 9],
  'minor pentatonic': [0, 3, 5, 7, 10],
  'major': [0, 2, 4, 5, 7, 9, 11],
  'natural minor': [0, 2, 3, 5, 7, 8, 10],
  'dorian': [0, 2, 3, 5, 7, 9, 10],
  'mixolydian': [0, 2, 4, 5, 7, 9, 10],
} as const;

export type ScaleName = keyof typeof SCALES;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * Builds an array of MIDI note numbers for a given root pitch class (0 = C, 1 = C#, ..., 11 = B),
 * scale name, and octave range inclusive of the top root note.
 */
export function buildScaleNotes(
  root: number = 0,
  scaleName: ScaleName = 'major pentatonic',
  lowOctave: number = 3,
  highOctave: number = 6
): number[] {
  const intervals = SCALES[scaleName];
  if (!intervals) {
    throw new Error(`Unknown scale name: ${scaleName}`);
  }

  const notes: number[] = [];
  const normalizedRoot = ((root % 12) + 12) % 12;

  for (let octave = lowOctave; octave < highOctave; octave++) {
    const octaveBase = (octave + 1) * 12 + normalizedRoot;
    for (const interval of intervals) {
      notes.push(octaveBase + interval);
    }
  }

  // Include the top octave root note (e.g. C6) to cleanly cap the range
  notes.push((highOctave + 1) * 12 + normalizedRoot);

  return notes;
}

/**
 * Converts normalized Y (0 at top, 1 at bottom) to the nearest MIDI note from the scale.
 * Top of canvas (y = 0) = highest pitch.
 * Bottom of canvas (y = 1) = lowest pitch.
 */
export function yToMidi(yNormalized: number, notes: number[]): number {
  if (!notes || notes.length === 0) {
    throw new Error('notes array must not be empty');
  }
  if (notes.length === 1) {
    return notes[0];
  }

  // Clamp normalized Y to [0, 1]
  const clampedY = Math.max(0, Math.min(1, yNormalized));

  // Invert so 0 (top) is maximum pitch (index notes.length - 1)
  // and 1 (bottom) is minimum pitch (index 0)
  const pitchProgress = 1 - clampedY;
  const targetIndex = Math.round(pitchProgress * (notes.length - 1));

  return notes[targetIndex];
}

/**
 * Converts a MIDI note number to its frequency in Hertz (A4 = 440Hz).
 */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Converts a MIDI note number to human-readable note name (e.g. 60 -> "C4").
 */
export function midiToNoteName(midi: number): string {
  const normalizedMidi = Math.round(midi);
  const pitchClass = ((normalizedMidi % 12) + 12) % 12;
  const octave = Math.floor(normalizedMidi / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

/**
 * Returns true if a given MIDI note is a root note of the scale.
 */
export function isRootNote(midi: number, root: number = 0): boolean {
  const normalizedMidi = ((Math.round(midi) % 12) + 12) % 12;
  const normalizedRoot = ((root % 12) + 12) % 12;
  return normalizedMidi === normalizedRoot;
}
