import { Stroke, PlaybackMode } from '../state';
import { ProjectData } from '../library/types';
import { buildScaleNotes, effectiveKey, ScaleName, KeyMode } from './scales';
import { generateEventsFromStrokes, NoteEvent } from './schedule';
import { generateFlowEventsFromStrokes, thinFlowEvents, FlowStrokeEvent } from './flowScheduler';
import { generateBeatEventsFromStrokes, BeatHitEvent } from './beatSchedule';
import { generateBeatFlowEventsFromStrokes, BeatFlowStrokeEvent } from './beatFlowSchedule';

export interface ProjectEventsOptions {
  bpm?: number;
  polyphonyCap?: number;
  rootNote?: number;
  scaleName?: ScaleName;
  keyMode?: KeyMode;
  playbackMode?: PlaybackMode;
}

export interface ProjectScheduledEvents {
  bars: number;
  bpm: number;
  playbackMode: PlaybackMode;
  noteEvents: NoteEvent[];
  flowEvents: FlowStrokeEvent[];
  beatHitEvents: BeatHitEvent[];
  beatFlowEvents: BeatFlowStrokeEvent[];
}

/**
 * Pure function: converts a project data structure (strokes, tracks, settings)
 * into scheduled events (time, pitch, drum, duration, velocity, track).
 * Pure calculation — zero Tone.js or Web Audio side effects.
 */
export function buildProjectEvents(
  project: ProjectData,
  options?: ProjectEventsOptions
): ProjectScheduledEvents {
  const bars = Math.max(1, Math.min(8, project.bars || 2));
  const bpm = Math.max(30, Math.min(300, options?.bpm ?? project.bpm ?? 90));
  const playbackMode: PlaybackMode = options?.playbackMode ?? project.playbackMode ?? 'flow';
  const strokes: Stroke[] = Array.isArray(project.strokes) ? project.strokes : [];
  const tracks = Array.isArray(project.tracks) ? project.tracks : [];

  const trackMap = new Map<string, (typeof tracks)[0]>();
  for (const t of tracks) {
    trackMap.set(t.id, t);
  }

  const result: ProjectScheduledEvents = {
    bars,
    bpm,
    playbackMode,
    noteEvents: [],
    flowEvents: [],
    beatHitEvents: [],
    beatFlowEvents: [],
  };

  if (strokes.length === 0) {
    return result;
  }

  // Partition strokes into melodic vs beat (hits vs flow)
  const melodicStrokes: Stroke[] = [];
  const beatHitsStrokesByTrack = new Map<string, Stroke[]>();
  const beatFlowStrokesByTrack = new Map<string, Stroke[]>();

  for (const stroke of strokes) {
    const tr = trackMap.get(stroke.trackId);
    if (tr && tr.trackType === 'beat') {
      if (tr.beatMode === 'flow') {
        let list = beatFlowStrokesByTrack.get(stroke.trackId);
        if (!list) {
          list = [];
          beatFlowStrokesByTrack.set(stroke.trackId, list);
        }
        list.push(stroke);
      } else {
        let list = beatHitsStrokesByTrack.get(stroke.trackId);
        if (!list) {
          list = [];
          beatHitsStrokesByTrack.set(stroke.trackId, list);
        }
        list.push(stroke);
      }
    } else {
      melodicStrokes.push(stroke);
    }
  }

  // 1. Beat Hits Events
  for (const [tId, sList] of beatHitsStrokesByTrack.entries()) {
    const tr = trackMap.get(tId);
    const hits = generateBeatEventsFromStrokes(sList, {
      bpm,
      bars,
      rate: tr?.beatRate || '1/16',
      swing: tr?.swing || 0,
      humanize: tr?.humanize !== undefined ? tr.humanize : 15,
    });
    result.beatHitEvents.push(...hits);
  }

  // 2. Beat Flow Events
  for (const [tId, sList] of beatFlowStrokesByTrack.entries()) {
    const tr = trackMap.get(tId);
    const style = tr?.beatFlowStyle || 'glide';
    const evs = generateBeatFlowEventsFromStrokes(
      sList,
      bars,
      bpm,
      style,
      project.glide || 0
    );
    result.beatFlowEvents.push(...evs);
  }

  // 3. Melodic Events
  if (melodicStrokes.length > 0) {
    const melodicTracks = tracks.filter((t) => t.trackType !== 'beat');
    const projectKeyContext = {
      keyMode: options?.keyMode ?? project.keyMode,
      rootNote: options?.rootNote ?? project.rootNote,
      scaleName: options?.scaleName ?? project.scaleName,
    };

    if (playbackMode === 'flow') {
      let flowEvents: FlowStrokeEvent[] = [];
      for (const track of melodicTracks) {
        const trackStrokes = melodicStrokes.filter((s) => s.trackId === track.id);
        if (trackStrokes.length === 0) continue;

        const key = effectiveKey(track, projectKeyContext);
        const trackScaleNotes = buildScaleNotes(key.root, key.scale, 3, 6);
        const evs = generateFlowEventsFromStrokes(
          trackStrokes,
          bars,
          bpm,
          trackScaleNotes,
          project.glide || 0
        );
        flowEvents.push(...evs);
      }

      if (options?.polyphonyCap && options.polyphonyCap > 0) {
        const thinning = thinFlowEvents(flowEvents, options.polyphonyCap);
        flowEvents = thinning.kept;
      }
      result.flowEvents = flowEvents;
    } else {
      // Notes mode (discrete 16th-note steps)
      const noteEvents: NoteEvent[] = [];
      for (const track of melodicTracks) {
        const trackStrokes = melodicStrokes.filter((s) => s.trackId === track.id);
        if (trackStrokes.length === 0) continue;

        const key = effectiveKey(track, projectKeyContext);
        const trackScaleNotes = buildScaleNotes(key.root, key.scale, 3, 6);
        const evs = generateEventsFromStrokes(trackStrokes, bars, trackScaleNotes);
        noteEvents.push(...evs);
      }
      result.noteEvents = noteEvents;
    }
  }

  return result;
}
