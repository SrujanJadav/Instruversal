import { Stroke, Pt } from '../state';

export interface Point2D {
  x: number;
  y: number;
}

export interface Capsule {
  p0: Point2D;
  p1: Point2D;
  radius: number;
}

export type EraserMode = 'part' | 'stroke';

export interface EraseOptions {
  mode: EraserMode;
  filterTrack?: boolean;
  selectedTrackId?: string;
}

/**
 * Returns squared distance from a 2D point (px, py) to a 2D segment (x1, y1)-(x2, y2).
 */
export function distToSegmentSquared(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) {
    const ex = px - x1;
    const ey = py - y1;
    return ex * ex + ey * ey;
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const ex = px - projX;
  const ey = py - projY;
  return ex * ex + ey * ey;
}

/**
 * Determines whether a pixel point is inside the eraser capsule.
 */
export function isPointInCapsule(p: Point2D, capsule: Capsule): boolean {
  const r2 = capsule.radius * capsule.radius;
  return (
    distToSegmentSquared(
      p.x,
      p.y,
      capsule.p0.x,
      capsule.p0.y,
      capsule.p1.x,
      capsule.p1.y
    ) <= r2
  );
}

/**
 * Helper to interpolate between two Pt normalized points using parameter u in [0, 1].
 */
export function interpolatePt(pA: Pt, pB: Pt, u: number): Pt {
  return {
    x: pA.x + u * (pB.x - pA.x),
    y: pA.y + u * (pB.y - pA.y),
    t: Math.round(pA.t + u * (pB.t - pA.t)),
  };
}

/**
 * Calculates the segment-capsule intersection interval [uEnter, uExit] along segment pA -> pB.
 * Points inside capsule are in [uEnter, uExit].
 * Returns null if the segment does not intersect the capsule.
 */
export function getSegmentCapsuleInterval(
  pA: Point2D,
  pB: Point2D,
  capsule: Capsule
): { uEnter: number; uExit: number } | null {
  const inA = isPointInCapsule(pA, capsule);
  const inB = isPointInCapsule(pB, capsule);

  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const segLenSq = dx * dx + dy * dy;

  if (segLenSq < 1e-9) {
    return inA ? { uEnter: 0, uExit: 1 } : null;
  }

  // Find approximate minimum distance between segment pA->pB and segment capsule.p0->capsule.p1
  // We can sample and use binary refinement to find the exact entry and exit roots u in [0, 1].
  const distSqAt = (u: number): number => {
    const px = pA.x + u * dx;
    const py = pA.y + u * dy;
    return distToSegmentSquared(
      px,
      py,
      capsule.p0.x,
      capsule.p0.y,
      capsule.p1.x,
      capsule.p1.y
    );
  };

  const rSq = capsule.radius * capsule.radius;

  // Case 1: Both endpoints inside capsule
  if (inA && inB) {
    return { uEnter: 0, uExit: 1 };
  }

  // Case 2: Endpoint A is inside, B is outside -> exits at uExit
  if (inA && !inB) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (low + high) * 0.5;
      if (distSqAt(mid) <= rSq) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return { uEnter: 0, uExit: (low + high) * 0.5 };
  }

  // Case 3: Endpoint A is outside, B is inside -> enters at uEnter
  if (!inA && inB) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (low + high) * 0.5;
      if (distSqAt(mid) <= rSq) {
        high = mid;
      } else {
        low = mid;
      }
    }
    return { uEnter: (low + high) * 0.5, uExit: 1 };
  }

  // Case 4: Both endpoints outside. Find the parameter of minimum distance.
  // Golden-section search or ternary search on convex distSq function over [0, 1].
  let a = 0;
  let b = 1;
  for (let i = 0; i < 16; i++) {
    const m1 = a + (b - a) / 3;
    const m2 = b - (b - a) / 3;
    if (distSqAt(m1) < distSqAt(m2)) {
      b = m2;
    } else {
      a = m1;
    }
  }
  const uMin = (a + b) * 0.5;
  const minVal = distSqAt(uMin);

  if (minVal > rSq) {
    // Segment never reaches within radius of the capsule
    return null;
  }

  // Segment crosses into capsule between [0, uMin] and exits between [uMin, 1]
  // Binary search for uEnter in [0, uMin]
  let low1 = 0;
  let high1 = uMin;
  for (let i = 0; i < 18; i++) {
    const mid = (low1 + high1) * 0.5;
    if (distSqAt(mid) <= rSq) {
      high1 = mid;
    } else {
      low1 = mid;
    }
  }
  const uEnter = (low1 + high1) * 0.5;

  // Binary search for uExit in [uMin, 1]
  let low2 = uMin;
  let high2 = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (low2 + high2) * 0.5;
    if (distSqAt(mid) <= rSq) {
      low2 = mid;
    } else {
      high2 = mid;
    }
  }
  const uExit = (low2 + high2) * 0.5;

  return { uEnter, uExit };
}

/**
 * Calculates total path length of a series of normalized points in canvas pixel units.
 */
export function getPathLengthPx(
  points: Pt[],
  canvasWidth: number,
  canvasHeight: number
): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = (points[i + 1].x - points[i].x) * canvasWidth;
    const dy = (points[i + 1].y - points[i].y) * canvasHeight;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

function generateNewStrokeId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Erases a single stroke with the given capsule in canvas pixel space.
 * Returns { modified, fragments }. If modified is false, fragments contains the unchanged original stroke.
 */
export function eraseStroke(
  stroke: Stroke,
  capsule: Capsule,
  canvasWidth: number,
  canvasHeight: number,
  mode: EraserMode = 'part'
): { modified: boolean; fragments: Stroke[] } {
  const pts = stroke.points;
  if (pts.length === 0) {
    return { modified: false, fragments: [stroke] };
  }

  // 1. Fast bounding box rejection in pixel space
  let minNormX = pts[0].x;
  let maxNormX = pts[0].x;
  let minNormY = pts[0].y;
  let maxNormY = pts[0].y;

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minNormX) minNormX = p.x;
    if (p.x > maxNormX) maxNormX = p.x;
    if (p.y < minNormY) minNormY = p.y;
    if (p.y > maxNormY) maxNormY = p.y;
  }

  const strokePad = (stroke.width || 3.5) * 0.5;
  const sMinX = minNormX * canvasWidth - strokePad;
  const sMaxX = maxNormX * canvasWidth + strokePad;
  const sMinY = minNormY * canvasHeight - strokePad;
  const sMaxY = maxNormY * canvasHeight + strokePad;

  const cMinX = Math.min(capsule.p0.x, capsule.p1.x) - capsule.radius;
  const cMaxX = Math.max(capsule.p0.x, capsule.p1.x) + capsule.radius;
  const cMinY = Math.min(capsule.p0.y, capsule.p1.y) - capsule.radius;
  const cMaxY = Math.max(capsule.p0.y, capsule.p1.y) + capsule.radius;

  if (sMaxX < cMinX || sMinX > cMaxX || sMaxY < cMinY || sMinY > cMaxY) {
    return { modified: false, fragments: [stroke] };
  }

  // 2. Single-point strokes (taps, drum hits)
  if (pts.length === 1) {
    const ptPx: Point2D = {
      x: pts[0].x * canvasWidth,
      y: pts[0].y * canvasHeight,
    };
    if (isPointInCapsule(ptPx, capsule)) {
      return { modified: true, fragments: [] };
    }
    return { modified: false, fragments: [stroke] };
  }

  // 3. Whole-stroke deletion mode
  if (mode === 'stroke') {
    let touched = false;
    for (let i = 0; i < pts.length; i++) {
      const pPx: Point2D = { x: pts[i].x * canvasWidth, y: pts[i].y * canvasHeight };
      if (isPointInCapsule(pPx, capsule)) {
        touched = true;
        break;
      }
      if (i < pts.length - 1) {
        const nextPx: Point2D = {
          x: pts[i + 1].x * canvasWidth,
          y: pts[i + 1].y * canvasHeight,
        };
        if (getSegmentCapsuleInterval(pPx, nextPx, capsule) !== null) {
          touched = true;
          break;
        }
      }
    }
    if (touched) {
      return { modified: true, fragments: [] };
    }
    return { modified: false, fragments: [stroke] };
  }

  // 4. Partial split mode: Segment-by-segment walk with exact boundary interpolation
  const runs: Pt[][] = [];
  let currentRun: Pt[] = [];
  let wasAnySegmentCut = false;

  const firstPtPx: Point2D = {
    x: pts[0].x * canvasWidth,
    y: pts[0].y * canvasHeight,
  };
  const firstInside = isPointInCapsule(firstPtPx, capsule);

  if (firstInside) {
    wasAnySegmentCut = true;
  } else {
    currentRun.push(pts[0]);
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const pA = pts[i];
    const pB = pts[i + 1];
    const aPx: Point2D = { x: pA.x * canvasWidth, y: pA.y * canvasHeight };
    const bPx: Point2D = { x: pB.x * canvasWidth, y: pB.y * canvasHeight };

    const interval = getSegmentCapsuleInterval(aPx, bPx, capsule);

    if (!interval) {
      // Entire segment lies outside capsule
      currentRun.push(pB);
      continue;
    }

    wasAnySegmentCut = true;
    const { uEnter, uExit } = interval;

    const startsInside = uEnter <= 1e-6;
    const endsInside = uExit >= 1 - 1e-6;

    if (startsInside && endsInside) {
      // Entire segment lies inside capsule
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
    } else if (startsInside && !endsInside) {
      // Starts inside, exits at uExit
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
      const exitPt = interpolatePt(pA, pB, uExit);
      currentRun = [exitPt, pB];
    } else if (!startsInside && endsInside) {
      // Starts outside, enters at uEnter
      const enterPt = interpolatePt(pA, pB, uEnter);
      currentRun.push(enterPt);
      runs.push(currentRun);
      currentRun = [];
    } else {
      // Starts outside, enters at uEnter, exits at uExit, ends outside
      const enterPt = interpolatePt(pA, pB, uEnter);
      const exitPt = interpolatePt(pA, pB, uExit);
      currentRun.push(enterPt);
      runs.push(currentRun);
      currentRun = [exitPt, pB];
    }
  }

  if (currentRun.length > 0) {
    runs.push(currentRun);
    currentRun = [];
  }

  if (!wasAnySegmentCut) {
    return { modified: false, fragments: [stroke] };
  }

  // Filter runs: discard runs shorter than 4px of path length or with < 2 points
  const MIN_PATH_LENGTH_PX = 4.0;
  const fragments: Stroke[] = [];

  for (const run of runs) {
    if (run.length < 2) continue;
    const lengthPx = getPathLengthPx(run, canvasWidth, canvasHeight);
    if (lengthPx < MIN_PATH_LENGTH_PX) continue;

    fragments.push({
      id: generateNewStrokeId(),
      trackId: stroke.trackId,
      points: run,
      width: stroke.width,
    });
  }

  return { modified: true, fragments };
}

/**
 * Erases strokes with given capsule and options.
 * Preserves strokes ordering and returns updated list along with details of modified strokes.
 */
export function eraseStrokes(
  strokes: Stroke[],
  capsule: Capsule,
  canvasWidth: number,
  canvasHeight: number,
  options: EraseOptions
): {
  newStrokes: Stroke[];
  modified: boolean;
  affectedOriginals: { index: number; stroke: Stroke }[];
  resultingFragments: Stroke[];
  removedStrokeIds: string[];
} {
  const newStrokes: Stroke[] = [];
  let modified = false;
  const affectedOriginals: { index: number; stroke: Stroke }[] = [];
  const resultingFragments: Stroke[] = [];
  const removedStrokeIds: string[] = [];

  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i];

    // Optional track filter
    if (
      options.filterTrack &&
      options.selectedTrackId &&
      stroke.trackId !== options.selectedTrackId
    ) {
      newStrokes.push(stroke);
      continue;
    }

    const res = eraseStroke(stroke, capsule, canvasWidth, canvasHeight, options.mode);

    if (!res.modified) {
      newStrokes.push(stroke);
    } else {
      modified = true;
      affectedOriginals.push({ index: i, stroke });
      removedStrokeIds.push(stroke.id);
      for (const frag of res.fragments) {
        newStrokes.push(frag);
        resultingFragments.push(frag);
      }
    }
  }

  return {
    newStrokes,
    modified,
    affectedOriginals,
    resultingFragments,
    removedStrokeIds,
  };
}
