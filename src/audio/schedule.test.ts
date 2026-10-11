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
});
