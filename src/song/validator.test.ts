import { describe, it, expect } from 'vitest';
import { validateSong, migrateSong } from './validator';
import { SerializedProject } from '../audio/projectState';

function createMockProject(): SerializedProject {
  return {
    version: 3,
    bpm: 100,
    bars: 2,
    rootNote: 0,
    scaleName: 'major pentatonic',
    playbackMode: 'flow',
    glide: 30,
    tracks: [
      {
        id: 'track-1',
        name: 'Pluck',
        trackType: 'melodic',
        instrumentId: 'pluck',
        kitId: '808',
        beatRate: '1/16',
        swing: 0,
        humanize: 15,
        beatMode: 'hits',
        beatFlowStyle: 'glide',
        beatRollVoice: 'snare',
        beatSweepCharacter: 'shaker',
        muted: false,
        solo: false,
        volume: 0.8,
      },
    ],
    strokes: [
      {
        id: 'stroke-1',
        trackId: 'track-1',
        width: 3,
        points: [
          { x: 0.1, y: 0.5, t: 0 },
          { x: 0.3, y: 0.5, t: 50 },
        ],
      },
    ],
  };
}

describe('Song Validator (src/song/validator.ts)', () => {
  it('validates a well-formed song', () => {
    const rawSong = {
      schemaVersion: 1,
      id: 'song-test-1',
      title: 'Summer Breeze',
      bpm: 120,
      beatsPerBar: 4,
      assets: {
        'asset-1': {
          name: 'Intro Hook',
          project: createMockProject(),
        },
      },
      lanes: [
        {
          id: 'lane-1',
          name: 'Melody',
          volumeDb: -3,
          pan: 0,
          mute: false,
          solo: false,
          sendReverb: 0.2,
          sendDelay: 0.1,
        },
      ],
      placements: [
        {
          id: 'p-1',
          assetId: 'asset-1',
          laneId: 'lane-1',
          startBar: 0,
          lengthBars: 4,
          offsetBars: 0,
          gainDb: 0,
          transpose: 0,
          fadeInBars: 0,
          fadeOutBars: 0,
          mute: false,
        },
      ],
      markers: [{ id: 'm-1', bar: 0, label: 'Intro' }],
    };

    const res = validateSong(rawSong);
    expect(res.isValid).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data?.title).toBe('Summer Breeze');
    expect(res.data?.bpm).toBe(120);
    expect(res.data?.totalBars).toBe(4);
    expect(res.data?.lanes.length).toBe(1);
    expect(res.data?.placements.length).toBe(1);
  });

  it('rejects non-object or hostile primitive input gracefully without crashing', () => {
    expect(validateSong(null).isValid).toBe(false);
    expect(validateSong(undefined).isValid).toBe(false);
    expect(validateSong('string').isValid).toBe(false);
    expect(validateSong(12345).isValid).toBe(false);
    expect(validateSong([]).isValid).toBe(false);
  });

  it('rejects oversized songs (> 3 MB)', () => {
    // Generate a huge payload
    const hugeProject = createMockProject();
    const lotsOfPoints = [];
    for (let i = 0; i < 60000; i++) {
      lotsOfPoints.push({ x: 0.5, y: 0.5, t: i });
    }
    hugeProject.strokes = [
      {
        id: 'huge',
        trackId: 'track-1',
        width: 2,
        points: lotsOfPoints,
      },
    ];

    const assets: Record<string, any> = {};
    for (let i = 0; i < 8; i++) {
      assets[`asset-${i}`] = {
        name: `Asset ${i}`,
        project: hugeProject,
      };
    }

    const hugeSong = {
      title: 'Giant Song',
      assets,
    };

    const res = validateSong(hugeSong);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('exceeds maximum allowed size');
  });

  it('clamps BPM within bounds (50 to 180)', () => {
    const resLow = validateSong({ bpm: 20 });
    expect(resLow.isValid).toBe(true);
    expect(resLow.data?.bpm).toBe(50);

    const resHigh = validateSong({ bpm: 300 });
    expect(resHigh.isValid).toBe(true);
    expect(resHigh.data?.bpm).toBe(180);
  });

  it('enforces limits: max 6 lanes, max 12 assets, max 200 placements, max 40 markers', () => {
    const rawLanes = Array.from({ length: 15 }, (_, i) => ({
      id: `lane-${i}`,
      name: `Lane ${i}`,
    }));

    const rawAssets: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      rawAssets[`asset-${i}`] = {
        name: `Asset ${i}`,
        project: createMockProject(),
      };
    }

    const rawPlacements = Array.from({ length: 300 }, (_, i) => ({
      id: `p-${i}`,
      assetId: 'asset-0',
      laneId: 'lane-0',
      startBar: i,
      lengthBars: 2,
    }));

    const rawMarkers = Array.from({ length: 60 }, (_, i) => ({
      id: `m-${i}`,
      bar: i,
      label: `Marker ${i}`,
    }));

    const res = validateSong({
      lanes: rawLanes,
      assets: rawAssets,
      placements: rawPlacements,
      markers: rawMarkers,
    });

    expect(res.isValid).toBe(true);
    expect(res.data?.lanes.length).toBe(6);
    expect(Object.keys(res.data?.assets || {}).length).toBe(12);
    expect(res.data?.placements.length).toBe(200);
    expect(res.data?.markers.length).toBe(40);
  });

  it('drops placements referencing non-existent assets', () => {
    const res = validateSong({
      assets: {
        'asset-valid': {
          name: 'Valid',
          project: createMockProject(),
        },
      },
      placements: [
        { id: 'p-1', assetId: 'asset-valid', laneId: 'lane-1', startBar: 0, lengthBars: 2 },
        { id: 'p-ghost', assetId: 'ghost-asset', laneId: 'lane-1', startBar: 2, lengthBars: 2 },
      ],
    });

    expect(res.isValid).toBe(true);
    expect(res.data?.placements.length).toBe(1);
    expect(res.data?.placements[0].id).toBe('p-1');
  });

  it('migrates legacy song schema without errors', () => {
    const legacy = {
      title: 'Old Song',
      bpm: 110,
    };
    const migrated = migrateSong(legacy);
    expect(migrated.schemaVersion).toBe(1);
  });
});
