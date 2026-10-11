import { ProjectData, SimplifiedStroke } from './types';
import { simplifyPoints, formatKeyLabel, getTrackColorVar } from './simplify';

export interface PreviewData {
  strokes: SimplifiedStroke[];
  bpm?: number;
  keyLabel?: string;
  trackColors?: string[];
}

/**
 * Simplifies points to 3 decimal places precision to optimize JSON footprint.
 */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Generates compact PreviewData from full ProjectData.
 * Constraints:
 * - Capped at max 150 strokes
 * - Capped at max 60 points per stroke via RDP
 * - 3 decimal precision
 * - Strictly under 15 KB JSON string size for Supabase preview column constraint
 */
export function generatePreview(project: ProjectData): PreviewData {
  const strokes = Array.isArray(project.strokes) ? project.strokes : [];
  const trackColorsSet = new Set<string>();

  for (const s of strokes) {
    trackColorsSet.add(getTrackColorVar(s.trackId));
  }

  // Cap at 150 strokes to avoid excessive payload
  const cappedStrokes = strokes.slice(0, 150);

  let maxPointsPerStroke = 60;
  let simplified: SimplifiedStroke[] = cappedStrokes.map((s) => {
    const rawSimplified = simplifyPoints(s.points, maxPointsPerStroke, 0.004);
    return {
      trackId: s.trackId,
      width: Math.round((s.width || 3) * 10) / 10,
      points: rawSimplified.map((pt) => ({
        x: round3(pt.x),
        y: round3(pt.y),
      })),
    };
  });

  const preview: PreviewData = {
    strokes: simplified,
    bpm: project.bpm || 90,
    keyLabel: formatKeyLabel(project.rootNote ?? 0, project.scaleName || 'major pentatonic'),
    trackColors: Array.from(trackColorsSet),
  };

  // Ensure JSON byte size is strictly under 14,500 bytes (safety headroom under 15,000 DB limit)
  let json = JSON.stringify(preview);
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  let byteLen = encoder ? encoder.encode(json).length : json.length;

  // If still too large, aggressively reduce stroke count until under threshold
  while (byteLen > 14000 && preview.strokes.length > 10) {
    preview.strokes = preview.strokes.slice(0, Math.floor(preview.strokes.length * 0.8));
    json = JSON.stringify(preview);
    byteLen = encoder ? encoder.encode(json).length : json.length;
  }

  return preview;
}
