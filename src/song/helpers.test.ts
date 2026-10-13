import { describe, it, expect } from 'vitest';
import {
  songLengthBars,
  hasPlacementOverlap,
  findFreeSlot,
  splitPlacement,
  trimPlacementLeft,
  trimPlacementRight,
  createSongFromCreation,
  addAsset,
  removeUnusedAssets,
} from './helpers';
import { SongPlacement } from './types';
import { Creation } from '../library/types';

describe('Song Helpers (src/song/helpers.ts)', () => {
  const samplePlacement: SongPlacement = {
    id: 'p-1',
    assetId: 'asset-1',
    laneId: 'lane-1',
    startBar: 4,
    lengthBars: 4,
    offsetBars: 0,
    gainDb: 0,
    transpose: 0,
    fadeInBars: 0,
    fadeOutBars: 0,
    mute: false,
  };

  it('calculates songLengthBars accurately', () => {
    const len = songLengthBars({
      placements: [
        { ...samplePlacement, startBar: 0, lengthBars: 4 },
        { ...samplePlacement, id: 'p-2', startBar: 8, lengthBars: 4 },
      ],
      markers: [{ id: 'm-1', bar: 15, label: 'Outro' }],
    });
    // Max is 16 bars (marker at bar 15 means 16 bars total)
    expect(len).toBe(16);
  });

  describe('hasPlacementOverlap', () => {
    const existing: SongPlacement[] = [
      { ...samplePlacement, id: 'p-a', laneId: 'lane-1', startBar: 2, lengthBars: 4 }, // bars 2 to 6
    ];

    it('detects overlap on the same lane', () => {
      // Overlaps at bar 3 to 5
      expect(
        hasPlacementOverlap(existing, { id: 'p-b', laneId: 'lane-1', startBar: 3, lengthBars: 2 })
      ).toBe(true);

      // Overlaps at head
      expect(
        hasPlacementOverlap(existing, { id: 'p-c', laneId: 'lane-1', startBar: 1, lengthBars: 3 })
      ).toBe(true);
    });

    it('allows adjacent placements without overlap', () => {
      // Exactly touches at bar 6 (end of p-a)
      expect(
        hasPlacementOverlap(existing, { id: 'p-adj-right', laneId: 'lane-1', startBar: 6, lengthBars: 2 })
      ).toBe(false);

      // Exactly ends at bar 2 (start of p-a)
      expect(
        hasPlacementOverlap(existing, { id: 'p-adj-left', laneId: 'lane-1', startBar: 0, lengthBars: 2 })
      ).toBe(false);
    });

    it('allows identical bar ranges on different lanes', () => {
      expect(
        hasPlacementOverlap(existing, { id: 'p-other-lane', laneId: 'lane-2', startBar: 2, lengthBars: 4 })
      ).toBe(false);
    });
  });

  describe('findFreeSlot', () => {
    const placements: SongPlacement[] = [
      { ...samplePlacement, id: 'p-1', laneId: 'lane-1', startBar: 0, lengthBars: 4 }, // 0 to 4
      { ...samplePlacement, id: 'p-2', laneId: 'lane-1', startBar: 6, lengthBars: 4 }, // 6 to 10
    ];

    it('finds free gap between existing placements if length fits', () => {
      // Gap is bars 4 to 6 (length 2)
      const slot = findFreeSlot(placements, 'lane-1', 4, 2);
      expect(slot).toBe(4);
    });

    it('advances past collision when requested length is too big for gap', () => {
      // Gap is bars 4 to 6 (length 2), but we need 3 bars -> should jump to bar 10
      const slot = findFreeSlot(placements, 'lane-1', 4, 3);
      expect(slot).toBe(10);
    });
  });

  describe('splitPlacement', () => {
    it('splits placement and maintains offsetBars phase correctly', () => {
      const p: SongPlacement = {
        ...samplePlacement,
        startBar: 2,
        lengthBars: 6, // bars 2 to 8
        offsetBars: 1, // started 1 bar into a 4-bar loop
      };

      const [left, right] = splitPlacement(p, 5, 4);

      // Left part: bars 2 to 5 (length 3), offsetBars: 1
      expect(left.startBar).toBe(2);
      expect(left.lengthBars).toBe(3);
      expect(left.offsetBars).toBe(1);

      // Right part: bars 5 to 8 (length 3).
      // Delta = 3 bars. (1 + 3) % 4 = 0 offsetBars
      expect(right.startBar).toBe(5);
      expect(right.lengthBars).toBe(3);
      expect(right.offsetBars).toBe(0);
    });

    it('throws error when atBar is outside placement bounds', () => {
      expect(() => splitPlacement(samplePlacement, 4)).toThrow();
      expect(() => splitPlacement(samplePlacement, 8)).toThrow();
      expect(() => splitPlacement(samplePlacement, 10)).toThrow();
    });
  });

  describe('trimPlacementLeft and trimPlacementRight', () => {
    it('trims left edge and updates startBar, lengthBars, and offsetBars', () => {
      const p: SongPlacement = {
        ...samplePlacement,
        startBar: 0,
        lengthBars: 8,
        offsetBars: 0,
      };

      // Trim left to start at bar 2 (asset loop length 4)
      const trimmed = trimPlacementLeft(p, 2, 4);
      expect(trimmed.startBar).toBe(2);
      expect(trimmed.lengthBars).toBe(6);
      expect(trimmed.offsetBars).toBe(2);
    });

    it('trims right edge and updates lengthBars', () => {
      const p: SongPlacement = {
        ...samplePlacement,
        startBar: 4,
        lengthBars: 8,
      };

      const trimmed = trimPlacementRight(p, 3);
      expect(trimmed.startBar).toBe(4);
      expect(trimmed.lengthBars).toBe(3);
    });
  });

  describe('createSongFromCreation & addAsset & removeUnusedAssets', () => {
    const mockCreation: Creation = {
      id: 'c-sketch-1',
      title: 'Funky Groove',
      createdAt: 1000,
      updatedAt: 2000,
      schemaVersion: 3,
      project: {
        version: 3,
        bpm: 115,
        bars: 4,
        rootNote: 0,
        scaleName: 'major pentatonic',
        playbackMode: 'flow',
        glide: 30,
        tracks: [],
        strokes: [],
      },
    };

    it('creates a Song from a Creation sketch', () => {
      const song = createSongFromCreation(mockCreation);
      expect(song.title).toBe('Funky Groove Song');
      expect(song.bpm).toBe(115);
      expect(song.totalBars).toBe(4);
      expect(Object.keys(song.assets).length).toBe(1);
      expect(song.placements.length).toBe(1);
      expect(song.placements[0].lengthBars).toBe(4);
    });

    it('adds and dedupes assets by sourceCreationId and updatedAt', () => {
      let song = createSongFromCreation(mockCreation);
      const originalAssetId = Object.keys(song.assets)[0];

      // Adding the exact same creation again should return the existing assetId
      const res1 = addAsset(song, mockCreation);
      expect(res1.assetId).toBe(originalAssetId);
      expect(Object.keys(res1.song.assets).length).toBe(1);

      // Adding an updated creation creates a new asset
      const updatedCreation: Creation = {
        ...mockCreation,
        updatedAt: 3000,
      };
      const res2 = addAsset(song, updatedCreation);
      expect(res2.assetId).not.toBe(originalAssetId);
      expect(Object.keys(res2.song.assets).length).toBe(2);
    });

    it('removes unused assets from song', () => {
      const song = createSongFromCreation(mockCreation);
      const res = addAsset(song, {
        ...mockCreation,
        id: 'c-sketch-2',
        updatedAt: 4000,
      });

      // res.song now has 2 assets, but placements only use the first asset
      expect(Object.keys(res.song.assets).length).toBe(2);

      const cleaned = removeUnusedAssets(res.song);
      expect(Object.keys(cleaned.assets).length).toBe(1);
    });
  });
});
