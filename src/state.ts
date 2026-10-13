import { CONFIG } from './config';
import { ScaleName, KeyMode, MusicalKey } from './audio/scales';

export type Pt = {
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
  t: number; // ms since stroke start
};
export type Point = Pt;

export type PolyphonyCap = 'low' | 'medium' | 'high';
export const POLYPHONY_VOICE_COUNTS: Record<PolyphonyCap, number> = {
  low: 4,
  medium: 8,
  high: 12,
};

export type Stroke = {
  id: string;
  trackId: string;
  points: Pt[];
  width: number;
};

export type ToolMode = 'draw' | 'eraser' | 'select';
export type PlaybackMode = 'flow' | 'notes';
export type TrackType = 'melodic' | 'beat';
export type BeatPlaybackMode = 'hits' | 'flow';
export type BeatFlowStyle = 'glide' | 'roll' | 'sweep';
export type BeatRollVoice = 'snare' | 'hat' | 'tom';
export type BeatSweepCharacter = 'shaker' | 'hat';

export interface FxConfig {
  reverb: { amount: number; size: number; bypassed: boolean };
  delay: { amount: number; time: string; bypassed: boolean };
  chorus: { amount: number; depth: number; bypassed: boolean };
  phaser: { amount: number; speed: number; bypassed: boolean };
  tremolo: { amount: number; rate: string; bypassed: boolean };
  autoFilter: { amount: number; speed: string; bypassed: boolean };
  drive: { amount: number; tone: number; bypassed: boolean };
}

export const DEFAULT_FX_CONFIG: FxConfig = {
  reverb: { amount: 15, size: 2.2, bypassed: false },
  delay: { amount: 0, time: '8n', bypassed: true },
  chorus: { amount: 0, depth: 0.5, bypassed: true },
  phaser: { amount: 0, speed: 0.5, bypassed: true },
  tremolo: { amount: 0, rate: '8n', bypassed: true },
  autoFilter: { amount: 0, speed: '2m', bypassed: true },
  drive: { amount: 0, tone: 4000, bypassed: true },
};

export interface KeyStateSnapshot {
  keyMode: KeyMode;
  baseRoot: number;
  baseScale: ScaleName;
  trackKeys: Record<string, MusicalKey | undefined>;
}

export type EventMap = {
  'audio:started': void;
  'transport:play': void;
  'transport:pause': void;
  'bpm:change': number;
  'bars:change': number;
  'scale:change': { rootNote: number; scaleName: ScaleName };
  'key-mode:change': KeyMode;
  'track:key-change': { trackId: string; key: MusicalKey };
  'key-state:restore': KeyStateSnapshot;
  'track:select': string;
  'track:update': string;
  'ui:open-mixer': 'tracks' | 'key' | undefined;
  'ui:open-fx': void;
  'ui:open-instruments': string | undefined;
  'ui:close-all-sheets': void;
  'tool:change': ToolMode;
  'playback-mode:change': PlaybackMode;
  'glide:change': number;
  'fx:change': FxConfig;
  'sync:change': number;
  'history:change': { canUndo: boolean; canRedo: boolean };
  'note:hit': {
    strokeId?: string;
    trackId: string;
    midi: number;
    x: number;
    y: number;
    isBeat?: boolean;
  };
  'track:type-change': { trackId: string; type: TrackType };
  'track:beat-param-change': {
    trackId: string;
    kitId?: string;
    rate?: string;
    swing?: number;
    humanize?: number;
    beatMode?: BeatPlaybackMode;
    beatFlowStyle?: BeatFlowStyle;
    beatRollVoice?: BeatRollVoice;
    beatSweepCharacter?: BeatSweepCharacter;
  };
  'stroke:added': Stroke;
  'strokes:updated': Stroke[];
  'theme:change': 'light' | 'dark';
  'eraser:radius-change': number;
  'eraser:mode-change': 'part' | 'stroke';
  'eraser:track-only-change': boolean;
  'selection:change': string[];
  'selection:add-mode-change': boolean;
  'clipboard:change': boolean;
  'snap:change': boolean;
  'polyphony:change': PolyphonyCap;
  'polyphony:thinned': boolean;
  'app:start': { startAudio?: boolean } | undefined;
};

type EventKey = keyof EventMap;
type AnyHandler = (data: any) => void;

class TinyEmitter {
  private listeners: Map<EventKey, Set<AnyHandler>> = new Map();

  on<K extends EventKey>(event: K, handler: (data: EventMap[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as AnyHandler);
    return () => this.off(event, handler);
  }

  off<K extends EventKey>(event: K, handler: (data: EventMap[K]) => void): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler as AnyHandler);
    }
  }

  emit<K extends EventKey>(event: K, data: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((fn: AnyHandler) => fn(data));
    }
  }
}

export interface AppState {
  audioStarted: boolean;
  isPlaying: boolean;
  bpm: number;
  bars: number;
  selectedTrackId: string;
  rootNote: number;
  scaleName: ScaleName;
  keyMode: KeyMode;
  activeTool: ToolMode;
  eraserRadius: number; // radius in canvas px, 6..40
  eraserMode: 'part' | 'stroke';
  eraserSelectedTrackOnly: boolean;
  selectedStrokeIds: string[];
  snapToGrid: boolean;
  selectThisColourOnly: boolean;
  selectAddMode: boolean;
  playbackMode: PlaybackMode;
  glide: number; // 0 to 100
  showHitNotes: boolean;
  syncOffsetMs: number; // user-calibrated latency offset in ms, stored in localStorage
  kickDucking: number; // 0 to 40 (%)
  fx: FxConfig;
  polyphony: PolyphonyCap;
  isThinned: boolean;
  strokes: Stroke[];
}


// Persisted sync offset
const SYNC_STORAGE_KEY = 'instruversal:sync';
function loadSyncOffset(): number {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    if (raw !== null) {
      const val = parseFloat(raw);
      if (!isNaN(val)) return Math.max(-200, Math.min(400, val));
    }
  } catch {}
  return 0;
}
export function saveSyncOffset(ms: number): void {
  try {
    localStorage.setItem(SYNC_STORAGE_KEY, String(ms));
  } catch {}
}

// Persisted polyphony cap
const POLYPHONY_STORAGE_KEY = 'instruversal:polyphony';
export function loadPolyphony(): PolyphonyCap {
  try {
    if (localStorage.getItem('instruversal:light-mode') === 'true') {
      return 'low';
    }
    const saved = localStorage.getItem(POLYPHONY_STORAGE_KEY);
    if (saved === 'low' || saved === 'medium' || saved === 'high') {
      return saved;
    }
  } catch {}
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
    return 'low';
  }
  return 'medium';
}
export function savePolyphony(cap: PolyphonyCap): void {
  try {
    localStorage.setItem(POLYPHONY_STORAGE_KEY, cap);
  } catch {}
}

// Persisted snap to grid
const SNAP_STORAGE_KEY = 'instruversal:snap';
export function loadSnap(): boolean {
  try {
    return localStorage.getItem(SNAP_STORAGE_KEY) === 'true';
  } catch {}
  return false;
}
export function saveSnap(enabled: boolean): void {
  try {
    localStorage.setItem(SNAP_STORAGE_KEY, String(enabled));
  } catch {}
}

// Eraser settings persistence
const ERASER_SIZE_KEY = 'instruversal:eraser-size';
const ERASER_MODE_KEY = 'instruversal:eraser-mode';
const ERASER_TRACK_ONLY_KEY = 'instruversal:eraser-track-only';

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  );
}

function loadEraserSize(): number {
  try {
    const raw = localStorage.getItem(ERASER_SIZE_KEY);
    if (raw !== null) {
      const val = parseFloat(raw);
      if (!isNaN(val)) return Math.max(6, Math.min(40, val));
    }
  } catch {}
  return isTouchDevice() ? 22 : 14;
}

export function saveEraserSize(size: number): void {
  try {
    localStorage.setItem(ERASER_SIZE_KEY, String(Math.round(size)));
  } catch {}
}

function loadEraserMode(): 'part' | 'stroke' {
  try {
    const raw = localStorage.getItem(ERASER_MODE_KEY);
    if (raw === 'stroke' || raw === 'part') return raw;
  } catch {}
  return 'part';
}

export function saveEraserMode(mode: 'part' | 'stroke'): void {
  try {
    localStorage.setItem(ERASER_MODE_KEY, mode);
  } catch {}
}

function loadEraserTrackOnly(): boolean {
  try {
    const raw = localStorage.getItem(ERASER_TRACK_ONLY_KEY);
    if (raw !== null) return raw === 'true';
  } catch {}
  return false;
}

export function saveEraserTrackOnly(val: boolean): void {
  try {
    localStorage.setItem(ERASER_TRACK_ONLY_KEY, String(val));
  } catch {}
}

// Device key defaults persistence under 'instruversal:defaults'
const DEFAULTS_STORAGE_KEY = 'instruversal:defaults';

export interface DeviceKeyDefaults {
  keyMode: KeyMode;
  rootNote: number;
  scaleName: ScaleName;
}

export function loadDeviceKeyDefaults(): DeviceKeyDefaults {
  try {
    const raw = localStorage.getItem(DEFAULTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const keyMode: KeyMode = parsed.keyMode === 'perColour' ? 'perColour' : 'linked';
      const rootNote = typeof parsed.rootNote === 'number' ? ((Math.round(parsed.rootNote) % 12) + 12) % 12 : 0;
      const scaleName: ScaleName = parsed.scaleName || 'major pentatonic';
      return { keyMode, rootNote, scaleName };
    }
  } catch {}
  return { keyMode: 'linked', rootNote: 0, scaleName: 'major pentatonic' };
}

export function saveDeviceKeyDefaults(defaults: Partial<DeviceKeyDefaults>): void {
  try {
    const current = loadDeviceKeyDefaults();
    const updated: DeviceKeyDefaults = {
      keyMode: defaults.keyMode || current.keyMode,
      rootNote: defaults.rootNote !== undefined ? ((Math.round(defaults.rootNote) % 12) + 12) % 12 : current.rootNote,
      scaleName: defaults.scaleName || current.scaleName,
    };
    localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

const initialKeyDefaults = loadDeviceKeyDefaults();

export const state: AppState = {
  audioStarted: false,
  isPlaying: false,
  bpm: CONFIG.defaultBpm,
  bars: CONFIG.defaultBars,
  selectedTrackId: 'track-1',
  rootNote: initialKeyDefaults.rootNote,
  scaleName: initialKeyDefaults.scaleName,
  keyMode: initialKeyDefaults.keyMode,
  activeTool: 'draw',
  eraserRadius: loadEraserSize(),
  eraserMode: loadEraserMode(),
  eraserSelectedTrackOnly: loadEraserTrackOnly(),
  selectedStrokeIds: [],
  snapToGrid: loadSnap(),
  selectThisColourOnly: false,
  selectAddMode: false,
  playbackMode: 'flow',
  glide: 25,
  syncOffsetMs: loadSyncOffset(),
  kickDucking: 0,
  showHitNotes: true,
  fx: { ...DEFAULT_FX_CONFIG },
  polyphony: loadPolyphony(),
  isThinned: false,
  strokes: [],
};

export const events = new TinyEmitter();

export interface HistoryDeltaItem {
  index: number;
  stroke: Stroke;
}

export type HistoryEntry =
  | {
      type: 'snapshot';
      strokes: Stroke[];
    }
  | {
      type: 'delta';
      before: HistoryDeltaItem[];
      after: HistoryDeltaItem[];
    }
  | {
      type: 'key-state';
      before: KeyStateSnapshot;
      after: KeyStateSnapshot;
      trackId?: string;
      timestamp: number;
    }
  | {
      type: 'bars';
      before: number;
      after: number;
    };

// History stack (Undo / Redo)
const MAX_HISTORY = 40;
let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];

function emitHistoryChange() {
  events.emit('history:change', { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
}

export function pushHistorySnapshot() {
  undoStack.push({
    type: 'snapshot',
    strokes: state.strokes.map((s) => ({ ...s, points: [...s.points] })),
  });
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack = [];
  emitHistoryChange();
}

export function recordSnapshotHistory(beforeStrokes: Stroke[]) {
  undoStack.push({
    type: 'snapshot',
    strokes: beforeStrokes.map((s) => ({ ...s, points: [...s.points] })),
  });
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack = [];
  emitHistoryChange();
}

/**
 * Record a single discrete edit (e.g. one continuous eraser drag)
 * storing only affected original strokes and the resulting fragments.
 */
export function recordDeltaHistory(
  before: HistoryDeltaItem[],
  after: HistoryDeltaItem[]
) {
  if (before.length === 0 && after.length === 0) return;
  undoStack.push({
    type: 'delta',
    before: before.map((b) => ({
      index: b.index,
      stroke: { ...b.stroke, points: b.stroke.points.map((p) => ({ ...p })) },
    })),
    after: after.map((a) => ({
      index: a.index,
      stroke: { ...a.stroke, points: a.stroke.points.map((p) => ({ ...p })) },
    })),
  });
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack = [];
  emitHistoryChange();
}

/**
 * Record key state change (mode, root, scale, copy to all, match project).
 * Rapid clicks on the same colour within 600ms are merged into ONE undo step.
 */
export function recordKeyStateHistory(
  before: KeyStateSnapshot,
  after: KeyStateSnapshot,
  trackId?: string
) {
  const now = Date.now();
  if (undoStack.length > 0) {
    const top = undoStack[undoStack.length - 1];
    if (
      top.type === 'key-state' &&
      top.trackId === trackId &&
      now - top.timestamp <= 600
    ) {
      top.after = after;
      top.timestamp = now;
      redoStack = [];
      emitHistoryChange();
      return;
    }
  }

  undoStack.push({
    type: 'key-state',
    before,
    after,
    trackId,
    timestamp: now,
  });
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack = [];
  emitHistoryChange();
}

export function recordBarsHistory(before: number, after: number) {
  if (before === after) return;
  undoStack.push({
    type: 'bars',
    before,
    after,
  });
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack = [];
  emitHistoryChange();
}

export function undo() {
  if (undoStack.length === 0) return;
  const entry = undoStack.pop()!;

  if (entry.type === 'snapshot') {
    redoStack.push({
      type: 'snapshot',
      strokes: state.strokes.map((s) => ({ ...s, points: [...s.points] })),
    });
    state.strokes = entry.strokes;
    events.emit('strokes:updated', state.strokes);
  } else if (entry.type === 'delta') {
    // Delta undo: Remove 'after' fragments and re-insert 'before' original strokes
    redoStack.push(entry);
    const afterIds = new Set(entry.after.map((a) => a.stroke.id));
    const remaining = state.strokes.filter((s) => !afterIds.has(s.id));

    // Sort before items by original index ascending and re-insert
    const sortedBefore = [...entry.before].sort((a, b) => a.index - b.index);
    for (const item of sortedBefore) {
      const insertIdx = Math.max(0, Math.min(remaining.length, item.index));
      remaining.splice(insertIdx, 0, {
        ...item.stroke,
        points: item.stroke.points.map((p) => ({ ...p })),
      });
    }
    state.strokes = remaining;
    events.emit('strokes:updated', state.strokes);
  } else if (entry.type === 'key-state') {
    redoStack.push(entry);
    state.keyMode = entry.before.keyMode;
    state.rootNote = entry.before.baseRoot;
    state.scaleName = entry.before.baseScale;
    events.emit('key-state:restore', entry.before);
  } else if (entry.type === 'bars') {
    redoStack.push(entry);
    state.bars = entry.before;
    events.emit('bars:change', entry.before);
  }

  emitHistoryChange();
}

export function redo() {
  if (redoStack.length === 0) return;
  const entry = redoStack.pop()!;

  if (entry.type === 'snapshot') {
    undoStack.push({
      type: 'snapshot',
      strokes: state.strokes.map((s) => ({ ...s, points: [...s.points] })),
    });
    state.strokes = entry.strokes;
    events.emit('strokes:updated', state.strokes);
  } else if (entry.type === 'delta') {
    // Delta redo: Remove 'before' original strokes and re-insert 'after' fragments
    undoStack.push(entry);
    const beforeIds = new Set(entry.before.map((b) => b.stroke.id));
    const remaining = state.strokes.filter((s) => !beforeIds.has(s.id));

    const sortedAfter = [...entry.after].sort((a, b) => a.index - b.index);
    for (const item of sortedAfter) {
      const insertIdx = Math.max(0, Math.min(remaining.length, item.index));
      remaining.splice(insertIdx, 0, {
        ...item.stroke,
        points: item.stroke.points.map((p) => ({ ...p })),
      });
    }
    state.strokes = remaining;
    events.emit('strokes:updated', state.strokes);
  } else if (entry.type === 'key-state') {
    undoStack.push(entry);
    state.keyMode = entry.after.keyMode;
    state.rootNote = entry.after.baseRoot;
    state.scaleName = entry.after.baseScale;
    events.emit('key-state:restore', entry.after);
  } else if (entry.type === 'bars') {
    undoStack.push(entry);
    state.bars = entry.after;
    events.emit('bars:change', entry.after);
  }

  emitHistoryChange();
}


export function clearStrokes() {
  if (state.strokes.length === 0) return;
  pushHistorySnapshot();
  state.strokes = [];
  events.emit('strokes:updated', state.strokes);
  emitHistoryChange();
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

export function clearHistory(): void {
  undoStack = [];
  redoStack = [];
  emitHistoryChange();
}

export function setSelectedStrokeIds(ids: string[]): void {
  state.selectedStrokeIds = ids;
  events.emit('selection:change', state.selectedStrokeIds);
}

export function clearSelection(): void {
  if (state.selectedStrokeIds.length === 0) return;
  state.selectedStrokeIds = [];
  events.emit('selection:change', []);
}

export function toggleStrokeSelection(id: string): void {
  const idx = state.selectedStrokeIds.indexOf(id);
  if (idx >= 0) {
    state.selectedStrokeIds = state.selectedStrokeIds.filter((sId) => sId !== id);
  } else {
    state.selectedStrokeIds = [...state.selectedStrokeIds, id];
  }
  events.emit('selection:change', state.selectedStrokeIds);
}

export function selectAllStrokes(trackIdOnly?: string): void {
  const eligible = trackIdOnly
    ? state.strokes.filter((s) => s.trackId === trackIdOnly)
    : state.strokes;
  state.selectedStrokeIds = eligible.map((s) => s.id);
  events.emit('selection:change', state.selectedStrokeIds);
}

// In-memory clipboard for strokes
let strokeClipboard: Stroke[] = [];

export function getStrokeClipboard(): Stroke[] {
  return strokeClipboard.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p })),
  }));
}

export function setStrokeClipboard(strokes: Stroke[]): void {
  strokeClipboard = strokes.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p })),
  }));
  events.emit('clipboard:change', strokeClipboard.length > 0);
}

export function hasStrokeClipboard(): boolean {
  return strokeClipboard.length > 0;
}

export function clearStrokeClipboard(): void {
  strokeClipboard = [];
  events.emit('clipboard:change', false);
}

