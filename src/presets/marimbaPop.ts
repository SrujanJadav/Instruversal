import { Creation, ProjectData } from '../library/types';
import { extractCreationMeta } from '../library/simplify';
import { Stroke } from '../state';
import { buildScaleNotes, ScaleName } from '../audio/scales';
import { DRUM_LANES, DrumSoundId } from '../audio/drums';

export interface ExampleMelodicNote {
  pitch: number;
  startBeat: number;
  duration: number;
  velocity?: number;
}

export interface ExampleDrumHit {
  drum: string; // 'kick' | 'closedHat' | 'openHat' | 'clap' | etc.
  startBeat: number;
  velocity?: number;
}

export interface ExampleTrackDef {
  id: number | string;
  name: string;
  mode: 'Notes' | 'Flow' | 'Hits';
  sound?: string;
  kit?: string;
  defaultVelocity?: number;
  notes?: ExampleMelodicNote[];
  hits?: ExampleDrumHit[];
}

export interface ExampleSongDef {
  project: {
    title: string;
    credit: string;
    licence: string;
    tempoBpm: number;
    timeSignature: string;
    lengthBars: number;
    root: string;
    scale: string;
    timelineBeats: number;
    startBeat: number;
    msPerBeat: number;
    startTimeMsFormula: string;
  };
  tracks: ExampleTrackDef[];
}

export const MARIMBA_POP_SPEC: ExampleSongDef = {
  project: {
    title: "Marimba Pop",
    credit: "Original",
    licence: "original, MIT",
    tempoBpm: 98,
    timeSignature: "4/4",
    lengthBars: 2,
    root: "F#",
    scale: "F# natural minor",
    timelineBeats: 8,
    startBeat: 0,
    msPerBeat: 612.2448979591837,
    startTimeMsFormula: "startBeat * 60000 / 98"
  },
  tracks: [
    {
      id: 1,
      name: "Warm Pluck / Marimba",
      mode: "Notes",
      sound: "Soft, rounded marimba or muted pluck; short decay; warm tone; subtle stereo width",
      defaultVelocity: 0.8,
      notes: [
        { pitch: 66, startBeat: 0.00, duration: 0.50, velocity: 0.8 },
        { pitch: 69, startBeat: 0.75, duration: 0.25, velocity: 0.8 },
        { pitch: 73, startBeat: 1.25, duration: 0.50, velocity: 0.8 },
        { pitch: 71, startBeat: 2.00, duration: 0.50, velocity: 0.8 },
        { pitch: 69, startBeat: 2.75, duration: 0.25, velocity: 0.8 },
        { pitch: 64, startBeat: 3.50, duration: 0.25, velocity: 0.8 },
        { pitch: 66, startBeat: 4.00, duration: 0.50, velocity: 0.8 },
        { pitch: 69, startBeat: 4.75, duration: 0.25, velocity: 0.8 },
        { pitch: 73, startBeat: 5.25, duration: 0.50, velocity: 0.8 },
        { pitch: 71, startBeat: 6.00, duration: 0.25, velocity: 0.8 },
        { pitch: 69, startBeat: 6.50, duration: 0.25, velocity: 0.8 },
        { pitch: 66, startBeat: 7.00, duration: 1.00, velocity: 0.8 }
      ]
    },
    {
      id: 2,
      name: "Deep Sub Bass",
      mode: "Flow",
      sound: "Round, deep sub-bass with tight releases; locks with the kick",
      defaultVelocity: 0.9,
      notes: [
        { pitch: 42, startBeat: 4.00, duration: 1.25, velocity: 0.9 },
        { pitch: 45, startBeat: 5.50, duration: 0.50, velocity: 0.9 },
        { pitch: 49, startBeat: 6.75, duration: 1.25, velocity: 0.9 }
      ]
    },
    {
      id: 3,
      name: "Dance-Pop Drums",
      mode: "Hits",
      kit: "808",
      sound: "Punchy kick, dry clap, tight closed hi-hat, lightly airy open hi-hat",
      hits: [
        { drum: "kick",      startBeat: 4.00, velocity: 0.9 },
        { drum: "closedHat", startBeat: 4.00, velocity: 0.7 },

        { drum: "closedHat", startBeat: 4.50, velocity: 0.5 },

        { drum: "clap",      startBeat: 5.00, velocity: 0.85 },
        { drum: "closedHat", startBeat: 5.00, velocity: 0.7 },

        { drum: "kick",      startBeat: 5.50, velocity: 0.9 },
        { drum: "closedHat", startBeat: 5.50, velocity: 0.5 },

        { drum: "closedHat", startBeat: 6.00, velocity: 0.7 },

        { drum: "openHat",   startBeat: 6.50, velocity: 0.6 },

        { drum: "kick",      startBeat: 6.75, velocity: 0.9 },

        { drum: "clap",      startBeat: 7.00, velocity: 0.85 },
        { drum: "closedHat", startBeat: 7.00, velocity: 0.5 },

        { drum: "closedHat", startBeat: 7.50, velocity: 0.7 }
      ]
    }
  ]
};

export function normalizeDrumSound(name: string): DrumSoundId {
  if (name === 'closedHat') return 'closed-hat';
  if (name === 'openHat') return 'open-hat';
  return name as DrumSoundId;
}

export function parseRootPitchClass(root: string): number {
  const map: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1,
    'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4,
    'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11,
  };
  return map[root] ?? 6;
}

/**
 * Pure converter: translates high-level example song definition
 * into canvas strokes and serialized project state with exact timing & pitch coordinates.
 */
export function convertExampleSongToProject(songDef: ExampleSongDef): ProjectData {
  const totalBeats = songDef.project.timelineBeats;
  const total16thSteps = songDef.project.lengthBars * 16;
  const rootPitch = parseRootPitchClass(songDef.project.root);
  const scaleName: ScaleName = 'natural minor';
  const scaleNotes = buildScaleNotes(rootPitch, scaleName, 1, 6);
  const strokes: Stroke[] = [];

  for (const track of songDef.tracks) {
    const trackId = `track-${track.id}`;

    if (track.mode === 'Hits' && track.hits) {
      // Beat track: convert each hit into a tap stroke in the correct drum lane at exact x position
      track.hits.forEach((hit, idx) => {
        const soundId = normalizeDrumSound(hit.drum);
        const laneIndex = DRUM_LANES.findIndex((lane) => lane.id === soundId);
        const activeLane = laneIndex >= 0 ? laneIndex : 7;
        const normY = (activeLane + 0.5) / 8;
        const normX = hit.startBeat / totalBeats;

        strokes.push({
          id: `${trackId}_hit_${soundId}_${idx}_${hit.startBeat}`,
          trackId,
          points: [
            { x: normX, y: normY, t: 0 },
            { x: normX + 0.0008, y: normY, t: 15 },
          ],
          width: Math.max(1.0, Math.min(5.0, ((hit.velocity ?? 0.8) - 0.65) * 16)),
        });
      });
    } else if (track.notes) {
      if (track.mode === 'Flow') {
        // Continuous flow mode strokes
        track.notes.forEach((note, idx) => {
          const noteIndex = scaleNotes.indexOf(note.pitch);
          const safeIndex = noteIndex >= 0 ? noteIndex : 0;
          const normY = 1 - safeIndex / (scaleNotes.length - 1);
          const startX = note.startBeat / totalBeats;
          const endX = (note.startBeat + note.duration) / totalBeats;

          strokes.push({
            id: `${trackId}_flow_${note.pitch}_${idx}`,
            trackId,
            points: [
              { x: startX, y: normY, t: 0 },
              { x: startX + (endX - startX) * 0.33, y: normY + 0.0006, t: 50 },
              { x: startX + (endX - startX) * 0.67, y: normY - 0.0006, t: 100 },
              { x: endX, y: normY, t: 150 },
            ],
            width: Math.max(1.5, Math.min(5.0, ((note.velocity ?? 0.9) - 0.55) * 16)),
          });
        });
      } else {
        // Notes mode strokes (stepped 16th grid notes)
        track.notes.forEach((note, idx) => {
          const noteIndex = scaleNotes.indexOf(note.pitch);
          const safeIndex = noteIndex >= 0 ? noteIndex : 0;
          const normY = 1 - safeIndex / (scaleNotes.length - 1);
          const s = Math.round(note.startBeat * 4);

          const x0 = (s + 0.2) / total16thSteps;
          const x1 = (s + 0.5) / total16thSteps;
          const x2 = (s + 0.8) / total16thSteps;

          strokes.push({
            id: `${trackId}_note_${note.pitch}_${idx}`,
            trackId,
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
    version: 1,
    bpm: songDef.project.tempoBpm,
    bars: songDef.project.lengthBars,
    rootNote: rootPitch,
    scaleName,
    playbackMode: 'flow',
    glide: 20,
    tracks: [
      {
        id: 'track-1',
        name: 'Warm Pluck / Marimba',
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
        name: 'Deep Sub Bass',
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
        name: 'Dance-Pop Drums',
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

export const MARIMBA_POP_PROJECT: ProjectData = convertExampleSongToProject(MARIMBA_POP_SPEC);

export const MARIMBA_POP_CREATION: Creation = {
  id: 'marimba-pop-original',
  title: 'Marimba Pop',
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
  schemaVersion: 1,
  project: MARIMBA_POP_PROJECT,
  preview: extractCreationMeta({
    id: 'marimba-pop-original',
    title: 'Marimba Pop',
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    schemaVersion: 1,
    project: MARIMBA_POP_PROJECT,
  }),
};
