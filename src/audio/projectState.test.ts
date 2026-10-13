import { describe, it, expect, beforeEach } from 'vitest';
import {
  serializeProject,
  deserializeProject,
  PROJECT_STORAGE_KEY,
  saveProject,
  loadSavedProject,
} from './projectState';
import { Track } from './tracks';
import { state } from '../state';

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
    key: undefined,
    setKey(k: any) { this.key = k; },
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
    expect(project.version).toBe(3);

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

  it('backwards compatibility: cleanly loads legacy v1 project without keyMode as linked and sounds identical', async () => {
    const { state } = await import('../state');
    const { effectiveKey, yToMidi } = await import('./scales');

    const melodicTrack = createMockTrack({
      id: 'track-1',
      name: 'Vermilion',
      trackType: 'melodic',
      instrumentId: 'pluck',
      key: undefined,
    });

    // Simulating pre-22B project JSON
    const legacyProject: any = {
      version: 1,
      bpm: 110,
      bars: 2,
      rootNote: 7, // G
      scaleName: 'minor pentatonic',
      playbackMode: 'flow',
      glide: 30,
      tracks: [
        {
          id: 'track-1',
          name: 'Vermilion',
          trackType: 'melodic',
          instrumentId: 'pluck',
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
          beatSweepCharacter: 'shaker',
          // Note: no key field
        },
      ],
      strokes: [],
    };

    const success = deserializeProject(legacyProject, [melodicTrack]);
    expect(success).toBe(true);
    expect(state.keyMode).toBe('linked');
    expect(state.rootNote).toBe(7);
    expect(state.scaleName).toBe('minor pentatonic');
    expect(melodicTrack.key).toBeUndefined();

    // Verify effectiveKey returns project key and notes are 100% identical
    const eff = effectiveKey(melodicTrack, state);
    expect(eff).toEqual({ root: 7, scale: 'minor pentatonic' });

    const notesFromEff = (await import('./scales')).buildScaleNotes(eff.root, eff.scale);
    const notesFromProj = (await import('./scales')).buildScaleNotes(state.rootNote, state.scaleName);
    const midiFromEff = yToMidi(0.5, notesFromEff);
    const midiFromProject = yToMidi(0.5, notesFromProj);
    expect(midiFromEff).toBe(midiFromProject);
  });

  it('sanitizes malformed keyMode, rootNote, scaleName, and track keys safely', async () => {
    const { state } = await import('../state');

    const melodicTrack = createMockTrack({
      id: 'track-1',
      trackType: 'melodic',
    });
    const beatTrack = createMockTrack({
      id: 'track-6',
      trackType: 'beat',
    });

    const malformedProject: any = {
      version: 2,
      bpm: 90,
      bars: 2,
      rootNote: 29, // Out of range, should modulo to 5 (F)
      scaleName: 'totally-invalid-scale', // Should be ignored/preserved safely
      keyMode: 'invalid-mode', // Should fall back to 'linked'
      playbackMode: 'flow',
      glide: 0,
      tracks: [
        {
          id: 'track-1',
          name: 'Vermilion',
          trackType: 'melodic',
          instrumentId: 'pluck',
          key: { root: 15, scale: 'major pentatonic' }, // 15 should normalize to 3 (D#)
        },
        {
          id: 'track-6',
          name: 'Drums',
          trackType: 'beat',
          kitId: '808',
          key: { root: 0, scale: 'major' }, // Beat track key should be ignored/cleared
        },
      ],
      strokes: [],
    };

    const success = deserializeProject(malformedProject, [melodicTrack, beatTrack]);
    expect(success).toBe(true);
    expect(state.keyMode).toBe('linked');
    expect(state.rootNote).toBe(5); // ((29 % 12) + 12) % 12
    expect(melodicTrack.key).toEqual({ root: 3, scale: 'major pentatonic' });
    expect(beatTrack.key).toBeUndefined();
  });

  it('serializes bars and falls back to 2 bars for legacy projects without bars', () => {
    state.bars = 4;
    const track = createMockTrack();
    const project = serializeProject([track]);
    expect(project.bars).toBe(4);
    expect(project.version).toBe(3);

    // Restore to 1
    state.bars = 1;
    deserializeProject(project, [track]);
    expect(state.bars).toBe(4);

    // Legacy project without bars property defaults to 2
    const legacyProject: any = {
      version: 2,
      bpm: 100,
      rootNote: 0,
      scaleName: 'major',
      tracks: [],
      strokes: [],
    };
    deserializeProject(legacyProject, [track]);
    expect(state.bars).toBe(2);

    // Invalid bars count (e.g. 5) defaults to 2
    const invalidBarsProject: any = {
      version: 3,
      bpm: 100,
      bars: 5,
      tracks: [],
      strokes: [],
    };
    deserializeProject(invalidBarsProject, [track]);
    expect(state.bars).toBe(2);
  });
});
