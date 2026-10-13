import { Stroke, Pt as Point } from '../state';

export interface StrokeBranch {
  id: string;
  strokeId: string;
  trackId: string;
  points: Point[]; // Points sorted so x ascends from xStart to xEnd
  rawPoints: Point[]; // Points in their original drawn order
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  width: number;
  priority: number;
  isSweep: boolean;
  originalDirection: 'ltr' | 'rtl';
}

export const RDP_EPSILON = 0.004;
export const HYSTERESIS_THRESHOLD = 0.015;
export const MIN_BRANCH_LENGTH = 0.02;

/**
 * Cache for derived branches to avoid recomputing on every frame or playback cycle.
 */
const branchCache = new Map<string, StrokeBranch[]>();

export function clearBranchCache(): void {
  branchCache.clear();
}

/**
 * Calculates perpendicular distance from point p to line segment (p1, p2).
 */
function perpendicularDistance(p: Point, p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-10) {
    const dpx = p.x - p1.x;
    const dpy = p.y - p1.y;
    return Math.sqrt(dpx * dpx + dpy * dpy);
  }

  const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lenSq));
  const projX = p1.x + t * dx;
  const projY = p1.y + t * dy;
  const rx = p.x - projX;
  const ry = p.y - projY;
  return Math.sqrt(rx * rx + ry * ry);
}

/**
 * Standard Ramer-Douglas-Peucker simplification on normalized points.
 */
export function simplifyPointsRDP(points: Point[], epsilon: number = RDP_EPSILON): Point[] {
  if (points.length <= 2) return [...points];

  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const rec1 = simplifyPointsRDP(points.slice(0, index + 1), epsilon);
    const rec2 = simplifyPointsRDP(points.slice(index), epsilon);
    return rec1.slice(0, rec1.length - 1).concat(rec2);
  }

  return [start, end];
}

/**
 * Extracts turning point indices in the raw points array using hysteresis.
 */
export function findTurningPointIndices(points: Point[], hysteresis: number = HYSTERESIS_THRESHOLD): number[] {
  if (points.length <= 2) return [];

  const turningIndices: number[] = [];
  let dir: 'none' | 'ltr' | 'rtl' = 'none';
  let refX = points[0].x;
  let peakX = points[0].x;
  let peakIndex = 0;

  for (let i = 1; i < points.length; i++) {
    const px = points[i].x;

    if (dir === 'none') {
      if (px - refX > hysteresis) {
        dir = 'ltr';
        peakX = px;
        peakIndex = i;
      } else if (refX - px > hysteresis) {
        dir = 'rtl';
        peakX = px;
        peakIndex = i;
      }
    } else if (dir === 'ltr') {
      if (px > peakX) {
        peakX = px;
        peakIndex = i;
      } else if (peakX - px > hysteresis) {
        // Reversal detected at peakIndex
        turningIndices.push(peakIndex);
        dir = 'rtl';
        refX = px;
        peakX = px;
        peakIndex = i;
      }
    } else if (dir === 'rtl') {
      if (px < peakX) {
        peakX = px;
        peakIndex = i;
      } else if (px - peakX > hysteresis) {
        // Reversal detected at peakIndex
        turningIndices.push(peakIndex);
        dir = 'ltr';
        refX = px;
        peakX = px;
        peakIndex = i;
      }
    }
  }

  return turningIndices;
}

/**
 * Pure function: splits a stroke into branches that are monotonic functions of X.
 */
export function extractBranchesFromStroke(stroke: Stroke): StrokeBranch[] {
  const pts = stroke.points;
  if (pts.length === 0) return [];

  // Single-point tap
  if (pts.length === 1) {
    const p = pts[0];
    return [
      {
        id: `${stroke.id}-b0`,
        strokeId: stroke.id,
        trackId: stroke.trackId,
        points: [{ ...p }],
        rawPoints: [{ ...p }],
        xStart: p.x,
        xEnd: Math.min(1, p.x + 0.001),
        yStart: p.y,
        yEnd: p.y,
        width: stroke.width,
        priority: 1.0,
        isSweep: false,
        originalDirection: 'ltr',
      },
    ];
  }

  // Check if stroke as a whole is near-vertical sweep: dx < 0.015 and dy > 0.06
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const isSweep = (maxX - minX) < 0.03 && (maxY - minY) > 0.06;
  if (isSweep) {
    return [
      {
        id: `${stroke.id}-b0`,
        strokeId: stroke.id,
        trackId: stroke.trackId,
        points: [...pts],
        rawPoints: [...pts],
        xStart: minX,
        xEnd: Math.max(maxX, minX + 0.001),
        yStart: pts[0].y,
        yEnd: pts[pts.length - 1].y,
        width: stroke.width,
        priority: 1.5,
        isSweep: true,
        originalDirection: 'ltr',
      },
    ];
  }

  // Fix 3: Simplify the raw points with RDP before turning-point detection so
  // that hand-tremor micro-jitter does not create spurious X-reversals.
  const ptsForTurns = simplifyPointsRDP(pts, RDP_EPSILON);

  // Detect turning points using hysteresis on the simplified polyline.
  const turningIndicesOnSimplified = findTurningPointIndices(ptsForTurns, HYSTERESIS_THRESHOLD);

  // Map turning-point indices back to the nearest raw-point index so slices
  // keep all original precision for interpolation.
  const turningIndices: number[] = turningIndicesOnSimplified.map((simplIdx) => {
    const targetX = ptsForTurns[simplIdx].x;
    const targetY = ptsForTurns[simplIdx].y;
    let bestRaw = 0;
    let bestDist = Infinity;
    for (let ri = 0; ri < pts.length; ri++) {
      const dx = pts[ri].x - targetX;
      const dy = pts[ri].y - targetY;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestRaw = ri; }
    }
    return bestRaw;
  });

  // Split into raw slices at the mapped raw turning-point indices.
  const slices: Point[][] = [];
  let startIndex = 0;
  for (const turnIdx of turningIndices) {
    if (turnIdx > startIndex) {
      slices.push(pts.slice(startIndex, turnIdx + 1));
      startIndex = turnIdx;
    }
  }
  if (startIndex < pts.length) {
    slices.push(pts.slice(startIndex));
  }

  // Convert slices into branches
  const rawBranches: StrokeBranch[] = [];
  for (let i = 0; i < slices.length; i++) {
    const rawSlice = slices[i];
    if (rawSlice.length === 0) continue;

    const firstPt = rawSlice[0];
    const lastPt = rawSlice[rawSlice.length - 1];
    const originalDirection: 'ltr' | 'rtl' = firstPt.x <= lastPt.x ? 'ltr' : 'rtl';

    // Fix 1: Compute xStart/xEnd from the TRUE extrema of every point in the
    // slice, not just the slice endpoints.  Curved arcs and human hand tremor
    // mean the endpoints are rarely the true min/max X in the slice.
    let branchMinX = Infinity;
    let branchMaxX = -Infinity;
    for (const p of rawSlice) {
      if (p.x < branchMinX) branchMinX = p.x;
      if (p.x > branchMaxX) branchMaxX = p.x;
    }
    const xRange = branchMaxX - branchMinX;

    // Fix 2: Sort a copy of the slice points by ascending X so that
    // interpolateBranchY's piecewise segment search (p1.x <= targetX <= p2.x)
    // never encounters a backwards segment and skips it.
    const ascendingPoints = [...rawSlice].sort((a, b) => a.x - b.x);

    rawBranches.push({
      id: `${stroke.id}-b${i}`,
      strokeId: stroke.id,
      trackId: stroke.trackId,
      points: ascendingPoints,
      rawPoints: [...rawSlice],
      xStart: branchMinX,
      xEnd: branchMaxX,
      yStart: firstPt.y,
      yEnd: lastPt.y,
      width: stroke.width,
      priority: xRange * 10 + stroke.width,
      isSweep: false,
      originalDirection,
    });
  }

  // Post-processing: merge tiny branches (< 0.02 wide) if pitch difference is small
  if (rawBranches.length > 1) {
    const filtered: StrokeBranch[] = [];
    for (let i = 0; i < rawBranches.length; i++) {
      const b = rawBranches[i];
      const length = b.xEnd - b.xStart;
      if (length < MIN_BRANCH_LENGTH && filtered.length > 0) {
        // Merge into previous branch if pitch is close
        const prev = filtered[filtered.length - 1];
        const yDiff = Math.abs(b.yStart - prev.yEnd);
        if (yDiff < 0.06) {
          prev.points = [...prev.points, ...b.points].sort((p1, p2) => p1.x - p2.x);
          prev.rawPoints = [...prev.rawPoints, ...b.rawPoints];
          prev.xStart = Math.min(prev.xStart, b.xStart);
          prev.xEnd = Math.max(prev.xEnd, b.xEnd);
          prev.yEnd = b.yEnd;
          prev.priority = (prev.xEnd - prev.xStart) * 10 + prev.width;
          continue;
        }
      }
      filtered.push(b);
    }
    return filtered.map((b, idx) => ({ ...b, id: `${stroke.id}-b${idx}` }));
  }

  return rawBranches;
}

/**
 * Cached lookup of branches for a stroke.
 */
export function getStrokeBranches(stroke: Stroke): StrokeBranch[] {
  const cacheKey = `${stroke.id}:${stroke.points.length}:${stroke.width}`;
  const existing = branchCache.get(cacheKey);
  if (existing) return existing;

  const branches = extractBranchesFromStroke(stroke);
  branchCache.set(cacheKey, branches);
  return branches;
}

/**
 * Linear piecewise interpolation of branch y at targetX.
 */
export function interpolateBranchY(branch: StrokeBranch, targetX: number): number {
  const pts = branch.points;
  if (pts.length === 0) return 0.5;
  if (pts.length === 1) return pts[0].y;

  if (targetX <= pts[0].x) return pts[0].y;
  if (targetX >= pts[pts.length - 1].x) return pts[pts.length - 1].y;

  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (targetX >= p1.x && targetX <= p2.x) {
      const dx = p2.x - p1.x;
      if (Math.abs(dx) < 1e-6) return p1.y;
      const t = (targetX - p1.x) / dx;
      return p1.y + t * (p2.y - p1.y);
    }
  }

  return pts[0].y;
}
