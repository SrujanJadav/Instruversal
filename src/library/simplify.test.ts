import { describe, it, expect } from 'vitest';
import { simplifyPoints, formatKeyLabel, extractCreationMeta } from './simplify';
import { Creation } from './types';

describe('simplifyPoints', () => {
  it('returns empty array when input is empty', () => {
    expect(simplifyPoints([])).toEqual([]);
  });

  it('keeps single or two points intact', () => {
    const pts = [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }];
    expect(simplifyPoints(pts)).toEqual([
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.8 },
    ]);
  });

  it('reduces colinear points to endpoints', () => {
    const colinear: { x: number; y: number }[] = [];
    for (let i = 0; i <= 20; i++) {
      colinear.push({ x: i / 20, y: i / 20 });
    }
    const simplified = simplifyPoints(colinear, 60, 0.001);
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual({ x: 0, y: 0 });
    expect(simplified[1]).toEqual({ x: 1, y: 1 });
  });

  it('caps output length at maxPoints even on complex squiggles', () => {
    const noisy: { x: number; y: number }[] = [];
    for (let i = 0; i < 300; i++) {
      noisy.push({
        x: i / 300,
        y: 0.5 + Math.sin(i * 0.4) * 0.3,
      });
    }
    const simplified = simplifyPoints(noisy, 60);
    expect(simplified.length).toBeLessThanOrEqual(60);
    expect(simplified.length).toBeGreaterThan(5);
  });
});

describe('formatKeyLabel', () => {
  it('formats root note and scale nicely', () => {
    expect(formatKeyLabel(0, 'major pentatonic')).toBe('C Major Pentatonic');
    expect(formatKeyLabel(11, 'dorian')).toBe('B Dorian');
    expect(formatKeyLabel(2, 'natural minor')).toBe('D Natural Minor');
  });
});

describe('extractCreationMeta', () => {
  it('extracts correct metadata', () => {
    const creation: Creation = {
      id: 'test-123',
      title: 'Sunrise Jam',
      createdAt: 1000,
      updatedAt: 2000,
      schemaVersion: 1,
      project: {
        version: 1,
        bpm: 110,
        bars: 4,
        rootNote: 7, // G
        scaleName: 'dorian',
        playbackMode: 'flow',
        glide: 30,
        tracks: [],
        strokes: [
          {
            id: 's1',
            trackId: 'track-1',
            width: 4,
            points: [
              { x: 0.1, y: 0.2, t: 0 },
              { x: 0.2, y: 0.3, t: 10 },
              { x: 0.3, y: 0.4, t: 20 },
            ],
          },
        ],
      },
    };

    const meta = extractCreationMeta(creation);
    expect(meta.id).toBe('test-123');
    expect(meta.title).toBe('Sunrise Jam');
    expect(meta.bpm).toBe(110);
    expect(meta.keyLabel).toBe('G Dorian');
    expect(meta.strokeCount).toBe(1);
    expect(meta.trackColors).toEqual(['--vermilion']);
    expect(meta.simplifiedStrokes.length).toBe(1);
    expect(meta.simplifiedStrokes[0].points.length).toBeLessThanOrEqual(60);
  });
});
