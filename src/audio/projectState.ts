import { state, events, Stroke, TrackType, PlaybackMode, BeatPlaybackMode, BeatFlowStyle, BeatRollVoice, BeatSweepCharacter } from '../state';
import { getTrackManager, Track } from './tracks';
import { DrumKitId } from './drums';
import { BeatRate } from './beatSchedule';
import { ScaleName } from './scales';

export const PROJECT_STORAGE_KEY = 'instruversal:project';

export interface SerializedTrack {
  id: string;
  name: string;
  trackType: TrackType;
  instrumentId: string;
  kitId: DrumKitId;
  volume: number;
  muted: boolean;
  solo: boolean;
  beatRate: BeatRate;
  swing: number;
  humanize: number;
  beatMode: BeatPlaybackMode;
  beatFlowStyle: BeatFlowStyle;
  beatRollVoice: BeatRollVoice;
  beatSweepCharacter: BeatSweepCharacter;
}

export interface SerializedProject {
  version: 1;
  bpm: number;
  bars: number;
  rootNote: number;
  scaleName: ScaleName;
  playbackMode: PlaybackMode;
  glide: number;
  tracks: SerializedTrack[];
  strokes: Stroke[];
}

export function serializeProject(tracks?: Track[]): SerializedProject {
  const allTracks = tracks || getTrackManager().getAllTracks();
  const serializedTracks: SerializedTrack[] = allTracks.map((t: Track) => ({
    id: t.id,
    name: t.name,
    trackType: t.trackType,
    instrumentId: t.instrumentId,
    kitId: t.kitId,
    volume: t.volume,
    muted: t.muted,
    solo: t.solo,
    beatRate: t.beatRate,
    swing: t.swing,
    humanize: t.humanize,
    beatMode: t.beatMode,
    beatFlowStyle: t.beatFlowStyle,
    beatRollVoice: t.beatRollVoice,
    beatSweepCharacter: t.beatSweepCharacter,
  }));

  return {
    version: 1,
    bpm: state.bpm,
    bars: state.bars,
    rootNote: state.rootNote,
    scaleName: state.scaleName,
    playbackMode: state.playbackMode,
    glide: state.glide,
    tracks: serializedTracks,
    strokes: state.strokes,
  };
}

export function deserializeProject(data: SerializedProject, tracks?: Track[]): boolean {
  if (!data || data.version !== 1) return false;

  const targetTracks = tracks || getTrackManager().getAllTracks();
  if (Array.isArray(data.tracks)) {
    for (const tData of data.tracks) {
      const track = targetTracks.find((t) => t.id === tData.id);
      if (track) {
        track.name = tData.name || track.name;
        track.trackType = tData.trackType || track.trackType;
        track.instrumentId = tData.instrumentId || track.instrumentId;
        track.kitId = tData.kitId || track.kitId;
        track.volume = typeof tData.volume === 'number' ? tData.volume : track.volume;
        track.muted = !!tData.muted;
        track.solo = !!tData.solo;
        track.beatRate = tData.beatRate || track.beatRate;
        track.swing = typeof tData.swing === 'number' ? tData.swing : track.swing;
        track.humanize = typeof tData.humanize === 'number' ? tData.humanize : track.humanize;
        track.beatMode = tData.beatMode || track.beatMode;
        track.beatFlowStyle = tData.beatFlowStyle || track.beatFlowStyle;
        track.beatRollVoice = tData.beatRollVoice || track.beatRollVoice;
        track.beatSweepCharacter = tData.beatSweepCharacter || track.beatSweepCharacter;
      }
    }
  }

  if (typeof data.bpm === 'number') state.bpm = data.bpm;
  if (typeof data.bars === 'number') state.bars = data.bars;
  if (typeof data.rootNote === 'number') state.rootNote = data.rootNote;
  if (data.scaleName) state.scaleName = data.scaleName;
  if (data.playbackMode) state.playbackMode = data.playbackMode;
  if (typeof data.glide === 'number') state.glide = data.glide;
  if (Array.isArray(data.strokes)) state.strokes = data.strokes;

  return true;
}

export function saveProject(tracks?: Track[]): void {
  try {
    const project = serializeProject(tracks);
    const jsonStr = JSON.stringify(project);
    localStorage.setItem(PROJECT_STORAGE_KEY, jsonStr);

    // Update share link in URL hash without adding page history entries
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      const encoded = encodeURIComponent(jsonStr);
      window.history.replaceState(null, '', `#project=${encoded}`);
    }
  } catch (err) {
    console.error('Failed to save project:', err);
  }
}

export function loadSavedProject(tracks?: Track[]): boolean {
  try {
    // 1. Check share link in URL hash
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#project=')) {
      const hashData = window.location.hash.slice(9);
      if (hashData) {
        const decoded = decodeURIComponent(hashData);
        const parsed = JSON.parse(decoded) as SerializedProject;
        if (deserializeProject(parsed, tracks)) {
          return true;
        }
      }
    }

    // 2. Check localStorage
    const saved = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as SerializedProject;
      return deserializeProject(parsed, tracks);
    }
  } catch (err) {
    console.error('Failed to load project:', err);
  }
  return false;
}

let autosaveTimer: number | null = null;
export function scheduleAutosave(): void {
  if (autosaveTimer !== null) {
    window.clearTimeout(autosaveTimer);
  }
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    saveProject();
  }, 400);
}

export function initProjectAutosave(): () => void {
  const unsubs = [
    events.on('stroke:added', scheduleAutosave),
    events.on('strokes:updated', scheduleAutosave),
    events.on('bpm:change', scheduleAutosave),
    events.on('scale:change', scheduleAutosave),
    events.on('playback-mode:change', scheduleAutosave),
    events.on('glide:change', scheduleAutosave),
    events.on('track:beat-param-change', scheduleAutosave),
    events.on('track:type-change', scheduleAutosave),
    events.on('track:update', scheduleAutosave),
  ];

  return () => {
    unsubs.forEach((fn) => fn());
    if (autosaveTimer !== null) {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
  };
}
