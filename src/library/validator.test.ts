import { describe, it, expect } from 'vitest';
import { validateProject, validateCreation, sanitizeTitle } from './validator';

describe('sanitizeTitle', () => {
  it('defaults to Untitled sketch when empty or whitespace', () => {
    expect(sanitizeTitle('')).toBe('Untitled sketch');
    expect(sanitizeTitle('   ')).toBe('Untitled sketch');
    expect(sanitizeTitle(null)).toBe('Untitled sketch');
  });

  it('trims whitespace and truncates to 80 chars', () => {
    expect(sanitizeTitle('  My Dreamy Track   ')).toBe('My Dreamy Track');
    const long = 'A'.repeat(100);
    expect(sanitizeTitle(long).length).toBe(80);
  });
});

describe('validateProject', () => {
  it('rejects invalid or non-object payloads', () => {
    expect(validateProject(null).isValid).toBe(false);
    expect(validateProject('string').isValid).toBe(false);
  });

  it('clamps BPM to 50..180 and normalizes root note', () => {
    const res = validateProject({
      bpm: 300,
      rootNote: 14,
      bars: 12,
    });
    expect(res.isValid).toBe(true);
    expect(res.data?.bpm).toBe(180);
    expect(res.data?.rootNote).toBe(2); // 14 % 12
    expect(res.data?.bars).toBe(8);
  });

  it('replaces missing/unknown instruments with safe default pluck', () => {
    const res = validateProject({
      tracks: [
        {
          id: 'track-1',
          name: 'Lead',
          instrumentId: 'super-hyper-synth-9000',
        },
      ],
    });
    expect(res.isValid).toBe(true);
    expect(res.data?.tracks[0].instrumentId).toBe('pluck');
    expect(res.warnings).toBeDefined();
  });

  it('caps strokes at 1000 and points at 3000', () => {
    const strokes = [];
    for (let i = 0; i < 1100; i++) {
      strokes.push({
        id: `s-${i}`,
        points: Array.from({ length: 3500 }, (_, idx) => ({ x: 0.1, y: 0.2, t: idx })),
      });
    }

    const res = validateProject({ strokes });
    expect(res.isValid).toBe(true);
    expect(res.data?.strokes.length).toBe(1000);
    expect(res.data?.strokes[0].points.length).toBe(3000);
  });

  it('clamps coordinates to 0..1', () => {
    const res = validateProject({
      strokes: [
        {
          id: 's-1',
          points: [
            { x: -0.5, y: 1.5, t: 10 },
            { x: 0.4, y: 0.6, t: 20 },
          ],
        },
      ],
    });
    expect(res.isValid).toBe(true);
    const pts = res.data?.strokes[0].points;
    expect(pts?.[0].x).toBe(0);
    expect(pts?.[0].y).toBe(1);
    expect(pts?.[1].x).toBe(0.4);
    expect(pts?.[1].y).toBe(0.6);
  });
});

describe('validateCreation', () => {
  it('validates a complete creation and generates missing fields', () => {
    const res = validateCreation({
      id: 'uuid-1',
      title: 'Midnight Groove',
      project: {
        bpm: 120,
        strokes: [],
      },
    });
    expect(res.isValid).toBe(true);
    expect(res.data?.id).toBe('uuid-1');
    expect(res.data?.title).toBe('Midnight Groove');
    expect(res.data?.project.bpm).toBe(120);
  });

  it('rejects creation missing id', () => {
    const res = validateCreation({
      title: 'No ID',
      project: {},
    });
    expect(res.isValid).toBe(false);
  });
});
