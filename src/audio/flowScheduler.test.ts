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

  it('regression: short horizontal notes under 0.03 in X are not misclassified as vertical sweeps', () => {
    // A short horizontal note stroke (width in X = 0.015 < 0.03, height in Y = 0.001 <= 0.06)
    const shortHorizontalStroke: Stroke = {
      id: 'short-note-1',
      trackId: 'track-1',
      points: [
        { x: 0.2, y: 0.4, t: 0 },
        { x: 0.215, y: 0.4, t: 25 },
      ],
      width: 2,
    };

    const loopDuration = 2 * 4 * (60 / 90); // 5.333s
    const events = generateFlowEventsFromStrokes([shortHorizontalStroke], 2, 90, scaleNotes, 25);
    expect(events.length).toBe(1);

    const ev = events[0];
    // Start time starts at xMin * loopDuration (0.2 * loopDuration), NOT centered like vertical sweeps
    expect(ev.startTime).toBeCloseTo(0.2 * loopDuration, 4);
    // End time is clamped to minimum 80ms standard duration, NOT 120ms glissando sweep
    expect(ev.endTime - ev.startTime).toBeCloseTo(0.08, 4);
    // Flat horizontal note has 0 glissando sweep breakpoints
    expect(ev.breakpoints.length).toBe(0);
  });

  it('regression: real vertical strokes with deltaX < 0.03 and deltaY > 0.06 still sweep across pitch range', () => {
    // True vertical swipe: deltaX = 0.005 < 0.03, deltaY = 0.6 > 0.06
    const trueVerticalStroke: Stroke = {
      id: 'vertical-swipe',
      trackId: 'track-1',
      points: [
        { x: 0.5, y: 0.2, t: 0 },
        { x: 0.505, y: 0.8, t: 60 },
      ],
      width: 2,
    };

    const events = generateFlowEventsFromStrokes([trueVerticalStroke], 2, 90, scaleNotes, 25);
    expect(events.length).toBe(1);

    const ev = events[0];
    // Sweep duration is at least 120ms (glissando sweep window)
    expect(ev.endTime - ev.startTime).toBeGreaterThanOrEqual(0.12);
    // Generates scale note glissando breakpoints along the vertical stroke
    expect(ev.breakpoints.length).toBeGreaterThan(0);
    // Breakpoints reflect pitch changes from top (y=0.2, high pitch) to bottom (y=0.8, low pitch)
    expect(ev.breakpoints[ev.breakpoints.length - 1].midi).toBeLessThan(ev.initialMidi);
  });

  it('regression: existing project strokes produce identical flow events as before', () => {
    const existingStrokes: Stroke[] = [
      {
        id: 'legacy-melody-1',
        trackId: 'track-1',
        points: [
          { x: 0.0, y: 0.5, t: 0 },
          { x: 0.25, y: 0.5, t: 150 },
        ],
        width: 2.0,
      },
      {
        id: 'legacy-melody-2',
        trackId: 'track-1',
        points: [
          { x: 0.25, y: 0.3, t: 0 },
          { x: 0.5, y: 0.3, t: 150 },
        ],
        width: 2.0,
      },
    ];

    const events = generateFlowEventsFromStrokes(existingStrokes, 1, 120, scaleNotes, 20);
    expect(events.length).toBe(2);

    const loopDuration = 1 * 4 * (60 / 120); // 2.0s
    expect(events[0].startTime).toBeCloseTo(0.0, 4);
    expect(events[0].endTime).toBeCloseTo(0.25 * loopDuration, 4);
    expect(events[1].startTime).toBeCloseTo(0.25 * loopDuration, 4);
    expect(events[1].endTime).toBeCloseTo(0.5 * loopDuration, 4);
  });
});
