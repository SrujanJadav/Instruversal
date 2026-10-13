import { describe, it, expect } from 'vitest';
import { MASTERING_PRESETS, detectPresetMatch, autoBalanceSong } from './presets';
import { Song } from './types';
import { ProjectData } from '../library/types';

describe('presets & autoBalanceSong', () => {
  const dummyProjectMelody: ProjectData = {
    version: 3,
    bpm: 110,
    bars: 2,
    rootNote: 0,
    scaleName: 'major pentatonic',
    playbackMode: 'notes',
    glide: 0,
    tracks: [
      {
        id: 't-1',
        name: 'Pluck',
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
      },
    ],
    strokes: [],
  };

  const dummyProjectBeat: ProjectData = {
    version: 3,
    bpm: 110,
    bars: 2,
    rootNote: 0,
    scaleName: 'major pentatonic',
    playbackMode: 'notes',
    glide: 0,
    tracks: [
      {
        id: 't-2',
        name: 'Drums',
        trackType: 'beat',
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
      },
    ],
    strokes: [],
  };

  const sampleSong: Song = {
    id: 's-1',
    title: 'Test Song',
    bpm: 110,
    beatsPerBar: 4,
    totalBars: 16,
    schemaVersion: 1,
    createdAt: 1000,
    updatedAt: 1000,
    lanes: [
      { id: 'lane-1', name: 'Melody', volumeDb: 2, pan: 0, mute: false, solo: false, sendReverb: 0, sendDelay: 0 },
      { id: 'lane-2', name: 'Drums', volumeDb: 3, pan: 0.5, mute: false, solo: false, sendReverb: 0, sendDelay: 0 },
    ],
    assets: {
      'a-melody': { name: 'Melody', project: dummyProjectMelody },
      'a-beat': { name: 'Drums', project: dummyProjectBeat },
    },
    placements: [
      { id: 'p-1', assetId: 'a-melody', laneId: 'lane-1', startBar: 0, lengthBars: 4, offsetBars: 0, gainDb: 0, transpose: 0, fadeInBars: 0, fadeOutBars: 0, mute: false },
      { id: 'p-2', assetId: 'a-beat', laneId: 'lane-2', startBar: 0, lengthBars: 4, offsetBars: 0, gainDb: 0, transpose: 0, fadeInBars: 0, fadeOutBars: 0, mute: false },
    ],
    markers: [],
    loopRegion: null,
    master: {
      preset: 'clean',
      gainDb: 0,
      eq: { lowDb: 0, midDb: 0, highDb: 0 },
      compressor: { on: true, thresholdDb: -18, ratio: 2.5, attackMs: 30, releaseMs: 100, makeupDb: 0 },
      effects: {} as any,
    },
  };

  it('defines valid mastering presets with required parameter ranges', () => {
    const keys = Object.keys(MASTERING_PRESETS) as Array<keyof typeof MASTERING_PRESETS>;
    expect(keys).toContain('clean');
    expect(keys).toContain('warm');
    expect(keys).toContain('bright');
    expect(keys).toContain('loud');
    expect(keys).toContain('lo-fi');

    for (const k of keys) {
      const p = MASTERING_PRESETS[k];
      expect(p.eq.lowDb).toBeGreaterThanOrEqual(-12);
      expect(p.eq.lowDb).toBeLessThanOrEqual(12);
      expect(p.compressor.thresholdDb).toBeGreaterThanOrEqual(-40);
      expect(p.compressor.thresholdDb).toBeLessThanOrEqual(0);
      expect(p.compressor.ratio).toBeGreaterThanOrEqual(1);
      expect(p.compressor.ratio).toBeLessThanOrEqual(20);
    }
  });

  it('detects preset match accurately', () => {
    expect(detectPresetMatch(sampleSong.master)).toBe('clean');

    const modified = {
      ...sampleSong.master,
      eq: { ...sampleSong.master.eq, lowDb: 5 },
    };
    expect(detectPresetMatch(modified)).toBe('custom');
  });

  it('balances lane levels and ensures master headroom', () => {
    const { song: balanced, explanation } = autoBalanceSong(sampleSong);
    expect(explanation).toContain('Balanced 2 lanes');

    const melodyLane = balanced.lanes.find((l) => l.id === 'lane-1');
    const drumLane = balanced.lanes.find((l) => l.id === 'lane-2');

    expect(melodyLane?.volumeDb).toBe(0);
    expect(drumLane?.volumeDb).toBe(-2.0);
    expect(drumLane?.pan).toBe(0); // Centered drums
    expect(balanced.master.gainDb).toBeLessThanOrEqual(-1.5);
  });
});
