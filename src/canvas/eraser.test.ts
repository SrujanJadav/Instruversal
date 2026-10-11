import { describe, it, expect } from 'vitest';
import {
  eraseStroke,
  eraseStrokes,
  getSegmentCapsuleInterval,
  isPointInCapsule,
  Capsule,
} from './eraser';
import { Stroke } from '../state';

describe('Eraser Geometry (src/canvas/eraser.ts)', () => {
  const canvasWidth = 1000;
  const canvasHeight = 500;

  it('detects points inside a circle or capsule', () => {
    const circle: Capsule = {
      p0: { x: 500, y: 250 },
      p1: { x: 500, y: 250 },
      radius: 20,
    };

    expect(isPointInCapsule({ x: 500, y: 250 }, circle)).toBe(true);
    expect(isPointInCapsule({ x: 515, y: 250 }, circle)).toBe(true);
    expect(isPointInCapsule({ x: 525, y: 250 }, circle)).toBe(false);

    // Capsule between (100, 100) and (200, 100)
    const capsule: Capsule = {
      p0: { x: 100, y: 100 },
      p1: { x: 200, y: 100 },
      radius: 15,
    };
    expect(isPointInCapsule({ x: 150, y: 100 }, capsule)).toBe(true);
    expect(isPointInCapsule({ x: 150, y: 110 }, capsule)).toBe(true);
    expect(isPointInCapsule({ x: 150, y: 125 }, capsule)).toBe(false);
  });

  it('computes exact segment-capsule intersections', () => {
    const circle: Capsule = {
      p0: { x: 500, y: 250 },
      p1: { x: 500, y: 250 },
      radius: 50,
    };

    // Horizontal line from x=400 to x=600 at y=250
    // Enters at x=450 (u=0.25) and exits at x=550 (u=0.75)
    const interval = getSegmentCapsuleInterval(
      { x: 400, y: 250 },
      { x: 600, y: 250 },
      circle
    );
    expect(interval).not.toBeNull();
    expect(interval!.uEnter).toBeCloseTo(0.25, 2);
    expect(interval!.uExit).toBeCloseTo(0.75, 2);
  });

  it('splits a horizontal line cut in the middle into 2 separate strokes', () => {
    const stroke: Stroke = {
      id: 'stroke-orig',
      trackId: 'track-1',
      points: [
        { x: 0.1, y: 0.5, t: 0 },
        { x: 0.9, y: 0.5, t: 100 },
      ],
      width: 4,
    };

    // Circle at center (500, 250) with radius 50px (x: 450 to 550)
    const circle: Capsule = {
      p0: { x: 500, y: 250 },
      p1: { x: 500, y: 250 },
      radius: 50,
    };

    const res = eraseStroke(stroke, circle, canvasWidth, canvasHeight, 'part');
    expect(res.modified).toBe(true);
    expect(res.fragments.length).toBe(2);

    const [leftPiece, rightPiece] = res.fragments;
    expect(leftPiece.id).not.toBe('stroke-orig');
    expect(rightPiece.id).not.toBe('stroke-orig');
    expect(leftPiece.trackId).toBe('track-1');
    expect(rightPiece.trackId).toBe('track-1');

    // Left piece starts at 0.1 and ends at 0.45
    expect(leftPiece.points[0].x).toBeCloseTo(0.1, 3);
    expect(leftPiece.points[leftPiece.points.length - 1].x).toBeCloseTo(0.45, 2);

    // Right piece starts at 0.55 and ends at 0.9
    expect(rightPiece.points[0].x).toBeCloseTo(0.55, 2);
    expect(rightPiece.points[rightPiece.points.length - 1].x).toBeCloseTo(0.9, 3);
  });

  it('shortens the end of a stroke cleanly when erased', () => {
    const stroke: Stroke = {
      id: 'stroke-end',
      trackId: 'track-2',
      points: [
        { x: 0.1, y: 0.5, t: 0 },
        { x: 0.8, y: 0.5, t: 100 },
      ],
      width: 3.5,
    };

    // Eraser covers (0.75 to 0.85) at y=0.5 (radius 50 at x=800)
    const circle: Capsule = {
      p0: { x: 800, y: 250 },
      p1: { x: 800, y: 250 },
      radius: 50,
    };

    const res = eraseStroke(stroke, circle, canvasWidth, canvasHeight, 'part');
    expect(res.modified).toBe(true);
    expect(res.fragments.length).toBe(1);

    const piece = res.fragments[0];
    expect(piece.points[0].x).toBeCloseTo(0.1, 3);
    expect(piece.points[piece.points.length - 1].x).toBeCloseTo(0.75, 2);
  });

  it('shortens the start of a stroke cleanly when erased', () => {
    const stroke: Stroke = {
      id: 'stroke-start',
      trackId: 'track-1',
      points: [
        { x: 0.1, y: 0.5, t: 0 },
        { x: 0.8, y: 0.5, t: 100 },
      ],
      width: 3.5,
    };

    // Eraser at x=100 (radius 50 => x: 50 to 150)
    const circle: Capsule = {
      p0: { x: 100, y: 250 },
      p1: { x: 100, y: 250 },
      radius: 50,
    };

    const res = eraseStroke(stroke, circle, canvasWidth, canvasHeight, 'part');
    expect(res.modified).toBe(true);
    expect(res.fragments.length).toBe(1);

    const piece = res.fragments[0];
    expect(piece.points[0].x).toBeCloseTo(0.15, 2);
    expect(piece.points[piece.points.length - 1].x).toBeCloseTo(0.8, 3);
  });

  it('deletes single-point strokes (taps) inside the circle', () => {
    const tap: Stroke = {
      id: 'tap-1',
      trackId: 'track-beat',
      points: [{ x: 0.5, y: 0.5, t: 0 }],
      width: 4,
    };

    const circle: Capsule = {
      p0: { x: 500, y: 250 },
      p1: { x: 500, y: 250 },
      radius: 20,
    };

    const res = eraseStroke(tap, circle, canvasWidth, canvasHeight, 'part');
    expect(res.modified).toBe(true);
    expect(res.fragments.length).toBe(0);

    // Outside tap
    const outsideTap: Stroke = {
      id: 'tap-2',
      trackId: 'track-beat',
      points: [{ x: 0.1, y: 0.1, t: 0 }],
      width: 4,
    };
    const resOutside = eraseStroke(outsideTap, circle, canvasWidth, canvasHeight, 'part');
    expect(resOutside.modified).toBe(false);
    expect(resOutside.fragments.length).toBe(1);
  });

  it('capsule catches strokes between fast pointer samples', () => {
    const stroke: Stroke = {
      id: 'vertical-line',
      trackId: 'track-1',
      points: [
        { x: 0.5, y: 0.1, t: 0 },
        { x: 0.5, y: 0.9, t: 100 },
      ],
      width: 3.5,
    };

    // Fast pointer swipe from x=400 to x=600 at y=250 (stroke is at x=500)
    // Neither p0 (400, 250) nor p1 (600, 250) touches x=500 with radius 20,
    // but the capsule line connects them and crosses x=500!
    const capsule: Capsule = {
      p0: { x: 400, y: 250 },
      p1: { x: 600, y: 250 },
      radius: 20,
    };

    const res = eraseStroke(stroke, capsule, canvasWidth, canvasHeight, 'part');
    expect(res.modified).toBe(true);
    expect(res.fragments.length).toBe(2);
  });

  it('deletes whole stroke when mode is "stroke"', () => {
    const stroke: Stroke = {
      id: 'stroke-whole',
      trackId: 'track-1',
      points: [
        { x: 0.1, y: 0.5, t: 0 },
        { x: 0.9, y: 0.5, t: 100 },
      ],
      width: 4,
    };

    const circle: Capsule = {
      p0: { x: 500, y: 250 },
      p1: { x: 500, y: 250 },
      radius: 20,
    };

    const res = eraseStroke(stroke, circle, canvasWidth, canvasHeight, 'stroke');
    expect(res.modified).toBe(true);
    expect(res.fragments.length).toBe(0);
  });

  it('discards tiny fragments under 4px', () => {
    // A stroke that is cut leaving a 2px remnant (from x=100 to 102)
    const stroke: Stroke = {
      id: 'stroke-leaving-tiny',
      trackId: 'track-1',
      points: [
        { x: 0.1, y: 0.5, t: 0 },
        { x: 0.9, y: 0.5, t: 100 },
      ],
      width: 3,
    };
    // Circle erasing from x=102 to 900 -> left piece is only 2px long (100 to 102)
    // p0 at x=501, radius 399 => x from 102 to 900
    const bigCircle: Capsule = {
      p0: { x: 501, y: 250 },
      p1: { x: 501, y: 250 },
      radius: 399,
    };
    const res = eraseStroke(stroke, bigCircle, canvasWidth, canvasHeight, 'part');
    expect(res.modified).toBe(true);
    // The 2px remnant at x=0.100..0.102 is discarded (< 4px path length)
    expect(res.fragments.length).toBe(0);
  });

  it('skips non-intersecting strokes via bounding box check', () => {
    const farStroke: Stroke = {
      id: 'far',
      trackId: 'track-1',
      points: [
        { x: 0.05, y: 0.05, t: 0 },
        { x: 0.1, y: 0.1, t: 10 },
      ],
      width: 3,
    };

    const circle: Capsule = {
      p0: { x: 900, y: 450 },
      p1: { x: 900, y: 450 },
      radius: 20,
    };

    const res = eraseStroke(farStroke, circle, canvasWidth, canvasHeight, 'part');
    expect(res.modified).toBe(false);
    expect(res.fragments[0]).toBe(farStroke);
  });

  it('filters by trackId when filterTrack option is enabled', () => {
    const stroke1: Stroke = {
      id: 's1',
      trackId: 'track-1',
      points: [
        { x: 0.1, y: 0.5, t: 0 },
        { x: 0.9, y: 0.5, t: 10 },
      ],
      width: 3,
    };
    const stroke2: Stroke = {
      id: 's2',
      trackId: 'track-2',
      points: [
        { x: 0.1, y: 0.5, t: 0 },
        { x: 0.9, y: 0.5, t: 10 },
      ],
      width: 3,
    };

    const circle: Capsule = {
      p0: { x: 500, y: 250 },
      p1: { x: 500, y: 250 },
      radius: 30,
    };

    // Filter to track-1 only
    const res = eraseStrokes([stroke1, stroke2], circle, canvasWidth, canvasHeight, {
      mode: 'part',
      filterTrack: true,
      selectedTrackId: 'track-1',
    });

    expect(res.modified).toBe(true);
    // stroke1 was cut into 2 pieces
    expect(res.removedStrokeIds).toEqual(['s1']);
    // stroke2 was untouched and kept
    const hasStroke2 = res.newStrokes.some((s) => s.id === 's2');
    expect(hasStroke2).toBe(true);
  });
});
