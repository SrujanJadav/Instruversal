import { describe, it, expect } from 'vitest';
import { generateFlowEventsFromStrokes } from './flowScheduler';
import { buildScaleNotes } from './scales';
import { Stroke } from '../state';

describe('generateFlowEventsFromStrokes', () => {
  const scaleNotes = buildScaleNotes(0, 'major pentatonic', 3, 6);

  it('generates steady continuous tone with no internal pitch jumps for flat horizontal stroke', () => {
    const horizontalStroke: Stroke = {
      id: 'stroke-flat',
      trackId: 'track-1',
      points: [
        { x: 0.1, y: 0.5, t: 0 },
        { x: 0.5, y: 0.5, t: 100 },
        { x: 0.9, y: 0.5, t: 200 },
      ],
      width: 2,
    };

    const events = generateFlowEventsFromStrokes([horizontalStroke], 2, 90, scaleNotes, 25);
    expect(events.length).toBe(1);

    const ev = events[0];
    const loopDuration = 2 * 4 * (60 / 90); // 5.333s
    expect(ev.startTime).toBeCloseTo(0.1 * loopDuration, 2);
    expect(ev.endTime).toBeCloseTo(0.9 * loopDuration, 2);
    // Flat stroke has identical Y, so no pitch change breakpoints
    expect(ev.breakpoints.length).toBe(0);
  });

  it('generates rising scale note breakpoints for diagonal rising stroke', () => {
    const diagonalStroke: Stroke = {
      id: 'stroke-diag',
      trackId: 'track-2',
      points: [
        { x: 0.1, y: 0.9, t: 0 },
        { x: 0.8, y: 0.1, t: 300 },
      ],
      width: 2.5,
    };

    const events = generateFlowEventsFromStrokes([diagonalStroke], 2, 90, scaleNotes, 25);
    expect(events.length).toBe(1);

    const ev = events[0];
    // Y goes from 0.9 (low note) to 0.1 (high note)
    expect(ev.breakpoints.length).toBeGreaterThan(0);
    // Each breakpoint should be higher in pitch (ascending)
    let lastMidi = ev.initialMidi;
    for (const bp of ev.breakpoints) {
      expect(bp.midi).toBeGreaterThanOrEqual(lastMidi);
      lastMidi = bp.midi;
    }
  });

  it('sorts right-to-left strokes so playback moves left-to-right', () => {
    const rtlStroke: Stroke = {
      id: 'stroke-rtl',
      trackId: 'track-1',
      points: [
        { x: 0.8, y: 0.3, t: 0 },
        { x: 0.5, y: 0.4, t: 100 },
        { x: 0.2, y: 0.5, t: 200 },
      ],
      width: 2,
    };

    const events = generateFlowEventsFromStrokes([rtlStroke], 2, 90, scaleNotes, 25);
    expect(events.length).toBe(1);

    const ev = events[0];
    const loopDuration = 2 * 4 * (60 / 90);
    expect(ev.startTime).toBeCloseTo(0.2 * loopDuration, 2);
    expect(ev.endTime).toBeCloseTo(0.8 * loopDuration, 2);
  });

  it('handles near-vertical strokes with minimum 120ms duration glissando sweep', () => {
    const verticalStroke: Stroke = {
      id: 'stroke-vert',
      trackId: 'track-3',
      points: [
        { x: 0.4, y: 0.2, t: 0 },
        { x: 0.405, y: 0.8, t: 50 },
      ],
      width: 2,
    };

    const events = generateFlowEventsFromStrokes([verticalStroke], 2, 90, scaleNotes, 25);
    expect(events.length).toBe(1);

    const ev = events[0];
    const duration = ev.endTime - ev.startTime;
    expect(duration).toBeGreaterThanOrEqual(0.12);
  });

  it('calculates glide: 8ms hop at 0%, full gap at 100%', () => {
    const stroke: Stroke = {
      id: 'stroke-steps',
      trackId: 'track-1',
      points: [
        { x: 0.1, y: 0.8, t: 0 },
        { x: 0.7, y: 0.2, t: 200 },
      ],
      width: 2,
    };

    const eventsAt0 = generateFlowEventsFromStrokes([stroke], 2, 90, scaleNotes, 0);
    const eventsAt100 = generateFlowEventsFromStrokes([stroke], 2, 90, scaleNotes, 100);

    expect(eventsAt0[0].breakpoints.length).toBeGreaterThan(0);
    expect(eventsAt0[0].breakpoints[0].slideSeconds).toBeCloseTo(0.008, 4);

    expect(eventsAt100[0].breakpoints[0].slideSeconds).toBeGreaterThan(0.008);
  });
});
