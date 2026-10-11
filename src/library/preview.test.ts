import { describe, it, expect } from 'vitest';
import { generatePreview } from './preview';
import { ProjectData } from './types';

describe('generatePreview', () => {
  it('generates compact preview under 15KB with 3 decimal precision', () => {
    const fakeStrokes = [];
    for (let i = 0; i < 200; i++) {
      const pts = [];
      for (let j = 0; j < 100; j++) {
        pts.push({
          x: 0.123456 + (j * 0.005),
          y: 0.654321 - (j * 0.003),
          t: j * 10,
        });
      }
      fakeStrokes.push({
        id: `s-${i}`,
        trackId: i % 2 === 0 ? 'track-1' : 'track-2',
        width: 3.456,
        points: pts,
      });
    }

    const project: ProjectData = {
      version: 1,
      bpm: 124,
      bars: 2,
      rootNote: 7, // G
      scaleName: 'minor pentatonic',
      playbackMode: 'flow',
      glide: 30,
      tracks: [],
      strokes: fakeStrokes,
    };

    const preview = generatePreview(project);
    expect(preview.bpm).toBe(124);
    expect(preview.keyLabel).toBe('G Minor Pentatonic');
    expect(preview.strokes.length).toBeLessThanOrEqual(150);
    expect(preview.trackColors).toContain('--vermilion');

    // Points precision check: max 3 decimals
    const firstPoint = preview.strokes[0].points[0];
    const xDecimals = (firstPoint.x.toString().split('.')[1] || '').length;
    expect(xDecimals).toBeLessThanOrEqual(3);

    // Payload size check: strictly under 14,500 bytes
    const json = JSON.stringify(preview);
    expect(json.length).toBeLessThan(14500);
  });

  it('handles empty strokes gracefully', () => {
    const project: ProjectData = {
      version: 1,
      bpm: 90,
      bars: 2,
      rootNote: 0,
      scaleName: 'major pentatonic',
      playbackMode: 'notes',
      glide: 0,
      tracks: [],
      strokes: [],
    };

    const preview = generatePreview(project);
    expect(preview.strokes).toEqual([]);
    expect(preview.bpm).toBe(90);
    expect(preview.keyLabel).toBe('C Major Pentatonic');
  });
});
