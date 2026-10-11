import { CONFIG } from './config';

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

import { ScaleName } from './audio/scales';

export type EventMap = {
  'audio:started': void;
  'transport:play': void;
  'transport:pause': void;
  'bpm:change': number;
  'scale:change': { rootNote: number; scaleName: ScaleName };
  'track:select': string;
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
  strokes: [],
};

export const events = new TinyEmitter();
