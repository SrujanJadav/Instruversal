import { CONFIG } from './config';

export type EventMap = {
  'audio:started': void;
  'transport:play': void;
  'transport:pause': void;
  'bpm:change': number;
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
      set.forEach((fn) => fn(data));
    }
  }
}

export interface AppState {
  audioStarted: boolean;
  isPlaying: boolean;
  bpm: number;
  bars: number;
}

export const state: AppState = {
  audioStarted: false,
  isPlaying: false,
  bpm: CONFIG.defaultBpm,
  bars: CONFIG.defaultBars,
};

export const events = new TinyEmitter();
