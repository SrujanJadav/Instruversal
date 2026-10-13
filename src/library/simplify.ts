import { Stroke } from '../state';
import { Creation, CreationMeta, SimplifiedPoint, SimplifiedStroke } from './types';
import { DEFAULT_TRACK_CONFIGS } from '../audio/tracks';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * Calculates perpendicular distance from point P to line segment AB.
 */
function perpendicularDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const rx = px - ax;
    const ry = py - ay;
    return Math.sqrt(rx * rx + ry * ry);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const distX = px - projX;
  const distY = py - projY;

  return Math.sqrt(distX * distX + distY * distY);
}

/**
 * Ramer-Douglas-Peucker reduction on 2D normalized points.
 */
function rdp(
  points: { x: number; y: number }[],
  epsilon: number
): { x: number; y: number }[] {
  if (points.length <= 2) {
    return points;
  }

  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(
      points[i].x,
      points[i].y,
      first.x,
      first.y,
      last.x,
      last.y
    );
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [first, last];
  }
}

/**
 * Decimates points uniformly if count exceeds maxPoints.
 */
function decimatePoints(
  points: { x: number; y: number }[],
  maxPoints: number
): { x: number; y: number }[] {
  if (points.length <= maxPoints) {
    return points;
  }
  const result: { x: number; y: number }[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(points.length - 1, Math.round(i * step));
    result.push(points[idx]);
  }
  return result;
}

/**
 * Simplifies an array of stroke points to at most maxPoints (default 60).
 */
export function simplifyPoints(
  points: { x: number; y: number }[],
  maxPoints: number = 60,
  initialEpsilon: number = 0.003
): SimplifiedPoint[] {
  if (!points || points.length === 0) return [];
  if (points.length <= 2) {
    return points.map((p) => ({
      x: Math.round(p.x * 10000) / 10000,
      y: Math.round(p.y * 10000) / 10000,
    }));
  }

  let eps = initialEpsilon;
  let simplified = rdp(points, eps);

  // If still over budget, increase epsilon iteratively
  let attempts = 0;
  while (simplified.length > maxPoints && attempts < 5) {
    eps *= 1.8;
    simplified = rdp(points, eps);
    attempts++;
  }

  // Hard cap safeguard if needed
  if (simplified.length > maxPoints) {
    simplified = decimatePoints(simplified, maxPoints);
  }

  return simplified.map((p) => ({
    x: Math.round(p.x * 10000) / 10000,
    y: Math.round(p.y * 10000) / 10000,
  }));
}

export function simplifyStroke(stroke: Stroke, maxPoints: number = 60): SimplifiedStroke {
  return {
    trackId: stroke.trackId,
    width: Math.round((stroke.width || 3) * 10) / 10,
    points: simplifyPoints(stroke.points, maxPoints),
  };
}

export function formatKeyLabel(rootNote: number = 0, scaleName: string = 'major pentatonic'): string {
  const normRoot = ((Math.round(rootNote) % 12) + 12) % 12;
  const rootStr = NOTE_NAMES[normRoot] || 'C';
  // Capitalize each word in scale name
  const scaleStr = scaleName
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return `${rootStr} ${scaleStr}`;
}

const TRACK_COLOR_VARS: Record<string, string> = {
  'track-1': '--vermilion',
  'track-2': '--indigo',
  'track-3': '--ochre',
  'track-4': '--sage',
  'track-5': '--plum',
  'track-6': '--slate',
};

// Fallback lookup from default track configs
for (const tc of DEFAULT_TRACK_CONFIGS) {
  TRACK_COLOR_VARS[tc.id] = tc.colorVar;
}

export function getTrackColorVar(trackId: string): string {
  return TRACK_COLOR_VARS[trackId] || '--ink';
}

import { effectiveKey } from '../audio/scales';

/**
 * Computes the key label for a project:
 * In linked mode: formats the base key.
 * In perColour mode: returns "Mixed keys" if melodic tracks differ, or the shared key if all match.
 */
export function getProjectKeyLabel(project: { keyMode?: string; rootNote?: number; scaleName?: string; tracks?: any[] }): string {
  const baseLabel = formatKeyLabel(project.rootNote ?? 0, project.scaleName || 'major pentatonic');
  if (project.keyMode !== 'perColour' || !Array.isArray(project.tracks) || project.tracks.length === 0) {
    return baseLabel;
  }

  const melodicTracks = project.tracks.filter((t) => t.trackType !== 'beat');
  if (melodicTracks.length <= 1) {
    if (melodicTracks.length === 1) {
      const eff = effectiveKey(melodicTracks[0], project as any);
      return formatKeyLabel(eff.root, eff.scale);
    }
    return baseLabel;
  }

  const firstEff = effectiveKey(melodicTracks[0], project as any);
  const firstKeyId = `${firstEff.root}:${firstEff.scale}`;
  for (let i = 1; i < melodicTracks.length; i++) {
    const eff = effectiveKey(melodicTracks[i], project as any);
    if (`${eff.root}:${eff.scale}` !== firstKeyId) {
      return 'Mixed keys';
    }
  }

  return formatKeyLabel(firstEff.root, firstEff.scale);
}

/**
 * Extracts lightweight CreationMeta from a full Creation object for high-performance listing.
 */
export function extractCreationMeta(creation: Creation): CreationMeta {
  const proj = creation.project;
  const strokes = Array.isArray(proj.strokes) ? proj.strokes : [];
  const trackColorsSet = new Set<string>();

  for (const s of strokes) {
    trackColorsSet.add(getTrackColorVar(s.trackId));
  }

  const simplifiedStrokes = strokes.map((s) => simplifyStroke(s, 60));

  return {
    id: creation.id,
    title: creation.title || 'Untitled sketch',
    createdAt: creation.createdAt,
    updatedAt: creation.updatedAt,
    bpm: proj.bpm || 90,
    bars: proj.bars || 2,
    rootNote: proj.rootNote ?? 0,
    scaleName: proj.scaleName || 'major pentatonic',
    keyLabel: getProjectKeyLabel(proj),
    trackColors: Array.from(trackColorsSet),
    strokeCount: strokes.length,
    simplifiedStrokes,
  };
}

