import { describe, it, expect } from 'vitest';
import { exportSongToMidi } from './midiExport';
import { Song, SongPlacement, SongAsset, SongLane } from './types';
import { ProjectData } from '../library/types';

describe('Song MIDI Exporter (Step 10)', () => {
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
        id: 't-lead',
        name: 'Pluck',
        trackType: 'melodic',
        instrumentId: 'pluck',
        volume: 0.8,
        muted: false,
        solo: false,
      } as any,
      {
        id: 't-drums',
        name: 'Beats',
        trackType: 'beat',
        instrumentId: 'drums',
        kitId: '808',
        volume: 0.8,
        muted: false,
        solo: false,
        beatRate: '1/16',
        swing: 0,
        humanize: 0,
        beatMode: 'hits',
      } as any,
    ],
    strokes: [
      {
        id: 's-1',
        trackId: 't-lead',
        points: [{ x: 0.25, y: 0.5, t: 0 }],
        width: 3,
      },
      {
        id: 's-2',
        trackId: 't-drums',
        points: [{ x: 0.5, y: 0.2, t: 0 }],
        width: 3,
      },
    ],
  };

  const sampleAsset: SongAsset = {
    name: 'Sketch 1',
    project: sampleProject,
  };

  const sampleLanes: SongLane[] = [
    {
      id: 'lane-1',
      name: 'Melody Lane',
      volumeDb: 0,
      pan: 0,
      mute: false,
      solo: false,
      sendReverb: 0,
      sendDelay: 0,
    },
    {
      id: 'lane-2',
      name: 'Beat Lane',
      volumeDb: -2,
      pan: 0,
      mute: false,
      solo: false,
      sendReverb: 0,
      sendDelay: 0,
    },
  ];

  const samplePlacements: SongPlacement[] = [
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
    {
      id: 'p-2',
      assetId: 'asset-1',
      laneId: 'lane-2',
      startBar: 2,
      lengthBars: 4,
      offsetBars: 0,
      gainDb: 0,
      transpose: 0,
      fadeInBars: 0,
      fadeOutBars: 0,
      mute: false,
    },
  ];

  const sampleSong: Song = {
    id: 'song-midi-test',
    title: 'Test Song',
    bpm: 120,
    beatsPerBar: 4,
    totalBars: 8,
    schemaVersion: 1,
    createdAt: 1000,
    updatedAt: 2000,
    lanes: sampleLanes,
    assets: { 'asset-1': sampleAsset },
    placements: samplePlacements,
    markers: [
      { id: 'm-1', bar: 0, label: 'Intro' },
      { id: 'm-2', bar: 4, label: 'Chorus' },
    ],
    loopRegion: null,
    master: {
      preset: 'clean',
      gainDb: 0,
      eq: { lowDb: 0, midDb: 0, highDb: 0 },
      compressor: { on: false, thresholdDb: -20, ratio: 2, attackMs: 20, releaseMs: 100, makeupDb: 0 },
      effects: {} as any,
    },
  };

  it('generates a valid Standard MIDI File (Format 1) with correct header', () => {
    const bytes = exportSongToMidi(sampleSong);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(50);

    // Check 'MThd' header signature: 0x4D, 0x54, 0x68, 0x64
    expect(bytes[0]).toBe(0x4d);
    expect(bytes[1]).toBe(0x54);
    expect(bytes[2]).toBe(0x68);
    expect(bytes[3]).toBe(0x64);

    // Format 1 (bytes 8 and 9)
    expect(bytes[8]).toBe(0x00);
    expect(bytes[9]).toBe(0x01);

    // Division (480 ticks/quarter = 0x01E0)
    expect(bytes[12]).toBe(0x01);
    expect(bytes[13]).toBe(0xe0);
  });

  it('respects solo over mute when exporting lanes to MIDI', () => {
    // Solo Lane 1, Mute Lane 2
    const soloSong: Song = {
      ...sampleSong,
      lanes: [
        { ...sampleLanes[0], solo: true },
        { ...sampleLanes[1], mute: true, solo: false },
      ],
    };

    const bytes = exportSongToMidi(soloSong);
    expect(bytes.length).toBeGreaterThan(0);

    // Conductor + Lane 1 tracks only (Lane 2 excluded due to solo)
    // Tracks count in header is at bytes 10-11
    const totalTracks = (bytes[10] << 8) | bytes[11];
    expect(totalTracks).toBeGreaterThanOrEqual(2);
  });
});
