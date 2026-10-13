import { state, events, Stroke, TrackType, PlaybackMode, BeatPlaybackMode, BeatFlowStyle, BeatRollVoice, BeatSweepCharacter, FxConfig } from '../state';
import { getTrackManager, Track } from './tracks';
import { getTransport } from './transport';
import { DrumKitId } from './drums';
import { BeatRate } from './beatSchedule';
import { ScaleName, KeyMode, MusicalKey, SCALES } from './scales';
import { getMasterEffectsRack } from './effects';

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
  key?: MusicalKey;
}

export interface SerializedProject {
  version: 1 | 2 | 3;
  bpm: number;
  bars: number;
  rootNote: number;
  scaleName: ScaleName;
  keyMode?: KeyMode;
  playbackMode: PlaybackMode;
  glide: number;
  tracks: SerializedTrack[];
  strokes: Stroke[];
  fx?: FxConfig;
}

export function serializeProject(tracks?: Track[]): SerializedProject {
  let allTracks = tracks;
  if (!allTracks) {
    try {
      allTracks = getTrackManager().getAllTracks();
    } catch {
      allTracks = [];
    }
  }
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
    key: t.key ? { root: t.key.root, scale: t.key.scale } : undefined,
  }));

  return {
    version: 3,
    bpm: state.bpm,
    bars: state.bars,
    rootNote: state.rootNote,
    scaleName: state.scaleName,
    keyMode: state.keyMode || 'linked',
    playbackMode: state.playbackMode,
    glide: state.glide,
    tracks: serializedTracks,
    strokes: state.strokes,
    fx: state.fx ? JSON.parse(JSON.stringify(state.fx)) : undefined,
  };
}

export function deserializeProject(data: SerializedProject, tracks?: Track[]): boolean {
  if (!data || (data.version !== 1 && data.version !== 2 && data.version !== 3)) return false;

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
        if (tData.key && track.trackType === 'melodic' && typeof tData.key === 'object') {
          const rawRoot = typeof tData.key.root === 'number' ? ((Math.round(tData.key.root) % 12) + 12) % 12 : 0;
          const rawScale = (typeof tData.key.scale === 'string' && tData.key.scale in SCALES)
            ? (tData.key.scale as ScaleName)
            : 'major pentatonic';
          track.setKey({ root: rawRoot, scale: rawScale });
        } else {
          track.key = undefined;
        }
      }
    }
  }

  if (typeof data.bpm === 'number') state.bpm = data.bpm;

  // Sanitize loop bars: 1, 2, 4, 8; legacy projects without bars default to 2
  const VALID_BARS = [1, 2, 4, 8];
  const deserializedBars = (typeof data.bars === 'number' && VALID_BARS.includes(data.bars)) ? data.bars : 2;
  state.bars = deserializedBars;
  getTransport().setBars(deserializedBars);
  events.emit('bars:change', deserializedBars);

  if (typeof data.rootNote === 'number') {
    state.rootNote = ((Math.round(data.rootNote) % 12) + 12) % 12;
  }
  if (data.scaleName && data.scaleName in SCALES) {
    state.scaleName = data.scaleName;
  }
  state.keyMode = data.keyMode === 'perColour' ? 'perColour' : 'linked';
  events.emit('key-mode:change', state.keyMode);
  events.emit('scale:change', { rootNote: state.rootNote, scaleName: state.scaleName });

  if (data.playbackMode) state.playbackMode = data.playbackMode;
  if (typeof data.glide === 'number') state.glide = data.glide;
  if (Array.isArray(data.strokes)) state.strokes = data.strokes;
  if (data.fx && typeof data.fx === 'object') {
    state.fx = { ...state.fx, ...data.fx };
    try {
      getMasterEffectsRack().applyConfig(state.fx);
    } catch {}
    events.emit('fx:change', state.fx);
  }

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
        try {
          const decoded = decodeURIComponent(hashData);
          const parsed = JSON.parse(decoded) as SerializedProject;
          if (deserializeProject(parsed, tracks)) {
            return true;
          }
        } catch (hashErr) {
          console.warn('Failed to parse share link hash project:', hashErr);
        }
      }
    }

    // 2. Check localStorage
    const saved = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as SerializedProject;
        return deserializeProject(parsed, tracks);
      } catch (storeErr) {
        console.warn('Failed to parse localStorage project:', storeErr);
      }
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
    events.on('bars:change', scheduleAutosave),
    events.on('scale:change', scheduleAutosave),
    events.on('playback-mode:change', scheduleAutosave),
    events.on('glide:change', scheduleAutosave),
    events.on('track:beat-param-change', scheduleAutosave),
    events.on('track:type-change', scheduleAutosave),
    events.on('track:update', scheduleAutosave),
    events.on('key-mode:change', scheduleAutosave),
    events.on('track:key-change', scheduleAutosave),
    events.on('fx:change', scheduleAutosave),
  ];

  return () => {
    unsubs.forEach((fn) => fn());
    if (autosaveTimer !== null) {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
  };
}
