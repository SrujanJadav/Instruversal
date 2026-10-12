import { ExampleSong } from './types';

export const DREAMY_ARPEGGIO: ExampleSong = {
  id: 'example-dreamy-arpeggio',
  title: 'Dreamy Arpeggio',
  credit: 'Original Composition',
  licenseNote: 'Original / MIT',
  bpm: 84,
  bars: 4,
  root: 0, // C
  scale: 'major',
  keyMode: 'one-for-all',
  tracks: [
    {
      colorId: 'track-5', // Plum / Warm Keys
      instrumentId: 'warm-keys',
      mode: 'flow',
      notes: [
        // Bar 1: I (C major: C4, E4, G4, C5)
        { midi: 60, startBeat: 0.0, durBeats: 0.5, velocity: 0.75 }, // C4
        { midi: 64, startBeat: 0.5, durBeats: 0.5, velocity: 0.78 }, // E4
        { midi: 67, startBeat: 1.0, durBeats: 0.5, velocity: 0.82 }, // G4
        { midi: 72, startBeat: 1.5, durBeats: 0.5, velocity: 0.85 }, // C5
        { midi: 67, startBeat: 2.0, durBeats: 0.5, velocity: 0.78 }, // G4
        { midi: 64, startBeat: 2.5, durBeats: 0.5, velocity: 0.75 }, // E4
        { midi: 67, startBeat: 3.0, durBeats: 0.5, velocity: 0.80 }, // G4
        { midi: 64, startBeat: 3.5, durBeats: 0.5, velocity: 0.72 }, // E4

        // Bar 2: V (G major: B3, D4, G4, D5)
        { midi: 59, startBeat: 4.0, durBeats: 0.5, velocity: 0.75 }, // B3
        { midi: 62, startBeat: 4.5, durBeats: 0.5, velocity: 0.78 }, // D4
        { midi: 67, startBeat: 5.0, durBeats: 0.5, velocity: 0.82 }, // G4
        { midi: 74, startBeat: 5.5, durBeats: 0.5, velocity: 0.85 }, // D5
        { midi: 67, startBeat: 6.0, durBeats: 0.5, velocity: 0.78 }, // G4
        { midi: 62, startBeat: 6.5, durBeats: 0.5, velocity: 0.75 }, // D4
        { midi: 67, startBeat: 7.0, durBeats: 0.5, velocity: 0.80 }, // G4
        { midi: 62, startBeat: 7.5, durBeats: 0.5, velocity: 0.72 }, // D4

        // Bar 3: vi (A minor: A3, C4, E4, A4)
        { midi: 57, startBeat: 8.0, durBeats: 0.5, velocity: 0.75 }, // A3
        { midi: 60, startBeat: 8.5, durBeats: 0.5, velocity: 0.78 }, // C4
        { midi: 64, startBeat: 9.0, durBeats: 0.5, velocity: 0.82 }, // E4
        { midi: 69, startBeat: 9.5, durBeats: 0.5, velocity: 0.85 }, // A4
        { midi: 64, startBeat: 10.0, durBeats: 0.5, velocity: 0.78 }, // E4
        { midi: 60, startBeat: 10.5, durBeats: 0.5, velocity: 0.75 }, // C4
        { midi: 64, startBeat: 11.0, durBeats: 0.5, velocity: 0.80 }, // E4
        { midi: 60, startBeat: 11.5, durBeats: 0.5, velocity: 0.72 }, // C4

        // Bar 4: IV (F major: F3, A3, C4, F4)
        { midi: 53, startBeat: 12.0, durBeats: 0.5, velocity: 0.75 }, // F3
        { midi: 57, startBeat: 12.5, durBeats: 0.5, velocity: 0.78 }, // A3
        { midi: 60, startBeat: 13.0, durBeats: 0.5, velocity: 0.82 }, // C4
        { midi: 65, startBeat: 13.5, durBeats: 0.5, velocity: 0.85 }, // F4
        { midi: 60, startBeat: 14.0, durBeats: 0.5, velocity: 0.78 }, // C4
        { midi: 57, startBeat: 14.5, durBeats: 0.5, velocity: 0.75 }, // A3
        { midi: 60, startBeat: 15.0, durBeats: 0.5, velocity: 0.80 }, // C4
        { midi: 57, startBeat: 15.5, durBeats: 0.5, velocity: 0.72 }, // A3
      ],
    },
    {
      colorId: 'track-4', // Sage / Soft Pad
      instrumentId: 'soft-pad',
      mode: 'flow',
      notes: [
        { midi: 48, startBeat: 0.0, durBeats: 3.8, velocity: 0.70 },  // C3
        { midi: 55, startBeat: 4.0, durBeats: 3.8, velocity: 0.70 },  // G3
        { midi: 57, startBeat: 8.0, durBeats: 3.8, velocity: 0.70 },  // A3
        { midi: 53, startBeat: 12.0, durBeats: 3.8, velocity: 0.70 }, // F3
      ],
    },
  ],
};
