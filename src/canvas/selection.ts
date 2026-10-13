import { Pt as Point, Stroke } from '../state';
import { yToMidi, midiToY, buildScaleNotes, ScaleName } from '../audio/scales';

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Calculates perpendicular distance from point p to line segment (p1, p2).
 */
export function distToSegmentSquared(p: Point, p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-10) {
    const dpx = p.x - p1.x;
    const dpy = p.y - p1.y;
    return dpx * dpx + dpy * dpy;
  }

  const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lenSq));
  const projX = p1.x + t * dx;
  const projY = p1.y + t * dy;
  const rx = p.x - projX;
  const ry = p.y - projY;
  return rx * rx + ry * ry;
}

/**
 * Hit test a stroke against a point (in normalized 0..1 coordinates).
 * tolerance is in normalized units (e.g. 0.025 ~ 15-25px on standard screen).
 */
export function hitTestStroke(stroke: Stroke, p: Point, tolerance: number = 0.025): boolean {
  const pts = stroke.points;
  if (pts.length === 0) return false;

  const tolSq = tolerance * tolerance;

  if (pts.length === 1) {
    const dx = p.x - pts[0].x;
    const dy = p.y - pts[0].y;
    return dx * dx + dy * dy <= tolSq;
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const dSq = distToSegmentSquared(p, pts[i], pts[i + 1]);
    if (dSq <= tolSq) {
      return true;
    }
  }

  return false;
}

/**
 * Standard ray-casting algorithm for point-in-polygon.
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const x = point.x;
  const y = point.y;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Computes the total Euclidean length of a stroke's polyline.
 */
export function strokePolylineLength(stroke: Stroke): number {
  const pts = stroke.points;
  if (pts.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

/**
 * Checks whether a stroke is selected by a freehand lasso polygon.
 * Requirement: At least 50% of its length is inside the lasso polygon.
 */
export function isStrokeInsideLasso(
  stroke: Stroke,
  lassoPolygon: Point[],
  thresholdRatio: number = 0.5
): boolean {
  const pts = stroke.points;
  if (pts.length === 0) return false;

  // Single-point tap dot
  if (pts.length === 1) {
    return pointInPolygon(pts[0], lassoPolygon);
  }

  let totalLength = 0;
  let insideLength = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (segLen <= 1e-6) continue;

    totalLength += segLen;

    // Test midpoint of segment as representative approximation
    const midPoint: Point = {
      x: (p1.x + p2.x) * 0.5,
      y: (p1.y + p2.y) * 0.5,
      t: 0,
    };

    if (pointInPolygon(midPoint, lassoPolygon)) {
      insideLength += segLen;
    }
  }

  if (totalLength <= 1e-6) {
    return pointInPolygon(pts[0], lassoPolygon);
  }

  return insideLength / totalLength >= thresholdRatio;
}

/**
 * Checks whether a stroke intersects or is inside an axis-aligned rectangle.
 */
export function isStrokeInsideRect(stroke: Stroke, rect: BoundingBox): boolean {
  const pts = stroke.points;
  if (pts.length === 0) return false;

  for (const p of pts) {
    if (p.x >= rect.minX && p.x <= rect.maxX && p.y >= rect.minY && p.y <= rect.maxY) {
      return true;
    }
  }

  return false;
}

/**
 * Computes bounding box enclosing all given strokes.
 */
export function computeBoundingBox(strokes: Stroke[]): BoundingBox | null {
  if (strokes.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  let hasPoints = false;

  for (const stroke of strokes) {
    for (const p of stroke.points) {
      hasPoints = true;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!hasPoints) return null;

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Snaps horizontal position X to the nearest 16th-note step for the current bar count.
 */
export function snapCoordinateX(x: number, bars: number): number {
  const totalSixteenths = bars * 16;
  if (totalSixteenths <= 0) return x;
  const stepSize = 1 / totalSixteenths;
  const stepped = Math.round(x / stepSize) * stepSize;
  return Math.max(0, Math.min(1, stepped));
}

/**
 * Snaps vertical position Y to the nearest scale note band in effective musical key.
 */
export function snapCoordinateYMelodic(
  y: number,
  root: number,
  scale: ScaleName,
  minOctave: number = 3,
  maxOctave: number = 6
): number {
  const scaleNotes = buildScaleNotes(root, scale, minOctave, maxOctave);
  const midi = yToMidi(y, scaleNotes);
  return midiToY(midi, scaleNotes);
}

/**
 * Snaps vertical position Y to the nearest drum lane (8 lanes for Instruversal).
 */
export function snapCoordinateYBeat(y: number, laneCount: number = 8): number {
  const laneHeight = 1 / laneCount;
  const laneIndex = Math.max(0, Math.min(laneCount - 1, Math.floor(y / laneHeight)));
  return (laneIndex + 0.5) * laneHeight;
}

/**
 * Translates strokes by (dx, dy), clamping to normalized [0, 1] bounds while preserving relative shape.
 */
export function translateStrokes(strokes: Stroke[], dx: number, dy: number, clamp: boolean = true): Stroke[] {
  if (strokes.length === 0) return [];

  let effectiveDx = dx;
  let effectiveDy = dy;

  if (clamp) {
    const box = computeBoundingBox(strokes);
    if (box) {
      if (box.minX + effectiveDx < 0) effectiveDx = -box.minX;
      if (box.maxX + effectiveDx > 1) effectiveDx = 1 - box.maxX;
      if (box.minY + effectiveDy < 0) effectiveDy = -box.minY;
      if (box.maxY + effectiveDy > 1) effectiveDy = 1 - box.maxY;
    }
  }

  return strokes.map((s) => ({
    ...s,
    points: s.points.map((p) => ({
      ...p,
      x: Math.max(0, Math.min(1, p.x + effectiveDx)),
      y: Math.max(0, Math.min(1, p.y + effectiveDy)),
    })),
  }));
}

/**
 * Nudges strokes by one grid step in the specified direction.
 * Left/Right: 1 16th-note step.
 * Up/Down: 1 drum lane (1/8) for beat tracks, or 1 scale step for melodic tracks.
 */
export function nudgeStrokes(
  strokes: Stroke[],
  direction: 'up' | 'down' | 'left' | 'right',
  bars: number,
  trackLookup?: (trackId: string) => { root: number; scale: ScaleName; isBeat: boolean }
): Stroke[] {
  if (strokes.length === 0) return [];
  const sixteenth = 1 / (bars * 16);

  if (direction === 'left') {
    return translateStrokes(strokes, -sixteenth, 0, true);
  }
  if (direction === 'right') {
    return translateStrokes(strokes, sixteenth, 0, true);
  }

  // Vertical nudge
  return strokes.map((s) => {
    const meta = trackLookup ? trackLookup(s.trackId) : null;
    const isBeat = meta ? meta.isBeat : false;

    let dy = 0;
    if (isBeat) {
      const laneStep = 1 / 8;
      dy = direction === 'up' ? -laneStep : laneStep;
    } else if (meta) {
      const scaleNotes = buildScaleNotes(meta.root, meta.scale, 3, 6);
      const step = 1 / Math.max(1, scaleNotes.length - 1);
      dy = direction === 'up' ? -step : step;
    } else {
      dy = direction === 'up' ? -0.05 : 0.05;
    }

    return translateStrokes([s], 0, dy, true)[0];
  });
}

/**
 * Duplicates strokes, offsetting by exactly 1 quarter beat (1 / (bars * 4)) to the right.
 */
export function duplicateStrokes(strokes: Stroke[], bars: number): Stroke[] {
  const offset = 1 / (bars * 4);
  const timestamp = Date.now();
  const box = computeBoundingBox(strokes);
  const shiftX = box && box.maxX + offset > 1 ? -offset : offset;

  return strokes.map((s, idx) => {
    const newId = `stroke-${timestamp}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      ...s,
      id: newId,
      points: s.points.map((p) => ({
        ...p,
        x: Math.max(0, Math.min(1, p.x + shiftX)),
      })),
    };
  });
}

/**
 * Reassigns selected strokes to a different track ID.
 */
export function recolourStrokes(strokes: Stroke[], newTrackId: string): Stroke[] {
  return strokes.map((s) => ({
    ...s,
    trackId: newTrackId,
  }));
}

/**
 * Flips strokes horizontally within their common bounding box.
 */
export function flipStrokesHorizontal(strokes: Stroke[], bounds?: BoundingBox): Stroke[] {
  const box = bounds || computeBoundingBox(strokes);
  if (!box) return strokes;

  const midX = (box.minX + box.maxX) * 0.5;

  return strokes.map((s) => ({
    ...s,
    points: s.points.map((p) => ({
      ...p,
      x: Math.max(0, Math.min(1, 2 * midX - p.x)),
    })),
  }));
}

/**
 * Flips strokes vertically within their common bounding box.
 */
export function flipStrokesVertical(strokes: Stroke[], bounds?: BoundingBox): Stroke[] {
  const box = bounds || computeBoundingBox(strokes);
  if (!box) return strokes;

  const midY = (box.minY + box.maxY) * 0.5;

  return strokes.map((s) => ({
    ...s,
    points: s.points.map((p) => ({
      ...p,
      y: Math.max(0, Math.min(1, 2 * midY - p.y)),
    })),
  }));
}

/**
 * Removes strokes matching the given IDs.
 */
export function deleteStrokes(strokes: Stroke[], idsToDelete: Set<string> | string[]): Stroke[] {
  const set = idsToDelete instanceof Set ? idsToDelete : new Set(idsToDelete);
  return strokes.filter((s) => !set.has(s.id));
}

/**
 * Clones a list of strokes for clipboard copying.
 */
export function copyStrokes(strokes: Stroke[]): Stroke[] {
  return strokes.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p })),
  }));
}

/**
 * Pastes strokes from clipboard with an offset of 1 quarter beat,
 * generating fresh unique IDs and ensuring all points remain bounded [0, 1].
 */
export function pasteStrokes(clipboard: Stroke[], bars: number): Stroke[] {
  if (clipboard.length === 0) return [];
  const offset = 1 / (bars * 4);
  const timestamp = Date.now();
  const box = computeBoundingBox(clipboard);
  const shiftX = box && box.maxX + offset > 1 ? -offset : offset;

  return clipboard.map((s, idx) => {
    const newId = `stroke-${timestamp}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      ...s,
      id: newId,
      points: s.points.map((p) => ({
        ...p,
        x: Math.max(0, Math.min(1, p.x + shiftX)),
        y: Math.max(0, Math.min(1, p.y)),
      })),
    };
  });
}
