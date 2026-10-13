import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SongPlaybackEngine } from './playbackEngine';
import { Song, SongPlacement, SongAsset, SongLane } from './types';
import { ProjectData } from '../library/types';

describe('SongPlaybackEngine', () => {
  const sampleProject: ProjectData = {
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
        name: 'Track 1',
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
    strokes: [
      {
        id: 's-1',
        trackId: 't-1',
        points: [{ x: 0.2, y: 0.5, t: 0 }],
        width: 3,
      },
    ],
  };

  const sampleAsset: SongAsset = {
    name: 'Sketch 1',
    project: sampleProject,
  };

  const sampleLane: SongLane = {
    id: 'lane-1',
    name: 'Lane 1',
    volumeDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    sendReverb: 0,
    sendDelay: 0,
  };

  const samplePlacement: SongPlacement = {
    id: 'p-1',
    assetId: 'asset-1',
    laneId: 'lane-1',
    startBar: 2,
    lengthBars: 4,
    offsetBars: 0,
    gainDb: 0,
    transpose: 0,
    fadeInBars: 0,
    fadeOutBars: 0,
    mute: false,
  };

  const sampleSong: Song = {
    id: 'song-test',
    title: 'Test Song',
    bpm: 110,
    beatsPerBar: 4,
    totalBars: 16,
    schemaVersion: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lanes: [sampleLane],
    assets: { 'asset-1': sampleAsset },
    placements: [samplePlacement],
    markers: [],
    loopRegion: null,
    master: {
      preset: 'clean',
      gainDb: 0,
      eq: { lowDb: 0, midDb: 0, highDb: 0 },
      compressor: { on: false, thresholdDb: -20, ratio: 4, attackMs: 10, releaseMs: 100, makeupDb: 0 },
      effects: {} as any,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('configures SongPlaybackEngine on initialization', () => {
    const engine = new SongPlaybackEngine(sampleSong);
    expect(engine).toBeDefined();
    expect(engine.isPlaying()).toBe(false);

    engine.dispose();
  });

  it('seeks accurately and invokes playhead tick callbacks', () => {
    let lastBar = 0;
    let lastBeat = 0;
    let lastSec = 0;

    const engine = new SongPlaybackEngine(sampleSong, {
      onPlayheadTick: (bar, beat, sec) => {
        lastBar = bar;
        lastBeat = beat;
        lastSec = sec;
      },
    });

    engine.seek(4); // Bar 4 = 1-indexed Bar 5
    expect(lastBar).toBe(5);
    expect(lastBeat).toBe(1);
    expect(lastSec).toBeGreaterThan(0);

    engine.dispose();
  });

  it('manages windowed placement parts without leaks', () => {
    const farPlacement: SongPlacement = {
      ...samplePlacement,
      id: 'p-far',
      startBar: 20,
      lengthBars: 4,
    };

    const songWithFar = {
      ...sampleSong,
      placements: [samplePlacement, farPlacement],
    };

    const engine = new SongPlaybackEngine(songWithFar);

    // At bar 0, samplePlacement (bar 2-6) is in window [0 - 0.5, 0 + 4] = [-0.5, 4]
    // farPlacement (bar 20-24) is NOT in window
    engine.updateWindow(0);

    // Now seek to bar 20
    engine.seek(20);
    // At bar 20, farPlacement is in window, samplePlacement is outside
    engine.updateWindow(20);

    // Dispose cleanly
    engine.dispose();
    expect(engine.isPlaying()).toBe(false);
  });
});
