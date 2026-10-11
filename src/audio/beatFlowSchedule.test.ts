import { describe, it, expect } from 'vitest';
import {
  generateBeatFlowEventsFromStrokes,
  normYToGlideFreq,
  normYToSweepCutoff,
} from './beatFlowSchedule';
import { Stroke } from '../state';

describe('normYToGlideFreq', () => {
  it('covers ~3 octaves from ~32.7Hz at bottom to ~261.6Hz at top', () => {
    const bottomFreq = normYToGlideFreq(1.0);
    const topFreq = normYToGlideFreq(0.0);
    expect(bottomFreq).toBeCloseTo(32.7, 0);
    expect(topFreq).toBeCloseTo(261.6, 0);
    // 3 octaves: ratio is 8
    expect(topFreq / bottomFreq).toBeCloseTo(8, 1);
  });
});

describe('normYToSweepCutoff', () => {
  it('maps y from 400Hz at bottom to 10000Hz at top', () => {
    const bottomCutoff = normYToSweepCutoff(1.0);
    const topCutoff = normYToSweepCutoff(0.0);
    expect(bottomCutoff).toBeCloseTo(400, 0);
    expect(topCutoff).toBeCloseTo(10000, 0);
  });
});

describe('generateBeatFlowEventsFromStrokes', () => {
  const sampleStroke: Stroke = {
    id: 'stroke-1',
    trackId: 'track-6',
    width: 3,
    points: [
      { x: 0.1, y: 0.8, t: 0 },
      { x: 0.5, y: 0.2, t: 100 },
    ],
  };

  it('generates continuous glide events with single attack, breakpoints, and release', () => {
    const events = generateBeatFlowEventsFromStrokes([sampleStroke], 2, 120, 'glide', 30);
    expect(events.length).toBe(1);
    const ev = events[0];
    expect(ev.strokeId).toBe('stroke-1');
    expect(ev.style).toBe('glide');
    expect(ev.startTime).toBeLessThan(ev.endTime);
    expect(ev.breakpoints.length).toBeGreaterThan(0);
    expect(ev.rollHits.length).toBe(0);
  });

  it('generates pre-scheduled roll hits within safe CPU frequency limit', () => {
    const events = generateBeatFlowEventsFromStrokes([sampleStroke], 2, 120, 'roll');
    expect(events.length).toBe(1);
    const ev = events[0];
    expect(ev.style).toBe('roll');
    expect(ev.rollHits.length).toBeGreaterThan(0);

    // Verify interval never drops below 33ms (~30 hits/s hard cap)
    for (let i = 1; i < ev.rollHits.length; i++) {
      const interval = ev.rollHits[i].timeSeconds - ev.rollHits[i - 1].timeSeconds;
      expect(interval).toBeGreaterThanOrEqual(0.032);
    }
  });

  it('generates sweep events with continuous cutoff changes', () => {
    const events = generateBeatFlowEventsFromStrokes([sampleStroke], 2, 120, 'sweep');
    expect(events.length).toBe(1);
    const ev = events[0];
    expect(ev.style).toBe('sweep');
    expect(ev.breakpoints.length).toBeGreaterThan(0);
  });
});
