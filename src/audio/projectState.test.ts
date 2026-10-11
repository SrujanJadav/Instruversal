import { describe, it, expect, beforeEach } from 'vitest';
import {
  serializeProject,
  deserializeProject,
  PROJECT_STORAGE_KEY,
  saveProject,
  loadSavedProject,
} from './projectState';
import { Track } from './tracks';

// Polyfill localStorage for node test runner
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    length: 0,
  } as Storage;
}

function createMockTrack(overrides: Partial<Track> = {}): Track {
  const mockTrack: any = {
    id: 'track-6',
    name: 'Drums',
    colorVar: '--slate',
    colorHex: '#4A5560',
    trackType: 'beat',
    instrumentId: 'pluck',
    kitId: '808',
    volume: 0.8,
    muted: false,
    solo: false,
    beatRate: '1/16',
    swing: 0,
    humanize: 15,
    beatMode: 'hits',
    beatFlowStyle: 'glide',
    beatRollVoice: 'snare',
    beatSweepCharacter: 'shaker',
    channel: {} as any,
    gain: {} as any,
    audition: () => {},
    triggerNote: () => {},
    triggerDrum: () => {},
    setInstrument: () => {},
    setKit: () => {},
    setTrackType: () => {},
    setBeatMode(mode: any) { this.beatMode = mode; },
    setBeatFlowStyle(style: any) { this.beatFlowStyle = style; },
    setBeatRollVoice(voice: any) { this.beatRollVoice = voice; },
    setBeatSweepCharacter(char: any) { this.beatSweepCharacter = char; },
    setVolume: () => {},
    setMuted: () => {},
    setSoloed: () => {},
    shouldPlay: () => true,
    dispose: () => {},
    ...overrides,
  };
  return mockTrack as Track;
}

describe('projectState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('serializes and deserializes beat Flow mode and styles accurately', () => {
    const track = createMockTrack({
      beatMode: 'flow',
      beatFlowStyle: 'roll',
      beatRollVoice: 'hat',
    });

    const project = serializeProject([track]);
    expect(project.version).toBe(1);

    const serializedBeatTrack = project.tracks.find((t) => t.id === 'track-6');
    expect(serializedBeatTrack).toBeDefined();
    expect(serializedBeatTrack?.beatMode).toBe('flow');
    expect(serializedBeatTrack?.beatFlowStyle).toBe('roll');
    expect(serializedBeatTrack?.beatRollVoice).toBe('hat');

    // Mutate and restore
    track.beatMode = 'hits';
    track.beatFlowStyle = 'glide';
    expect(track.beatMode).toBe('hits');

    const success = deserializeProject(project, [track]);
    expect(success).toBe(true);
    expect(track.beatMode).toBe('flow');
    expect(track.beatFlowStyle).toBe('roll');
    expect(track.beatRollVoice).toBe('hat');
  });

  it('saves and loads from localStorage correctly', () => {
    const track = createMockTrack({
      beatMode: 'flow',
      beatFlowStyle: 'sweep',
      beatSweepCharacter: 'hat',
    });

    saveProject([track]);

    const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(stored).toContain('"beatMode":"flow"');
    expect(stored).toContain('"beatFlowStyle":"sweep"');

    // Reset and reload
    track.beatMode = 'hits';
    loadSavedProject([track]);

    expect(track.beatMode).toBe('flow');
    expect(track.beatFlowStyle).toBe('sweep');
    expect(track.beatSweepCharacter).toBe('hat');
  });
});
