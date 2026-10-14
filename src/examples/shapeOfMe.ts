import { ExampleSong } from './types';

export const SHAPE_OF_ME: ExampleSong = {
  id: 'example-shape-of-me',
  title: 'Shape of Me',
  credit: 'Ed Sheeran (Cover)',
  licenseNote: 'Cover / Pop Groove',
  bpm: 96,
  bars: 2,
  root: 1, // C# / Db
  scale: 'natural minor',
  playbackMode: 'notes',
  keyMode: 'one-for-all',
  tracks: [
    {
      colorId: 'track-1',
      instrumentId: 'marimba',
      mode: 'notes',
      notes: [
        // Group 1 (C#m — Bar 1, Beats 1–2): Steps 0, 3, 6
        { midi: 61, startBeat: 0.0, durBeats: 0.5, velocity: 0.85 },  // Step 0: C#4
        { midi: 64, startBeat: 0.75, durBeats: 0.5, velocity: 0.85 }, // Step 3: E4
        { midi: 61, startBeat: 1.5, durBeats: 0.5, velocity: 0.85 },  // Step 6: C#4

        // Group 2 (F#m — Bar 1, Beats 3–4): Steps 8, 11, 14
        { midi: 61, startBeat: 2.0, durBeats: 0.5, velocity: 0.85 },  // Step 8: C#4
        { midi: 64, startBeat: 2.75, durBeats: 0.5, velocity: 0.85 }, // Step 11: E4
        { midi: 61, startBeat: 3.5, durBeats: 0.5, velocity: 0.85 },  // Step 14: C#4

        // Group 3 (A — Bar 2, Beats 1–2): Steps 16, 19, 22
        { midi: 61, startBeat: 4.0, durBeats: 0.5, velocity: 0.85 },  // Step 16: C#4
        { midi: 64, startBeat: 4.75, durBeats: 0.5, velocity: 0.85 }, // Step 19: E4
        { midi: 61, startBeat: 5.5, durBeats: 0.5, velocity: 0.85 },  // Step 22: C#4

        // Group 4 (B — Bar 2, Beats 3–4 Turnaround): Steps 24, 27, 30
        { midi: 63, startBeat: 6.0, durBeats: 0.5, velocity: 0.85 },  // Step 24: D#4
        { midi: 61, startBeat: 6.75, durBeats: 0.5, velocity: 0.85 }, // Step 27: C#4
        { midi: 59, startBeat: 7.5, durBeats: 0.5, velocity: 0.85 },  // Step 30: B3
      ],
    },
    {
      colorId: 'track-2',
      instrumentId: 'sub-bass',
      mode: 'notes',
      notes: [
        // Group 1 (C#m): Steps 0, 3, 6 (C#3 in scale, sounds as C#2 via sub-bass octave drop)
        { midi: 49, startBeat: 0.0, durBeats: 0.5, velocity: 0.9 },   // Step 0: C#3
        { midi: 49, startBeat: 0.75, durBeats: 0.5, velocity: 0.9 },  // Step 3: C#3
        { midi: 49, startBeat: 1.5, durBeats: 0.5, velocity: 0.9 },   // Step 6: C#3

        // Group 2 (F#m): Steps 8, 11, 14 (F#3 in scale, sounds as F#2)
        { midi: 54, startBeat: 2.0, durBeats: 0.5, velocity: 0.9 },   // Step 8: F#3
        { midi: 54, startBeat: 2.75, durBeats: 0.5, velocity: 0.9 },  // Step 11: F#3
        { midi: 54, startBeat: 3.5, durBeats: 0.5, velocity: 0.9 },   // Step 14: F#3

        // Group 3 (A): Steps 16, 19, 22 (A3 in scale, sounds as A2)
        { midi: 57, startBeat: 4.0, durBeats: 0.5, velocity: 0.9 },   // Step 16: A3
        { midi: 57, startBeat: 4.75, durBeats: 0.5, velocity: 0.9 },  // Step 19: A3
        { midi: 57, startBeat: 5.5, durBeats: 0.5, velocity: 0.9 },   // Step 22: A3

        // Group 4 (B): Steps 24, 27, 30 (B3 in scale, sounds as B2)
        { midi: 59, startBeat: 6.0, durBeats: 0.5, velocity: 0.9 },   // Step 24: B3
        { midi: 59, startBeat: 6.75, durBeats: 0.5, velocity: 0.9 },  // Step 27: B3
        { midi: 59, startBeat: 7.5, durBeats: 0.5, velocity: 0.9 },   // Step 30: B3
      ],
    },
    {
      colorId: 'track-3',
      instrumentId: 'pluck',
      mode: 'beat',
      hits: [
        // Kick Lane: Steps 0, 8, 16, 24 (beats 1 and 3 of each bar)
        { drum: 'kick', startBeat: 0.0, velocity: 0.92 },  // Step 0
        { drum: 'kick', startBeat: 2.0, velocity: 0.92 },  // Step 8
        { drum: 'kick', startBeat: 4.0, velocity: 0.92 },  // Step 16
        { drum: 'kick', startBeat: 6.0, velocity: 0.92 },  // Step 24

        // Rimshot / Clap / Snare Lane: Steps 3, 6, 11, 14, 19, 22, 27, 30 (tresillo marimba bounce)
        { drum: 'clap', startBeat: 0.75, velocity: 0.85 }, // Step 3
        { drum: 'clap', startBeat: 1.5, velocity: 0.85 },  // Step 6
        { drum: 'clap', startBeat: 2.75, velocity: 0.85 }, // Step 11
        { drum: 'clap', startBeat: 3.5, velocity: 0.85 },  // Step 14
        { drum: 'clap', startBeat: 4.75, velocity: 0.85 }, // Step 19
        { drum: 'clap', startBeat: 5.5, velocity: 0.85 },  // Step 22
        { drum: 'clap', startBeat: 6.75, velocity: 0.85 }, // Step 27
        { drum: 'clap', startBeat: 7.5, velocity: 0.85 },  // Step 30

        // Closed Hi-Hat / Shaker Lane: Steps 2, 4, 10, 12, 18, 20, 26, 28 (forward momentum)
        { drum: 'closed-hat', startBeat: 0.5, velocity: 0.6 },  // Step 2
        { drum: 'closed-hat', startBeat: 1.0, velocity: 0.6 },  // Step 4
        { drum: 'closed-hat', startBeat: 2.5, velocity: 0.6 },  // Step 10
        { drum: 'closed-hat', startBeat: 3.0, velocity: 0.6 },  // Step 12
        { drum: 'closed-hat', startBeat: 4.5, velocity: 0.6 },  // Step 18
        { drum: 'closed-hat', startBeat: 5.0, velocity: 0.6 },  // Step 20
        { drum: 'closed-hat', startBeat: 6.5, velocity: 0.6 },  // Step 26
        { drum: 'closed-hat', startBeat: 7.0, velocity: 0.6 },  // Step 28
      ],
    },
  ],
};
