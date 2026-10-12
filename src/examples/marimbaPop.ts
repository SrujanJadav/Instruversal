import { ExampleSong } from './types';

export const MARIMBA_POP: ExampleSong = {
  id: 'example-marimba-pop',
  title: 'Marimba Pop (original)',
  credit: 'Original',
  licenseNote: 'original, MIT',
  bpm: 98,
  bars: 2,
  root: 9, // A
  scale: 'natural minor',
  keyMode: 'one-for-all',
  tracks: [
    {
      colorId: 'track-1',
      instrumentId: 'marimba',
      mode: 'notes',
      notes: [
        { midi: 69, startBeat: 0.0, durBeats: 0.5, velocity: 0.8 }, // A4
        { midi: 72, startBeat: 0.5, durBeats: 0.5, velocity: 0.8 }, // C5
        { midi: 76, startBeat: 1.5, durBeats: 0.5, velocity: 0.8 }, // E5
        { midi: 74, startBeat: 2.0, durBeats: 0.5, velocity: 0.8 }, // D5
        { midi: 72, startBeat: 3.0, durBeats: 0.5, velocity: 0.8 }, // C5
        { midi: 69, startBeat: 3.5, durBeats: 0.5, velocity: 0.8 }, // A4
        { midi: 67, startBeat: 4.0, durBeats: 0.5, velocity: 0.8 }, // G4
        { midi: 69, startBeat: 4.5, durBeats: 0.5, velocity: 0.8 }, // A4
        { midi: 72, startBeat: 5.5, durBeats: 0.5, velocity: 0.8 }, // C5
        { midi: 74, startBeat: 6.0, durBeats: 1.0, velocity: 0.8 }, // D5
        { midi: 72, startBeat: 7.0, durBeats: 0.5, velocity: 0.8 }, // C5
        { midi: 76, startBeat: 7.5, durBeats: 0.5, velocity: 0.8 }, // E5
      ],
    },
    {
      colorId: 'track-2',
      instrumentId: 'sub-bass',
      mode: 'flow',
      notes: [
        { midi: 45, startBeat: 0.0, durBeats: 1.5, velocity: 0.9 }, // A2
        { midi: 48, startBeat: 2.0, durBeats: 1.5, velocity: 0.9 }, // C3
        { midi: 43, startBeat: 4.0, durBeats: 1.5, velocity: 0.9 }, // G2
        { midi: 50, startBeat: 6.0, durBeats: 1.5, velocity: 0.9 }, // D3
      ],
    },
    {
      colorId: 'track-3',
      instrumentId: 'pluck',
      mode: 'beat',
      hits: [
        // Kicks
        { drum: 'kick', startBeat: 0.0, velocity: 0.9 },
        { drum: 'kick', startBeat: 2.5, velocity: 0.9 },
        { drum: 'kick', startBeat: 4.0, velocity: 0.9 },
        { drum: 'kick', startBeat: 6.5, velocity: 0.9 },

        // Claps
        { drum: 'clap', startBeat: 1.0, velocity: 0.85 },
        { drum: 'clap', startBeat: 3.0, velocity: 0.85 },
        { drum: 'clap', startBeat: 5.0, velocity: 0.85 },
        { drum: 'clap', startBeat: 7.0, velocity: 0.85 },

        // Closed hats (alternating 0.7 and 0.5, skipping 3.5 and 7.5)
        { drum: 'closed-hat', startBeat: 0.0, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 0.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 1.0, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 1.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 2.0, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 2.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 3.0, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 4.0, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 4.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 5.0, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 5.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 6.0, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 6.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 7.0, velocity: 0.7 },

        // Open hats
        { drum: 'open-hat', startBeat: 3.5, velocity: 0.6 },
        { drum: 'open-hat', startBeat: 7.5, velocity: 0.6 },
      ],
    },
  ],
};
