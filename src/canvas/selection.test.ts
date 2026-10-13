import { describe, it, expect } from 'vitest';
import {
  hitTestStroke,
  pointInPolygon,
  isStrokeInsideLasso,
  isStrokeInsideRect,
  computeBoundingBox,
  snapCoordinateX,
  snapCoordinateYMelodic,
  snapCoordinateYBeat,
  translateStrokes,
  duplicateStrokes,
  recolourStrokes,
  flipStrokesHorizontal,
  flipStrokesVertical,
  deleteStrokes,
  nudgeStrokes,
  copyStrokes,
  pasteStrokes,
} from './selection';
import { Stroke } from '../state';

describe('Selection Geometry and Transforms (src/canvas/selection.ts)', () => {
  const lineStroke: Stroke = {
    id: 's-line',
    trackId: 'track-1',
    points: [
      { x: 0.2, y: 0.2, t: 0 },
      { x: 0.6, y: 0.2, t: 100 },
    ],
    width: 2.0,
  };

  const coneStroke: Stroke = {
    id: 's-cone',
    trackId: 'track-2',
    points: [
      { x: 0.2, y: 0.8, t: 0 },
      { x: 0.4, y: 0.3, t: 100 },
      { x: 0.6, y: 0.8, t: 200 },
    ],
    width: 2.5,
  };

  const tapDot: Stroke = {
    id: 's-dot',
    trackId: 'track-3',
    points: [{ x: 0.5, y: 0.5, t: 0 }],
    width: 3.0,
  };

  describe('Hit Testing (hitTestStroke)', () => {
    it('detects hits on a line segment within tolerance', () => {
      expect(hitTestStroke(lineStroke, { x: 0.4, y: 0.2, t: 0 }, 0.02)).toBe(true);
      expect(hitTestStroke(lineStroke, { x: 0.4, y: 0.21, t: 0 }, 0.02)).toBe(true);
      expect(hitTestStroke(lineStroke, { x: 0.4, y: 0.25, t: 0 }, 0.02)).toBe(false);
    });

    it('detects hits on a single point tap dot', () => {
      expect(hitTestStroke(tapDot, { x: 0.51, y: 0.51, t: 0 }, 0.02)).toBe(true);
      expect(hitTestStroke(tapDot, { x: 0.55, y: 0.55, t: 0 }, 0.02)).toBe(false);
    });

    it('detects hits along curved/multi-segment strokes like cone', () => {
      expect(hitTestStroke(coneStroke, { x: 0.4, y: 0.31, t: 0 }, 0.02)).toBe(true);
      expect(hitTestStroke(coneStroke, { x: 0.3, y: 0.55, t: 0 }, 0.03)).toBe(true);
      expect(hitTestStroke(coneStroke, { x: 0.4, y: 0.6, t: 0 }, 0.02)).toBe(false);
    });
  });

  describe('Point in Polygon (pointInPolygon)', () => {
    // Triangle (0,0) -> (1,0) -> (0.5, 1)
    const triangle = [
      { x: 0.1, y: 0.1, t: 0 },
      { x: 0.9, y: 0.1, t: 0 },
      { x: 0.5, y: 0.9, t: 0 },
    ];

    it('correctly identifies points inside and outside', () => {
      expect(pointInPolygon({ x: 0.5, y: 0.3, t: 0 }, triangle)).toBe(true);
      expect(pointInPolygon({ x: 0.1, y: 0.9, t: 0 }, triangle)).toBe(false);
      expect(pointInPolygon({ x: 0.5, y: 0.95, t: 0 }, triangle)).toBe(false);
    });
  });

  describe('Lasso Selection (isStrokeInsideLasso)', () => {
    // Lasso enclosing the region [0.1..0.5] in x and [0.1..0.5] in y
    const lassoSquare = [
      { x: 0.1, y: 0.1, t: 0 },
      { x: 0.5, y: 0.1, t: 0 },
      { x: 0.5, y: 0.5, t: 0 },
      { x: 0.1, y: 0.5, t: 0 },
    ];

    it('selects stroke if >= 50% of length is inside lasso', () => {
      // lineStroke is from (0.2, 0.2) to (0.6, 0.2) -> length = 0.4
      // Portion inside lasso [0.2..0.5] -> length = 0.3 (75% inside >= 50%)
      expect(isStrokeInsideLasso(lineStroke, lassoSquare, 0.5)).toBe(true);
    });

    it('rejects stroke if < 50% of length is inside lasso', () => {
      // Stroke from (0.4, 0.2) to (0.9, 0.2) -> length = 0.5
      // Portion inside lasso [0.4..0.5] -> length = 0.1 (20% inside < 50%)
      const mostlyOutside: Stroke = {
        id: 's-out',
        trackId: 'track-1',
        points: [
          { x: 0.4, y: 0.2, t: 0 },
          { x: 0.9, y: 0.2, t: 100 },
        ],
        width: 2.0,
      };
      expect(isStrokeInsideLasso(mostlyOutside, lassoSquare, 0.5)).toBe(false);
    });

    it('selects tap dot if inside lasso polygon', () => {
      const dotInside: Stroke = {
        id: 's-dot-in',
        trackId: 'track-1',
        points: [{ x: 0.3, y: 0.3, t: 0 }],
        width: 2.0,
      };
      const dotOutside: Stroke = {
        id: 's-dot-out',
        trackId: 'track-1',
        points: [{ x: 0.8, y: 0.8, t: 0 }],
        width: 2.0,
      };
      expect(isStrokeInsideLasso(dotInside, lassoSquare)).toBe(true);
      expect(isStrokeInsideLasso(dotOutside, lassoSquare)).toBe(false);
    });
  });

  describe('Rectangle Selection (isStrokeInsideRect)', () => {
    it('detects strokes touching or inside bounding box', () => {
      const rect = { minX: 0.15, maxX: 0.45, minY: 0.15, maxY: 0.35, width: 0.3, height: 0.2 };
      expect(isStrokeInsideRect(lineStroke, rect)).toBe(true);
      const farStroke: Stroke = {
        id: 's-far',
        trackId: 'track-1',
        points: [{ x: 0.8, y: 0.8, t: 0 }],
        width: 2.0,
      };
      expect(isStrokeInsideRect(farStroke, rect)).toBe(false);
    });
  });

  describe('Bounding Box (computeBoundingBox)', () => {
    it('computes tight bounding box across multiple strokes', () => {
      const box = computeBoundingBox([lineStroke, coneStroke]);
      expect(box).not.toBeNull();
      expect(box!.minX).toBeCloseTo(0.2, 4);
      expect(box!.maxX).toBeCloseTo(0.6, 4);
      expect(box!.minY).toBeCloseTo(0.2, 4);
      expect(box!.maxY).toBeCloseTo(0.8, 4);
      expect(box!.width).toBeCloseTo(0.4, 4);
      expect(box!.height).toBeCloseTo(0.6, 4);
    });
  });

  describe('Snapping (snapCoordinateX & snapCoordinateY)', () => {
    it('snaps horizontal X to 16th-note boundaries', () => {
      // 2 bars -> 32 sixteenths -> step size = 1/32 = 0.03125
      const bars = 2;
      expect(snapCoordinateX(0.03, bars)).toBeCloseTo(0.03125, 4);
      expect(snapCoordinateX(0.033, bars)).toBeCloseTo(0.03125, 4);
      expect(snapCoordinateX(0.06, bars)).toBeCloseTo(0.0625, 4);
    });

    it('snaps vertical Y to scale degrees in natural minor', () => {
      // Root 0 (C), natural minor
      const snappedY = snapCoordinateYMelodic(0.49, 0, 'natural minor');
      expect(snappedY).toBeGreaterThanOrEqual(0);
      expect(snappedY).toBeLessThanOrEqual(1);
    });

    it('snaps vertical Y to drum lanes for beat tracks', () => {
      // 4 lanes: lane 0: 0.125, lane 1: 0.375, lane 2: 0.625, lane 3: 0.875
      expect(snapCoordinateYBeat(0.1, 4)).toBeCloseTo(0.125, 3);
      expect(snapCoordinateYBeat(0.4, 4)).toBeCloseTo(0.375, 3);
      expect(snapCoordinateYBeat(0.7, 4)).toBeCloseTo(0.625, 3);
      expect(snapCoordinateYBeat(0.9, 4)).toBeCloseTo(0.875, 3);
    });
  });

  describe('Transforms: Translate, Duplicate, Recolour, Flip, Delete', () => {
    it('translates strokes by delta while respecting boundaries', () => {
      const moved = translateStrokes([lineStroke], 0.1, 0.05);
      expect(moved[0].points[0].x).toBeCloseTo(0.3, 4);
      expect(moved[0].points[0].y).toBeCloseTo(0.25, 4);
      expect(moved[0].points[1].x).toBeCloseTo(0.7, 4);
      expect(moved[0].points[1].y).toBeCloseTo(0.25, 4);
    });

    it('duplicates strokes with 1-beat offset and fresh IDs', () => {
      // bars = 2 -> 1 beat = 1 / (2 * 4) = 0.125
      const dupes = duplicateStrokes([lineStroke], 2);
      expect(dupes.length).toBe(1);
      expect(dupes[0].id).not.toBe(lineStroke.id);
      expect(dupes[0].points[0].x).toBeCloseTo(0.2 + 0.125, 4);
    });

    it('recolours strokes to specified track ID', () => {
      const recoloured = recolourStrokes([lineStroke, coneStroke], 'track-4');
      expect(recoloured[0].trackId).toBe('track-4');
      expect(recoloured[1].trackId).toBe('track-4');
    });

    it('flips strokes horizontally within their bounding box', () => {
      // lineStroke is from 0.2 to 0.6. midX = 0.4.
      // flipped point 0 (0.2): 2 * 0.4 - 0.2 = 0.6
      // flipped point 1 (0.6): 2 * 0.4 - 0.6 = 0.2
      const flippedH = flipStrokesHorizontal([lineStroke]);
      expect(flippedH[0].points[0].x).toBeCloseTo(0.6, 4);
      expect(flippedH[0].points[1].x).toBeCloseTo(0.2, 4);
    });

    it('flips strokes vertically within their bounding box', () => {
      // coneStroke Y values: 0.8, 0.3, 0.8. midY = 0.55
      // Peak at 0.3 flipped: 2 * 0.55 - 0.3 = 0.8
      // Base at 0.8 flipped: 2 * 0.55 - 0.8 = 0.3
      const flippedV = flipStrokesVertical([coneStroke]);
      expect(flippedV[0].points[0].y).toBeCloseTo(0.3, 4);
      expect(flippedV[0].points[1].y).toBeCloseTo(0.8, 4);
      expect(flippedV[0].points[2].y).toBeCloseTo(0.3, 4);
    });

    it('deletes selected strokes by ID', () => {
      const all = [lineStroke, coneStroke, tapDot];
      const remaining = deleteStrokes(all, new Set(['s-cone', 's-dot']));
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe('s-line');
    });

    it('nudges strokes left/right by 1 16th-note step', () => {
      // 2 bars -> 1/32 = 0.03125
      const right = nudgeStrokes([lineStroke], 'right', 2);
      expect(right[0].points[0].x).toBeCloseTo(0.2 + 0.03125, 4);

      const left = nudgeStrokes([lineStroke], 'left', 2);
      expect(left[0].points[0].x).toBeCloseTo(0.2 - 0.03125, 4);
    });

    it('nudges strokes vertically respecting beat tracks vs melodic tracks', () => {
      // Beat track nudging up/down shifts by 1/8 lane
      const beatNudge = nudgeStrokes([tapDot], 'down', 2, () => ({
        root: 0,
        scale: 'natural minor',
        isBeat: true,
      }));
      expect(beatNudge[0].points[0].y).toBeCloseTo(0.5 + 0.125, 4);

      // Melodic track nudging up moves pitch up (smaller y in canvas)
      const melodicNudge = nudgeStrokes([lineStroke], 'up', 2, () => ({
        root: 0,
        scale: 'natural minor',
        isBeat: false,
      }));
      expect(melodicNudge[0].points[0].y).toBeLessThan(0.2);
    });

    it('copies strokes creating deep cloned instances', () => {
      const copy = copyStrokes([lineStroke]);
      expect(copy.length).toBe(1);
      expect(copy[0].id).toBe(lineStroke.id);
      expect(copy[0].points).not.toBe(lineStroke.points);
      expect(copy[0].points[0]).not.toBe(lineStroke.points[0]);
      // Mutating copy points must not mutate original
      copy[0].points[0].x = 0.99;
      expect(lineStroke.points[0].x).toBe(0.2);
    });

    it('pastes strokes with 1-beat offset, fresh IDs, and bounded [0, 1] coordinates', () => {
      // bars = 2 -> 1 beat = 0.125
      const pasted = pasteStrokes([lineStroke], 2);
      expect(pasted.length).toBe(1);
      expect(pasted[0].id).not.toBe(lineStroke.id);
      expect(pasted[0].points[0].x).toBeCloseTo(0.2 + 0.125, 4);
      expect(pasted[0].points[1].x).toBeCloseTo(0.6 + 0.125, 4);

      // Empty clipboard returns empty array
      expect(pasteStrokes([], 2)).toEqual([]);
    });
  });
});

