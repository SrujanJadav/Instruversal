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
  rootNote: number; // 9 = A
  scaleName: ScaleName;
  tracks: ExampleTrackDef[];
}

export const MARIMBA_POP_EXAMPLE: ExampleSongDef = {
  title: 'Marimba Pop (original)',
  credit: 'Original',
  licence: 'original, MIT',
  bpm: 98,
  bars: 2,
  timeSignature: [4, 4],
  rootNote: 9, // A
  scaleName: 'natural minor',
  tracks: [
    {
      id: 'track-1',
      name: 'Marimba',
      trackType: 'melodic',
      instrumentId: 'marimba',
      mode: 'notes',
      velocity: 0.8,
      notes: [
        { midi: 69, startBeat: 0, durationBeats: 0.5, velocity: 0.8 }, // A4 at 0 (0.5 beat)
        { midi: 72, startBeat: 0.5, durationBeats: 0.5, velocity: 0.8 }, // C5 at 0.5 (0.5)
        { midi: 76, startBeat: 1.5, durationBeats: 0.5, velocity: 0.8 }, // E5 at 1.5 (0.5)
        { midi: 74, startBeat: 2, durationBeats: 0.5, velocity: 0.8 }, // D5 at 2 (0.5)
        { midi: 72, startBeat: 3, durationBeats: 0.5, velocity: 0.8 }, // C5 at 3 (0.5)
        { midi: 69, startBeat: 3.5, durationBeats: 0.5, velocity: 0.8 }, // A4 at 3.5 (0.5)
        { midi: 67, startBeat: 4, durationBeats: 0.5, velocity: 0.8 }, // G4 at 4 (0.5)
        { midi: 69, startBeat: 4.5, durationBeats: 0.5, velocity: 0.8 }, // A4 at 4.5 (0.5)
        { midi: 72, startBeat: 5.5, durationBeats: 0.5, velocity: 0.8 }, // C5 at 5.5 (0.5)
        { midi: 74, startBeat: 6, durationBeats: 1.0, velocity: 0.8 }, // D5 at 6 (1)
        { midi: 72, startBeat: 7, durationBeats: 0.5, velocity: 0.8 }, // C5 at 7 (0.5)
        { midi: 76, startBeat: 7.5, durationBeats: 0.5, velocity: 0.8 }, // E5 at 7.5 (0.5)
      ],
    },
    {
      id: 'track-2',
      name: 'Sub Bass',
      trackType: 'melodic',
      instrumentId: 'sub-bass',
      mode: 'flow',
      velocity: 0.9,
      notes: [
        { midi: 45, startBeat: 0, durationBeats: 1.5, velocity: 0.9 }, // A2 at 0 (1.5 beats)
        { midi: 48, startBeat: 2, durationBeats: 1.5, velocity: 0.9 }, // C3 at 2 (1.5)
        { midi: 43, startBeat: 4, durationBeats: 1.5, velocity: 0.9 }, // G2 at 4 (1.5)
        { midi: 50, startBeat: 6, durationBeats: 1.5, velocity: 0.9 }, // D3 at 6 (1.5)
      ],
    },
    {
      id: 'track-3',
      name: 'Beat Track',
      trackType: 'beat',
      kitId: '808',
      mode: 'hits',
      hits: [
        // Kick at 0, 2.5, 4, 6.5 (velocity 0.9)
        { drum: 'kick', startBeat: 0, velocity: 0.9 },
        { drum: 'kick', startBeat: 2.5, velocity: 0.9 },
        { drum: 'kick', startBeat: 4, velocity: 0.9 },
        { drum: 'kick', startBeat: 6.5, velocity: 0.9 },
        // Clap at 1, 3, 5, 7 (velocity 0.85)
        { drum: 'clap', startBeat: 1, velocity: 0.85 },
        { drum: 'clap', startBeat: 3, velocity: 0.85 },
        { drum: 'clap', startBeat: 5, velocity: 0.85 },
        { drum: 'clap', startBeat: 7, velocity: 0.85 },
        // Closed hat every half beat from 0 to 7.5 except at 3.5 and 7.5, alternating velocity 0.7 and 0.5
        { drum: 'closed-hat', startBeat: 0, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 0.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 1, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 1.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 2, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 2.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 3, velocity: 0.7 },
        // (open hat at 3.5)
        { drum: 'closed-hat', startBeat: 4, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 4.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 5, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 5.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 6, velocity: 0.7 },
        { drum: 'closed-hat', startBeat: 6.5, velocity: 0.5 },
        { drum: 'closed-hat', startBeat: 7, velocity: 0.7 },
        // (open hat at 7.5)
        // Open hat at 3.5 and 7.5 (velocity 0.6)
        { drum: 'open-hat', startBeat: 3.5, velocity: 0.6 },
        { drum: 'open-hat', startBeat: 7.5, velocity: 0.6 },
      ],
    },
  ],
};

/**
 * Pure converter: translates high-level example song definition
 * into canvas strokes and serialized project state with exact timing & pitch coordinates.
 */
export function convertExampleSongToProject(example: ExampleSongDef): ProjectData {
  const totalBeats = example.bars * 4;
  const total16thSteps = example.bars * 16;
  const scaleNotes = buildScaleNotes(example.rootNote, example.scaleName, 1, 6);
  const strokes: Stroke[] = [];

  for (const track of example.tracks) {
    if (track.trackType === 'beat' && track.hits) {
      // Beat track: convert each hit into a tap stroke in the correct drum lane at exact x position
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
            { x: normX + 0.0008, y: normY, t: 15 },
          ],
          width: Math.max(1.0, Math.min(5.0, ((hit.velocity ?? 0.8) - 0.65) * 16)),
        });
      });
    } else if (track.trackType === 'melodic' && track.notes) {
      if (track.mode === 'flow') {
        // Continuous flow mode strokes
        track.notes.forEach((note, idx) => {
          const noteIndex = scaleNotes.indexOf(note.midi);
          const safeIndex = noteIndex >= 0 ? noteIndex : 0;
          const normY = 1 - safeIndex / (scaleNotes.length - 1);
          const startX = note.startBeat / totalBeats;
          const endX = (note.startBeat + note.durationBeats) / totalBeats;

          strokes.push({
            id: `${track.id}_flow_${note.midi}_${idx}`,
            trackId: track.id,
            points: [
              { x: startX, y: normY, t: 0 },
              { x: startX + (endX - startX) * 0.33, y: normY + 0.0006, t: 50 },
              { x: startX + (endX - startX) * 0.67, y: normY - 0.0006, t: 100 },
              { x: endX, y: normY, t: 150 },
            ],
            width: Math.max(1.5, Math.min(5.0, ((note.velocity ?? 0.8) - 0.55) * 16)),
          });
        });
      } else {
        // Notes mode strokes (stepped 16th grid notes)
        track.notes.forEach((note, idx) => {
          const noteIndex = scaleNotes.indexOf(note.midi);
          const safeIndex = noteIndex >= 0 ? noteIndex : 0;
          const normY = 1 - safeIndex / (scaleNotes.length - 1);
          const s = note.startBeat * 4;

          const x0 = (s + 0.2) / total16thSteps;
          const x1 = (s + 0.5) / total16thSteps;
          const x2 = (s + 0.8) / total16thSteps;

          strokes.push({
            id: `${track.id}_note_${note.midi}_${idx}`,
            trackId: track.id,
            points: [
              { x: x0, y: normY, t: 0 },
              { x: x1, y: normY - 0.001, t: 25 },
              { x: x2, y: normY, t: 50 },
            ],
            width: Math.max(1.5, Math.min(5.0, ((note.velocity ?? 0.8) - 0.55) * 16)),
          });
        });
      }
    }
  }

  return {
    version: 2,
    bpm: example.bpm,
    bars: example.bars,
    rootNote: example.rootNote,
    scaleName: example.scaleName,
    keyMode: 'linked',
    playbackMode: 'flow',
    glide: 20,
    tracks: [
      {
        id: 'track-1',
        name: 'Marimba',
        trackType: 'melodic',
        instrumentId: 'marimba',
        kitId: '808',
        volume: 0.8,
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
        name: 'Sub Bass',
        trackType: 'melodic',
        instrumentId: 'sub-bass',
        kitId: '808',
        volume: 0.9,
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
        name: 'Beat Track',
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
        volume: 0.7,
        muted: true,
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
        volume: 0.7,
        muted: true,
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
        volume: 0.7,
        muted: true,
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

export const MARIMBA_POP_PROJECT: ProjectData = convertExampleSongToProject(MARIMBA_POP_EXAMPLE);

export const MARIMBA_POP_CREATION: Creation = {
  id: 'marimba-pop-original',
  title: 'Marimba Pop (original)',
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
  schemaVersion: 2,
  project: MARIMBA_POP_PROJECT,
  preview: extractCreationMeta({
    id: 'marimba-pop-original',
    title: 'Marimba Pop (original)',
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    schemaVersion: 2,
    project: MARIMBA_POP_PROJECT,
  }),
};
