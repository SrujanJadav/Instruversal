import { describe, it, expect } from 'vitest';
import { buildSongPreview } from './preview';
import { SONG_LIMITS } from './types';
import { createSongFromCreation } from './helpers';
import { Creation } from '../library/types';

describe('Song Preview Builder (src/song/preview.ts)', () => {
  const mockCreation: Creation = {
    id: 'c-1',
    title: 'Warm Melody',
    createdAt: 1000,
    updatedAt: 2000,
    schemaVersion: 3,
    project: {
      version: 3,
      bpm: 96,
      bars: 4,
      rootNote: 0,
      scaleName: 'major pentatonic',
      playbackMode: 'flow',
      glide: 30,
      tracks: [
        {
          id: 'track-1',
          name: 'Vermilion',
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
        {
          id: 'track-2',
          name: 'Indigo',
          trackType: 'melodic',
          instrumentId: 'bowed',
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
          id: 's-1',
          trackId: 'track-2',
          width: 3,
          points: [
            { x: 0.1, y: 0.2, t: 0 },
            { x: 0.3, y: 0.4, t: 20 },
          ],
        },
        {
          id: 's-2',
          trackId: 'track-2',
          width: 3,
          points: [{ x: 0.5, y: 0.5, t: 0 }],
        },
        {
          id: 's-3',
          trackId: 'track-1',
          width: 3,
          points: [{ x: 0.8, y: 0.8, t: 0 }],
        },
      ],
    },
  };

  it('generates compact preview with accurate block positions and colors', () => {
    const song = createSongFromCreation(mockCreation);
    const preview = buildSongPreview(song);

    expect(preview.bpm).toBe(96);
    expect(preview.totalBars).toBe(4);
    expect(preview.lanesCount).toBe(1);
    expect(preview.blocks.length).toBe(1);

    // Track-2 has 2 strokes, Track-1 has 1 stroke -> primary color should be --indigo
    expect(preview.blocks[0].color).toBe('--indigo');
    expect(preview.blocks[0].startBar).toBe(0);
    expect(preview.blocks[0].lengthBars).toBe(4);
  });

  it('guarantees preview size is strictly under 20,480 bytes', () => {
    const song = createSongFromCreation(mockCreation);
    // Add 150 placements to simulate a very dense arrangement
    for (let i = 0; i < 150; i++) {
      song.placements.push({
        id: `p-${i}`,
        assetId: 'asset-1',
        laneId: 'lane-1',
        startBar: i % 100,
        lengthBars: 2,
        offsetBars: 0,
        gainDb: 0,
        transpose: 0,
        fadeInBars: 0,
        fadeOutBars: 0,
        mute: false,
      });
    }

    const preview = buildSongPreview(song);
    const serialized = JSON.stringify(preview);
    const byteLength = new TextEncoder().encode(serialized).length;

    expect(byteLength).toBeLessThanOrEqual(SONG_LIMITS.MAX_PREVIEW_BYTES);
  });
});
