import { Creation, ProjectData } from '../library/types';
import { extractCreationMeta } from '../library/simplify';
import { Stroke } from '../state';
import { buildScaleNotes, ScaleName } from '../audio/scales';
import { DRUM_LANES, DrumSoundId } from '../audio/drums';

export interface ExampleMelodicNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
  velocity?: number;
}

export interface ExampleDrumHit {
  drum: DrumSoundId;
  startBeat: number;
  velocity?: number;
}

export interface ExampleTrackDef {
  id: string;
  name: string;
  trackType: 'melodic' | 'beat';
  instrumentId?: string;
  kitId?: '808' | 'lofi' | 'acoustic' | 'electro';
  mode?: 'notes' | 'flow' | 'hits';
  velocity?: number;
  notes?: ExampleMelodicNote[];
  hits?: ExampleDrumHit[];
  swing?: number;
  humanize?: number;
}

export interface ExampleSongDef {
  title: string;
  credit: string;
  licence: string;
  bpm: number;
  bars: number;
  timeSignature: [number, number];
  rootNote: number; // 1 = C#
  scaleName: ScaleName;
  tracks: ExampleTrackDef[];
}

export const SHAPE_OF_ME_EXAMPLE: ExampleSongDef = {
  title: 'Shape of Me',
  credit: 'Ed Sheeran (Cover)',
  licence: 'Cover / Pop Groove',
  bpm: 96,
  bars: 2,
  timeSignature: [4, 4],
  rootNote: 1, // C#
  scaleName: 'natural minor',
  tracks: [
    {
      id: 'track-1',
      name: 'Marimba',
      trackType: 'melodic',
      instrumentId: 'marimba',
      mode: 'notes',
      velocity: 0.85,
      notes: [
        // Group 1 (C#m — Bar 1, Beats 1–2): Steps 0, 3, 6
        { midi: 61, startBeat: 0.0, durationBeats: 0.5, velocity: 0.85 },  // Step 0: C#4
        { midi: 64, startBeat: 0.75, durationBeats: 0.5, velocity: 0.85 }, // Step 3: E4
        { midi: 61, startBeat: 1.5, durationBeats: 0.5, velocity: 0.85 },  // Step 6: C#4

        // Group 2 (F#m — Bar 1, Beats 3–4): Steps 8, 11, 14
        { midi: 61, startBeat: 2.0, durationBeats: 0.5, velocity: 0.85 },  // Step 8: C#4
        { midi: 64, startBeat: 2.75, durationBeats: 0.5, velocity: 0.85 }, // Step 11: E4
        { midi: 61, startBeat: 3.5, durationBeats: 0.5, velocity: 0.85 },  // Step 14: C#4

        // Group 3 (A — Bar 2, Beats 1–2): Steps 16, 19, 22
        { midi: 61, startBeat: 4.0, durationBeats: 0.5, velocity: 0.85 },  // Step 16: C#4
        { midi: 64, startBeat: 4.75, durationBeats: 0.5, velocity: 0.85 }, // Step 19: E4
        { midi: 61, startBeat: 5.5, durationBeats: 0.5, velocity: 0.85 },  // Step 22: C#4

        // Group 4 (B — Bar 2, Beats 3–4 Turnaround): Steps 24, 27, 30
        { midi: 63, startBeat: 6.0, durationBeats: 0.5, velocity: 0.85 },  // Step 24: D#4
        { midi: 61, startBeat: 6.75, durationBeats: 0.5, velocity: 0.85 }, // Step 27: C#4
        { midi: 59, startBeat: 7.5, durationBeats: 0.5, velocity: 0.85 },  // Step 30: B3
      ],
    },
    {
      id: 'track-2',
      name: 'Sub Bass',
      trackType: 'melodic',
      instrumentId: 'sub-bass',
      mode: 'notes',
      velocity: 0.9,
      notes: [
        // Group 1 (C#m): Steps 0, 3, 6 (C#3 in scale, sounds as C#2)
        { midi: 49, startBeat: 0.0, durationBeats: 0.5, velocity: 0.9 },   // Step 0: C#3
        { midi: 49, startBeat: 0.75, durationBeats: 0.5, velocity: 0.9 },  // Step 3: C#3
        { midi: 49, startBeat: 1.5, durationBeats: 0.5, velocity: 0.9 },   // Step 6: C#3

        // Group 2 (F#m): Steps 8, 11, 14 (F#3 in scale, sounds as F#2)
        { midi: 54, startBeat: 2.0, durationBeats: 0.5, velocity: 0.9 },   // Step 8: F#3
        { midi: 54, startBeat: 2.75, durationBeats: 0.5, velocity: 0.9 },  // Step 11: F#3
        { midi: 54, startBeat: 3.5, durationBeats: 0.5, velocity: 0.9 },   // Step 14: F#3

        // Group 3 (A): Steps 16, 19, 22 (A3 in scale, sounds as A2)
        { midi: 57, startBeat: 4.0, durationBeats: 0.5, velocity: 0.9 },   // Step 16: A3
        { midi: 57, startBeat: 4.75, durationBeats: 0.5, velocity: 0.9 },  // Step 19: A3
        { midi: 57, startBeat: 5.5, durationBeats: 0.5, velocity: 0.9 },   // Step 22: A3

        // Group 4 (B): Steps 24, 27, 30 (B3 in scale, sounds as B2)
        { midi: 59, startBeat: 6.0, durationBeats: 0.5, velocity: 0.9 },   // Step 24: B3
        { midi: 59, startBeat: 6.75, durationBeats: 0.5, velocity: 0.9 },  // Step 27: B3
        { midi: 59, startBeat: 7.5, durationBeats: 0.5, velocity: 0.9 },   // Step 30: B3
      ],
    },
    {
      id: 'track-3',
      name: 'Beat Track',
      trackType: 'beat',
      kitId: '808',
      mode: 'hits',
      hits: [
        // Kick Lane: Steps 0, 8, 16, 24
        { drum: 'kick', startBeat: 0.0, velocity: 0.92 },
        { drum: 'kick', startBeat: 2.0, velocity: 0.92 },
        { drum: 'kick', startBeat: 4.0, velocity: 0.92 },
        { drum: 'kick', startBeat: 6.0, velocity: 0.92 },

        // Rimshot / Clap / Snare Lane: Steps 3, 6, 11, 14, 19, 22, 27, 30
        { drum: 'clap', startBeat: 0.75, velocity: 0.85 },
        { drum: 'clap', startBeat: 1.5, velocity: 0.85 },
        { drum: 'clap', startBeat: 2.75, velocity: 0.85 },
        { drum: 'clap', startBeat: 3.5, velocity: 0.85 },
        { drum: 'clap', startBeat: 4.75, velocity: 0.85 },
        { drum: 'clap', startBeat: 5.5, velocity: 0.85 },
        { drum: 'clap', startBeat: 6.75, velocity: 0.85 },
        { drum: 'clap', startBeat: 7.5, velocity: 0.85 },

        // Closed Hi-Hat / Shaker Lane: Steps 2, 4, 10, 12, 18, 20, 26, 28
        { drum: 'closed-hat', startBeat: 0.5, velocity: 0.6 },
        { drum: 'closed-hat', startBeat: 1.0, velocity: 0.6 },
        { drum: 'closed-hat', startBeat: 2.5, velocity: 0.6 },
        { drum: 'closed-hat', startBeat: 3.0, velocity: 0.6 },
        { drum: 'closed-hat', startBeat: 4.5, velocity: 0.6 },
        { drum: 'closed-hat', startBeat: 5.0, velocity: 0.6 },
        { drum: 'closed-hat', startBeat: 6.5, velocity: 0.6 },
        { drum: 'closed-hat', startBeat: 7.0, velocity: 0.6 },
      ],
    },
  ],
};

export function convertExampleSongToProject(example: ExampleSongDef): ProjectData {
  const totalBeats = example.bars * 4;
  const total16thSteps = example.bars * 16;
  const scaleNotes = buildScaleNotes(example.rootNote, example.scaleName, 3, 6);
  const strokes: Stroke[] = [];

  for (const track of example.tracks) {
    if (track.trackType === 'beat' && track.hits) {
      track.hits.forEach((hit, idx) => {
        const laneIndex = DRUM_LANES.findIndex((lane) => lane.id === hit.drum);
        const activeLane = laneIndex >= 0 ? laneIndex : 7;
        const normY = (activeLane + 0.5) / 8;
        const normX = hit.startBeat / totalBeats;

        strokes.push({
          id: `${track.id}_hit_${hit.drum}_${idx}_${hit.startBeat}`,
          trackId: track.id,
          points: [
            { x: normX, y: normY, t: 0 },
            { x: normX + 0.0005, y: normY, t: 10 },
          ],
          width: Math.max(1.5, Math.min(4.5, (hit.velocity ?? 0.8) * 4)),
        });
      });
    } else if (track.trackType === 'melodic' && track.notes) {
      track.notes.forEach((note, idx) => {
        const noteIndex = scaleNotes.indexOf(note.midi);
        const safeIndex = noteIndex >= 0 ? noteIndex : 0;
        const normY = 1 - safeIndex / (scaleNotes.length - 1);
        const stepIndex = Math.round(note.startBeat * 4);
        const stepX = (stepIndex + 0.5) / total16thSteps;

        strokes.push({
          id: `${track.id}_note_${note.midi}_${idx}`,
          trackId: track.id,
          points: [
            { x: Math.max(0, stepX - 0.009), y: normY, t: 0 },
            { x: Math.min(1, stepX + 0.009), y: normY, t: 25 },
          ],
          width: Math.max(1.5, Math.min(4.5, (note.velocity ?? 0.8) * 4)),
        });
      });
    }
  }

  return {
    version: 3,
    bpm: example.bpm,
    bars: example.bars,
    rootNote: example.rootNote,
    scaleName: example.scaleName,
    keyMode: 'linked',
    playbackMode: 'notes',
    glide: 20,
    tracks: [
      {
        id: 'track-1',
        name: 'Vermilion',
        trackType: 'melodic',
        instrumentId: 'marimba',
        kitId: '808',
        volume: 0.85,
        muted: false,
        solo: false,
        beatRate: '1/16',
        swing: 0,
        humanize: 0,
        beatMode: 'hits',
        beatFlowStyle: 'glide',
        beatRollVoice: 'snare',
        beatSweepCharacter: 'hat',
      },
      {
        id: 'track-2',
        name: 'Indigo',
        trackType: 'melodic',
        instrumentId: 'sub-bass',
        kitId: '808',
        volume: 0.85,
        muted: false,
        solo: false,
        beatRate: '1/16',
        swing: 0,
        humanize: 0,
        beatMode: 'hits',
        beatFlowStyle: 'glide',
        beatRollVoice: 'snare',
        beatSweepCharacter: 'hat',
      },
      {
        id: 'track-3',
        name: 'Ochre',
        trackType: 'beat',
        instrumentId: 'pluck',
        kitId: '808',
        volume: 0.85,
        muted: false,
        solo: false,
        beatRate: '1/16',
        swing: 0,
        humanize: 0,
        beatMode: 'hits',
        beatFlowStyle: 'glide',
        beatRollVoice: 'snare',
        beatSweepCharacter: 'hat',
      },
      {
        id: 'track-4',
        name: 'Sage',
        trackType: 'melodic',
        instrumentId: 'soft-pad',
        kitId: '808',
        volume: 0.85,
        muted: false,
        solo: false,
        beatRate: '1/16',
        swing: 0,
        humanize: 0,
        beatMode: 'hits',
        beatFlowStyle: 'glide',
        beatRollVoice: 'snare',
        beatSweepCharacter: 'hat',
      },
      {
        id: 'track-5',
        name: 'Plum',
        trackType: 'melodic',
        instrumentId: 'warm-keys',
        kitId: '808',
        volume: 0.85,
        muted: false,
        solo: false,
        beatRate: '1/16',
        swing: 0,
        humanize: 0,
        beatMode: 'hits',
        beatFlowStyle: 'glide',
        beatRollVoice: 'snare',
        beatSweepCharacter: 'hat',
      },
      {
        id: 'track-6',
        name: 'Slate',
        trackType: 'melodic',
        instrumentId: 'kalimba',
        kitId: '808',
        volume: 0.85,
        muted: false,
        solo: false,
        beatRate: '1/16',
        swing: 0,
        humanize: 0,
        beatMode: 'hits',
        beatFlowStyle: 'glide',
        beatRollVoice: 'snare',
        beatSweepCharacter: 'hat',
      },
    ],
    strokes,
    fx: {
      reverb: { amount: 16, size: 2.0, bypassed: false },
      delay: { amount: 10, time: '8n', bypassed: false },
      chorus: { amount: 0, depth: 0.5, bypassed: true },
      phaser: { amount: 0, speed: 0.5, bypassed: true },
      tremolo: { amount: 0, rate: '8n', bypassed: true },
      autoFilter: { amount: 0, speed: '2m', bypassed: true },
      drive: { amount: 0, tone: 4000, bypassed: true },
    },
  };
}

export const SHAPE_OF_ME_PROJECT: ProjectData = convertExampleSongToProject(SHAPE_OF_ME_EXAMPLE);

export const SHAPE_OF_ME_CREATION: Creation = {
  id: 'shape-of-me',
  title: 'Shape of Me',
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
  schemaVersion: 2,
  project: SHAPE_OF_ME_PROJECT,
  preview: extractCreationMeta({
    id: 'shape-of-me',
    title: 'Shape of Me',
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    schemaVersion: 2,
    project: SHAPE_OF_ME_PROJECT,
  }),
};
