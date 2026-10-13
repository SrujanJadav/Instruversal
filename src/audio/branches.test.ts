import { describe, it, expect } from 'vitest';
import {
  extractBranchesFromStroke,
  getStrokeBranches,
  interpolateBranchY,
  clearBranchCache,
} from './branches';
import { Stroke } from '../state';

describe('Stroke branching engine (src/audio/branches.ts)', () => {
  it('splits a cone (up to peak, then back down) into exactly two overlapping branches', () => {
    // Draws from x=0.2 up to peak at x=0.6, then down and left back to x=0.2
    const coneStroke: Stroke = {
      id: 'stroke-cone',
      trackId: 'track-1',
      points: [
        { x: 0.2, y: 0.8, t: 0 },
        { x: 0.4, y: 0.5, t: 100 },
        { x: 0.6, y: 0.2, t: 200 }, // Peak
        { x: 0.4, y: 0.4, t: 300 },
        { x: 0.2, y: 0.6, t: 400 },
      ],
      width: 2.0,
    };

    const branches = extractBranchesFromStroke(coneStroke);
    expect(branches.length).toBe(2);

    // Branch 1: LTR from 0.2 to 0.6
    expect(branches[0].originalDirection).toBe('ltr');
    expect(branches[0].xStart).toBeCloseTo(0.2, 2);
    expect(branches[0].xEnd).toBeCloseTo(0.6, 2);

    // Branch 2: RTL from 0.6 to 0.2, normalized to ascending points for playback
    expect(branches[1].originalDirection).toBe('rtl');
    expect(branches[1].xStart).toBeCloseTo(0.2, 2);
    expect(branches[1].xEnd).toBeCloseTo(0.6, 2);
    expect(branches[1].points[0].x).toBeLessThanOrEqual(branches[1].points[branches[1].points.length - 1].x);
  });

  it('splits a circle into two distinct branches (top and bottom curves)', () => {
    // Circle centered at (0.5, 0.5), radius 0.2
    const circlePoints: { x: number; y: number; t: number }[] = [];
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      circlePoints.push({
        x: 0.5 + 0.2 * Math.cos(angle),
        y: 0.5 + 0.2 * Math.sin(angle),
        t: i * 20,
      });
    }

    const circleStroke: Stroke = {
      id: 'stroke-circle',
      trackId: 'track-1',
      points: circlePoints,
      width: 2.0,
    };

    const branches = extractBranchesFromStroke(circleStroke);
    // Circle has 2 main branches (top arc and bottom arc)
    expect(branches.length).toBeGreaterThanOrEqual(2);
    expect(branches.length).toBeLessThanOrEqual(3);

    // Both major branches cover the x span roughly [0.3, 0.7]
    const longBranches = branches.filter((b) => b.xEnd - b.xStart >= 0.15);
    expect(longBranches.length).toBe(2);
  });

  it('splits a mug-like closed shape with a handle into multiple branches', () => {
    // Body from left to right, handle bulging out right and returning, then bottom back left
    const mugStroke: Stroke = {
      id: 'stroke-mug',
      trackId: 'track-2',
      points: [
        { x: 0.2, y: 0.2, t: 0 },
        { x: 0.5, y: 0.2, t: 100 },
        { x: 0.7, y: 0.3, t: 150 }, // Handle bulge out
        { x: 0.5, y: 0.4, t: 200 }, // Handle return
        { x: 0.6, y: 0.45, t: 230 }, // Second handle loop
        { x: 0.5, y: 0.5, t: 260 },
        { x: 0.2, y: 0.5, t: 350 }, // Bottom back
      ],
      width: 2.0,
    };

    const branches = extractBranchesFromStroke(mugStroke);
    expect(branches.length).toBeGreaterThanOrEqual(3);
  });

  it('splits a zig-zag into one branch per leg', () => {
    const zigZag: Stroke = {
      id: 'stroke-zigzag',
      trackId: 'track-3',
      points: [
        { x: 0.1, y: 0.2, t: 0 },
        { x: 0.5, y: 0.3, t: 100 }, // Leg 1: LTR
        { x: 0.2, y: 0.5, t: 200 }, // Leg 2: RTL
        { x: 0.6, y: 0.6, t: 300 }, // Leg 3: LTR
        { x: 0.3, y: 0.8, t: 400 }, // Leg 4: RTL
      ],
      width: 2.0,
    };

    const branches = extractBranchesFromStroke(zigZag);
    expect(branches.length).toBe(4);
    expect(branches[0].originalDirection).toBe('ltr');
    expect(branches[1].originalDirection).toBe('rtl');
    expect(branches[2].originalDirection).toBe('ltr');
    expect(branches[3].originalDirection).toBe('rtl');
  });

  it('preserves a shaky straight line as exactly ONE branch without false splitting', () => {
    // Normal hand wobble with micro-reversals <= 0.005 (well below 0.015 hysteresis)
    const shakyLine: Stroke = {
      id: 'stroke-shaky',
      trackId: 'track-1',
      points: [
        { x: 0.1, y: 0.5, t: 0 },
        { x: 0.2, y: 0.502, t: 50 },
        { x: 0.197, y: 0.498, t: 60 }, // Wobble back 0.003
        { x: 0.3, y: 0.501, t: 100 },
        { x: 0.295, y: 0.5, t: 110 }, // Wobble back 0.005
        { x: 0.5, y: 0.499, t: 200 },
        { x: 0.496, y: 0.501, t: 210 }, // Wobble back 0.004
        { x: 0.7, y: 0.5, t: 300 },
      ],
      width: 2.0,
    };

    const branches = extractBranchesFromStroke(shakyLine);
    expect(branches.length).toBe(1);
    expect(branches[0].originalDirection).toBe('ltr');
    expect(branches[0].xStart).toBeCloseTo(0.1, 2);
    expect(branches[0].xEnd).toBeCloseTo(0.7, 2);
  });

  it('normalizes right-to-left stroke to ascending x for playback with originalDirection rtl', () => {
    const rtlStroke: Stroke = {
      id: 'stroke-rtl',
      trackId: 'track-1',
      points: [
        { x: 0.8, y: 0.3, t: 0 },
        { x: 0.5, y: 0.4, t: 100 },
        { x: 0.2, y: 0.5, t: 200 },
      ],
      width: 2.0,
    };

    const branches = extractBranchesFromStroke(rtlStroke);
    expect(branches.length).toBe(1);
    expect(branches[0].originalDirection).toBe('rtl');
    expect(branches[0].xStart).toBeCloseTo(0.2, 2);
    expect(branches[0].xEnd).toBeCloseTo(0.8, 2);
    expect(branches[0].points[0].x).toBeCloseTo(0.2, 2);
    expect(branches[0].points[branches[0].points.length - 1].x).toBeCloseTo(0.8, 2);
  });

  it('classifies vertical strokes as sweep branches', () => {
    const verticalStroke: Stroke = {
      id: 'stroke-vert',
      trackId: 'track-4',
      points: [
        { x: 0.4, y: 0.2, t: 0 },
        { x: 0.405, y: 0.8, t: 50 },
      ],
      width: 2.0,
    };

    const branches = extractBranchesFromStroke(verticalStroke);
    expect(branches.length).toBe(1);
    expect(branches[0].isSweep).toBe(true);
  });

  it('handles a single point tap as a single branch', () => {
    const tapStroke: Stroke = {
      id: 'stroke-tap',
      trackId: 'track-3',
      points: [{ x: 0.5, y: 0.3, t: 0 }],
      width: 2.0,
    };

    const branches = extractBranchesFromStroke(tapStroke);
    expect(branches.length).toBe(1);
    expect(branches[0].xStart).toBeCloseTo(0.5, 2);
  });

  it('correctly interpolates branch Y at any target X', () => {
    const branch = extractBranchesFromStroke({
      id: 'stroke-diag',
      trackId: 'track-1',
      points: [
        { x: 0.2, y: 0.8, t: 0 },
        { x: 0.6, y: 0.4, t: 100 },
      ],
      width: 2.0,
    })[0];

    expect(interpolateBranchY(branch, 0.2)).toBeCloseTo(0.8, 4);
    expect(interpolateBranchY(branch, 0.4)).toBeCloseTo(0.6, 4);
    expect(interpolateBranchY(branch, 0.6)).toBeCloseTo(0.4, 4);
  });

  it('caches branch extractions for identical stroke instances', () => {
    clearBranchCache();
    const stroke: Stroke = {
      id: 'cached-stroke',
      trackId: 'track-1',
      points: [
        { x: 0.1, y: 0.2, t: 0 },
        { x: 0.5, y: 0.3, t: 100 },
      ],
      width: 2.0,
    };

    const b1 = getStrokeBranches(stroke);
    const b2 = getStrokeBranches(stroke);
    expect(b1).toBe(b2);
  });

  it('cone gives exactly two riding dots at x = 0.4', () => {
    const coneStroke: Stroke = {
      id: 'stroke-cone-dots',
      trackId: 'track-1',
      points: [
        { x: 0.2, y: 0.8, t: 0 },
        { x: 0.4, y: 0.5, t: 100 },
        { x: 0.6, y: 0.2, t: 200 }, // Peak
        { x: 0.4, y: 0.4, t: 300 },
        { x: 0.2, y: 0.6, t: 400 },
      ],
      width: 2.0,
    };
    const branches = getStrokeBranches(coneStroke);
    const activeAtPointFour = branches.filter((b) => 0.4 >= b.xStart && 0.4 <= b.xEnd);
    expect(activeAtPointFour.length).toBe(2);
    const yValues = activeAtPointFour.map((b) => interpolateBranchY(b, 0.4));
    expect(yValues.length).toBe(2);
    expect(yValues[0]).toBeCloseTo(0.5, 2);
    expect(yValues[1]).toBeCloseTo(0.4, 2);
  });

  it('benchmarks branch building for a 2000-point stroke and 60 strokes', () => {
    // 1. Single stroke with 2000 points
    const pts2000 = [];
    for (let i = 0; i < 2000; i++) {
      const t = i / 2000;
      pts2000.push({
        x: 0.5 + 0.4 * Math.sin(t * 12 * Math.PI) * Math.cos(t * 2 * Math.PI),
        y: 0.5 + 0.4 * Math.cos(t * 12 * Math.PI),
        t: i * 16,
      });
    }
    const stroke2000: Stroke = { id: 'bench-2000', trackId: 'track-1', points: pts2000, width: 2.0 };

    const t0 = performance.now();
    const branches2000 = extractBranchesFromStroke(stroke2000);
    const dur2000 = performance.now() - t0;

    // 2. 60 strokes (realistic multi-track drawing)
    const strokes60: Stroke[] = [];
    for (let s = 0; s < 60; s++) {
      const pts = [];
      const count = 150;
      for (let i = 0; i < count; i++) {
        const f = i / count;
        pts.push({
          x: 0.1 + 0.8 * f + 0.05 * Math.sin(f * 4 * Math.PI),
          y: 0.2 + 0.6 * Math.sin((f + s * 0.1) * 2 * Math.PI),
          t: i * 16,
        });
      }
      strokes60.push({ id: `bench-s-${s}`, trackId: `track-${s % 4}`, points: pts, width: 2.0 });
    }

    const t1 = performance.now();
    for (let s = 0; s < 60; s++) {
      extractBranchesFromStroke(strokes60[s]);
    }
    const dur60 = performance.now() - t1;

    console.log(`[BENCHMARK] 2000-point stroke build time: ${dur2000.toFixed(2)}ms (${branches2000.length} branches)`);
    console.log(`[BENCHMARK] 60 strokes build time: ${dur60.toFixed(2)}ms`);

    expect(dur2000).toBeLessThan(50);
    expect(dur60).toBeLessThan(100);
  });
});

