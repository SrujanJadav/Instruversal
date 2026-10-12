import { describe, it, expect } from 'vitest';
import { generateEventsFromStrokes } from './schedule';
import { buildScaleNotes } from './scales';
import { Stroke } from '../state';

describe('Loop event generator', () => {
  const scaleNotes = buildScaleNotes(0, 'major pentatonic', 3, 6);

  it('generates a single note event for a single tap dot', () => {
    const tapStroke: Stroke = {
      id: 'tap-1',
      trackId: 'track-1',
      points: [{ x: 0.25, y: 0.5, t: 0 }],
      width: 4,
    };

    const events = generateEventsFromStrokes([tapStroke], 2, scaleNotes);
    expect(events.length).toBe(1);
    expect(events[0].trackId).toBe('track-1');
    expect(events[0].strokeId).toBe('tap-1');
    expect(events[0].time).toBe('0:2:0'); // 25% of 2 bars (32 steps) is step 8 = bar 0, beat 2, sixteenth 0
  });

  it('generates multiple sequential note events for a horizontal line', () => {
    const lineStroke: Stroke = {
      id: 'line-1',
      trackId: 'track-2',
      points: [
        { x: 0.1, y: 0.4, t: 0 },
        { x: 0.3, y: 0.4, t: 200 },
      ],
      width: 3,
    };

    const events = generateEventsFromStrokes([lineStroke], 2, scaleNotes);
    // 0.1 to 0.3 across 32 steps covers ~6 steps
    expect(events.length).toBeGreaterThan(4);
    for (const ev of events) {
      expect(ev.trackId).toBe('track-2');
      expect(ev.strokeId).toBe('line-1');
    }
  });

  it('generates a staggered chord strum for near-vertical strokes', () => {
    const verticalStroke: Stroke = {
      id: 'vert-1',
      trackId: 'track-3',
      points: [
        { x: 0.5, y: 0.2, t: 0 },
        { x: 0.501, y: 0.8, t: 150 },
      ],
      width: 4,
    };

    const events = generateEventsFromStrokes([verticalStroke], 2, scaleNotes);
    // Should produce staggered strum notes (up to 4)
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.length).toBeLessThanOrEqual(4);
    // Staggered times should be sequential
    expect(typeof events[0].time).toBe('number');
    expect(events[1].timeSeconds).toBeGreaterThan(events[0].timeSeconds!);
  });

  it('returns empty array when no strokes provided', () => {
    expect(generateEventsFromStrokes([], 2, scaleNotes)).toEqual([]);
  });

  it('folded shape (cone): schedules crossings as simultaneous chord notes at the same step', () => {
    // Cone: drawn from left (0.2, 0.8) to peak (0.6, 0.2), then back left (0.2, 0.4)
    const coneStroke: Stroke = {
      id: 'cone-notes',
      trackId: 'track-1',
      points: [
        { x: 0.2, y: 0.8, t: 0 },
        { x: 0.4, y: 0.5, t: 100 },
        { x: 0.6, y: 0.2, t: 200 },
        { x: 0.4, y: 0.3, t: 300 },
        { x: 0.2, y: 0.4, t: 400 },
      ],
      width: 2.0,
    };

    const events = generateEventsFromStrokes([coneStroke], 2, scaleNotes);
    // Across 32 steps (2 bars), steps between 0.2 and 0.6 have 2 crossings!
    // Check step around x=0.4 (bar 0, beat 3, sixteenth 1 approx -> step 13)
    const step13Events = events.filter((e) => (e.time as string).startsWith('0:3:'));
    expect(step13Events.length).toBeGreaterThanOrEqual(2);
    // Distinct pitches for top and bottom branches
    const midis = step13Events.map((e) => e.midi);
    expect(new Set(midis).size).toBeGreaterThanOrEqual(2);
  });
});
