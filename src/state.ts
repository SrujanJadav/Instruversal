import { CONFIG } from './config';
import { ScaleName } from './audio/scales';

export type Pt = {
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
  t: number; // ms since stroke start
};

export type Stroke = {
  id: string;
  trackId: string;
  points: Pt[];
  width: number;
};

export type ToolMode = 'draw' | 'eraser';

export type EventMap = {
  'audio:started': void;
  'transport:play': void;
  'transport:pause': void;
  'bpm:change': number;
  'scale:change': { rootNote: number; scaleName: ScaleName };
  'track:select': string;
  'tool:change': ToolMode;
  'history:change': { canUndo: boolean; canRedo: boolean };
  'note:hit': {
    strokeId?: string;
    trackId: string;
    midi: number;
    x: number;
    y: number;
  };
  'stroke:added': Stroke;
  'strokes:updated': Stroke[];
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
  activeTool: ToolMode;
  strokes: Stroke[];
}

export const state: AppState = {
  audioStarted: false,
  isPlaying: false,
  bpm: CONFIG.defaultBpm,
  bars: CONFIG.defaultBars,
  selectedTrackId: 'track-1',
  rootNote: 0, // C
  scaleName: 'major pentatonic',
  activeTool: 'draw',
  strokes: [],
};

export const events = new TinyEmitter();

// History stack (Undo / Redo)
const MAX_HISTORY = 40;
let undoStack: Stroke[][] = [];
let redoStack: Stroke[][] = [];

function emitHistoryChange() {
  events.emit('history:change', { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
}

export function pushHistorySnapshot() {
  undoStack.push(state.strokes.map((s) => ({ ...s, points: [...s.points] })));
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack = [];
  emitHistoryChange();
}

export function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(state.strokes.map((s) => ({ ...s, points: [...s.points] })));
  const previous = undoStack.pop()!;
  state.strokes = previous;
  events.emit('strokes:updated', state.strokes);
  emitHistoryChange();
}

export function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(state.strokes.map((s) => ({ ...s, points: [...s.points] })));
  const next = redoStack.pop()!;
  state.strokes = next;
  events.emit('strokes:updated', state.strokes);
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
