import { Stroke } from '../state';
import { ProjectData } from '../library/types';
import { SerializedTrack } from '../audio/projectState';
import { buildScaleNotes, ScaleName, midiToNoteName, KeyMode } from '../audio/scales';
import { DRUM_LANES } from '../audio/drums';
import { ExampleSong } from './types';

export function normalizeTrackId(colorId: string): string {
  if (colorId.startsWith('track-')) return colorId;
  const num = parseInt(colorId, 10);
  if (!isNaN(num) && num >= 1 && num <= 6) return `track-${num}`;
  const colorMap: Record<string, string> = {
    vermilion: 'track-1',
    indigo: 'track-2',
    ochre: 'track-3',
    sage: 'track-4',
    plum: 'track-5',
    slate: 'track-6',
  };
  return colorMap[colorId.toLowerCase()] || 'track-1';
}

export function convertNotesToStrokes(song: ExampleSong): {
  strokes: Stroke[];
  project: ProjectData;
} {
  const totalBeats = song.bars * 4;
  const secPerBeat = 60 / song.bpm;
  const strokes: Stroke[] = [];

  // Track map for project setup
  const trackConfigs: SerializedTrack[] = [
    {
      id: 'track-1',
      name: 'Vermilion',
      trackType: 'melodic',
      instrumentId: 'marimba',
      kitId: '808',
      volume: 0.62,
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
      volume: 0.60,
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
      trackType: 'melodic',
      instrumentId: 'pluck',
      kitId: '808',
      volume: 0.60,
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
      volume: 0.58,
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
      volume: 0.58,
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
      volume: 0.58,
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
  ];

  for (const trackDef of song.tracks) {
    const trackId = normalizeTrackId(trackDef.colorId);
    const existing = trackConfigs.find((t) => t.id === trackId);
    if (existing) {
      existing.instrumentId = trackDef.instrumentId;
      existing.trackType = trackDef.mode === 'beat' ? 'beat' : 'melodic';
      if (trackDef.root !== undefined && trackDef.scale !== undefined) {
        existing.key = { root: trackDef.root, scale: trackDef.scale };
      }
    }

    if (trackDef.mode === 'beat' && trackDef.hits) {
      // Process beat hits
      trackDef.hits.forEach((hit, idx) => {
        const laneIndex = DRUM_LANES.findIndex((lane) => lane.id === hit.drum);
        if (laneIndex === -1) {
          throw new Error(`Unknown drum hit identifier: ${hit.drum}`);
        }
        const normY = (laneIndex + 0.5) / 8;
        const normX = hit.startBeat / totalBeats;

        strokes.push({
          id: `${trackId}-hit-${hit.drum}-${idx}-${hit.startBeat}`,
          trackId,
          points: [
            { x: normX, y: normY, t: 0 },
            { x: normX + 0.0005, y: normY, t: 10 },
          ],
          width: Math.max(1.5, Math.min(4.5, (hit.velocity ?? 0.8) * 4)),
        });
      });
    } else if (trackDef.notes) {
      // Melodic notes: determine effective scale
      const root = trackDef.root !== undefined ? trackDef.root : song.root;
      const scale: ScaleName = trackDef.scale !== undefined ? trackDef.scale : song.scale;
      const scaleNotes = buildScaleNotes(root, scale, 3, 6);

      trackDef.notes.forEach((note, idx) => {
        const noteIndex = scaleNotes.indexOf(note.midi);
        if (noteIndex === -1) {
          throw new Error(
            `Note ${midiToNoteName(note.midi)} (MIDI ${note.midi}) is outside effective scale ` +
            `(${scale}) for track ${trackId} (root: ${root}). Valid scale notes: [${scaleNotes.join(', ')}]`
          );
        }

        // Center of pitch band
        const normY = 1 - noteIndex / (scaleNotes.length - 1);
        const startX = note.startBeat / totalBeats;

        if (trackDef.mode === 'flow') {
          // Flow mode: line from startBeat to startBeat + 0.92 * durBeats with >=40ms gap
          const noteDurationSec = note.durBeats * secPerBeat;
          const rearticulationGapSec = Math.max(0.040, noteDurationSec * 0.08);
          const soundingDurationSec = Math.max(0.020, noteDurationSec - rearticulationGapSec);
          const soundingBeats = soundingDurationSec / secPerBeat;
          const endX = (note.startBeat + soundingBeats) / totalBeats;

          const durationMs = Math.round(soundingDurationSec * 1000);

          strokes.push({
            id: `${trackId}-flow-${note.midi}-${idx}`,
            trackId,
            points: [
              { x: startX, y: normY, t: 0 },
              { x: startX + (endX - startX) * 0.5, y: normY, t: Math.round(durationMs * 0.5) },
              { x: endX, y: normY, t: durationMs },
            ],
            width: Math.max(1.5, Math.min(4.5, (note.velocity ?? 0.8) * 4)),
          });
        } else {
          // Notes mode: short horizontal stroke centered around step
          const totalSteps = song.bars * 16;
          const stepIndex = Math.round(note.startBeat * 4);
          const stepX = (stepIndex + 0.5) / totalSteps;

          strokes.push({
            id: `${trackId}-note-${note.midi}-${idx}`,
            trackId,
            points: [
              { x: Math.max(0, stepX - 0.009), y: normY, t: 0 },
              { x: Math.min(1, stepX + 0.009), y: normY, t: 25 },
            ],
            width: Math.max(1.5, Math.min(4.5, (note.velocity ?? 0.8) * 4)),
          });
        }
      });
    }
  }

  const project: ProjectData = {
    version: 3,
    bpm: song.bpm,
    bars: song.bars,
    rootNote: song.root,
    scaleName: song.scale,
    keyMode: (song.keyMode === 'per-color' ? 'perColour' : 'linked') as KeyMode,
    playbackMode: song.playbackMode || (song.tracks.some((t) => t.mode === 'flow') ? 'flow' : 'notes'),
    glide: 20,
    tracks: trackConfigs,
    strokes,
    fx: {
      reverb: { amount: 15, size: 2.0, bypassed: false },
      delay: { amount: 10, time: '8n', bypassed: false },
      chorus: { amount: 0, depth: 0.5, bypassed: true },
      phaser: { amount: 0, speed: 0.5, bypassed: true },
      tremolo: { amount: 0, rate: '8n', bypassed: true },
      autoFilter: { amount: 0, speed: '2m', bypassed: true },
      drive: { amount: 0, tone: 4000, bypassed: true },
    },
  };

  return { strokes, project };
}
