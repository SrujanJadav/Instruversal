import { Song, SongPreview, SongPreviewBlock, SONG_LIMITS } from './types';
import { getTrackColorVar } from '../library/simplify';

/**
 * Finds the primary visual pigment for an asset based on stroke frequency.
 */
function getAssetPrimaryColor(asset: Song['assets'][string] | undefined): string {
  if (!asset || !asset.project) return '--vermilion';

  const strokes = Array.isArray(asset.project.strokes) ? asset.project.strokes : [];
  if (strokes.length === 0) {
    const firstTrack = asset.project.tracks?.[0];
    return firstTrack ? getTrackColorVar(firstTrack.id) : '--vermilion';
  }

  // Count stroke occurrences per trackId
  const counts: Record<string, number> = {};
  for (const s of strokes) {
    if (s && s.trackId) {
      counts[s.trackId] = (counts[s.trackId] || 0) + 1;
    }
  }

  let bestTrackId = '';
  let maxCount = -1;
  for (const [tId, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      bestTrackId = tId;
    }
  }

  return bestTrackId ? getTrackColorVar(bestTrackId) : '--vermilion';
}

/**
 * Generates a compact JSON preview of a song timeline.
 * Guaranteed to be strictly under 20,480 bytes (20 KB).
 */
export function buildSongPreview(song: Song): SongPreview {
  const laneIndexMap = new Map<string, number>();
  song.lanes.forEach((lane, idx) => {
    laneIndexMap.set(lane.id, idx);
  });

  const blocks: SongPreviewBlock[] = [];

  for (const p of song.placements) {
    const laneIndex = laneIndexMap.get(p.laneId) ?? 0;
    const asset = song.assets[p.assetId];
    const color = getAssetPrimaryColor(asset);

    blocks.push({
      laneIndex,
      startBar: p.startBar,
      lengthBars: p.lengthBars,
      color,
    });
  }

  // Sort blocks by startBar then laneIndex
  blocks.sort((a, b) => a.startBar - b.startBar || a.laneIndex - b.laneIndex);

  const preview: SongPreview = {
    bpm: song.bpm || 90,
    totalBars: song.totalBars || 4,
    lanesCount: song.lanes.length || 1,
    blocks,
  };

  // Size guard: ensure payload is strictly within 20 KB
  let json = JSON.stringify(preview);
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  let byteLen = encoder ? encoder.encode(json).length : json.length;

  while (byteLen > SONG_LIMITS.MAX_PREVIEW_BYTES && preview.blocks.length > 10) {
    preview.blocks = preview.blocks.slice(0, Math.floor(preview.blocks.length * 0.8));
    json = JSON.stringify(preview);
    byteLen = encoder ? encoder.encode(json).length : json.length;
  }

  return preview;
}
