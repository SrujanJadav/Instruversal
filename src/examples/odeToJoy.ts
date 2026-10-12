import { ExampleSong } from './types';

export const ODE_TO_JOY: ExampleSong = {
  id: 'example-ode-to-joy',
  title: 'Ode to Joy',
  credit: 'Ludwig van Beethoven (arr. Instruversal)',
  licenseNote: 'Public Domain',
  bpm: 100,
  bars: 4,
  root: 0, // C
  scale: 'major',
  keyMode: 'one-for-all',
  tracks: [
    {
      colorId: 'track-1',
      instrumentId: 'marimba',
      mode: 'flow',
      notes: [
        { midi: 64, startBeat: 0, durBeats: 1, velocity: 0.85 },   // E4
        { midi: 64, startBeat: 1, durBeats: 1, velocity: 0.85 },   // E4
        { midi: 65, startBeat: 2, durBeats: 1, velocity: 0.85 },   // F4
        { midi: 67, startBeat: 3, durBeats: 1, velocity: 0.85 },   // G4
        { midi: 67, startBeat: 4, durBeats: 1, velocity: 0.85 },   // G4
        { midi: 65, startBeat: 5, durBeats: 1, velocity: 0.85 },   // F4
        { midi: 64, startBeat: 6, durBeats: 1, velocity: 0.85 },   // E4
        { midi: 62, startBeat: 7, durBeats: 1, velocity: 0.85 },   // D4
        { midi: 60, startBeat: 8, durBeats: 1, velocity: 0.85 },   // C4
        { midi: 60, startBeat: 9, durBeats: 1, velocity: 0.85 },   // C4
        { midi: 62, startBeat: 10, durBeats: 1, velocity: 0.85 },  // D4
        { midi: 64, startBeat: 11, durBeats: 1, velocity: 0.85 },  // E4
        { midi: 64, startBeat: 12, durBeats: 1.5, velocity: 0.85 },// E4
        { midi: 62, startBeat: 13.5, durBeats: 0.5, velocity: 0.8 }, // D4
        { midi: 62, startBeat: 14, durBeats: 2, velocity: 0.85 },  // D4
      ],
    },
    {
      colorId: 'track-2',
      instrumentId: 'sub-bass',
      mode: 'flow',
      notes: [
        { midi: 48, startBeat: 0, durBeats: 3, velocity: 0.9 },   // C3 (sub bass sounds as C2)
        { midi: 55, startBeat: 4, durBeats: 3, velocity: 0.9 },   // G3 (sub bass sounds as G2)
        { midi: 48, startBeat: 8, durBeats: 3, velocity: 0.9 },   // C3
        { midi: 55, startBeat: 12, durBeats: 3, velocity: 0.9 },  // G3
      ],
    },
  ],
};
