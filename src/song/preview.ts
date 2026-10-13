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

/**
 * Pure function: Renders a theme-aware SVG timeline thumbnail for song cards and gallery previews.
 */
export function renderSongTimelineThumbnailSvg(preview?: SongPreview | null): string {
  const width = 320;
  const height = 180;
  const padX = 12;
  const padY = 12;
  const contentW = width - padX * 2;
  const contentH = height - padY * 2;

  if (!preview || !preview.blocks || preview.blocks.length === 0) {
    return `
      <svg class="song-card-svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="var(--paper-deep, #E9DFCB)" rx="6"/>
        <line x1="${padX}" y1="${height / 2}" x2="${width - padX}" y2="${height / 2}" stroke="var(--line, rgba(28,26,22,0.14))" stroke-width="1" stroke-dasharray="4 4"/>
      </svg>
    `.trim();
  }

  const totalBars = Math.max(1, preview.totalBars || 16);
  const lanesCount = Math.max(1, Math.min(8, preview.lanesCount || 4));
  const rowH = contentH / lanesCount;

  // Grid lines
  let gridLinesSvg = '';
  for (let i = 1; i < lanesCount; i++) {
    const y = padY + i * rowH;
    gridLinesSvg += `<line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="var(--line, rgba(28,26,22,0.14))" stroke-width="1"/>`;
  }

  // Clip blocks
  let blocksSvg = '';
  for (const block of preview.blocks) {
    const x = padX + (block.startBar / totalBars) * contentW;
    const blockW = Math.max(4, (block.lengthBars / totalBars) * contentW - 2);
    const laneIdx = Math.min(lanesCount - 1, Math.max(0, block.laneIndex));
    const y = padY + laneIdx * rowH + 2;
    const blockH = Math.max(4, rowH - 4);
    const colorVar = block.color.startsWith('--') ? block.color : `--${block.color}`;

    blocksSvg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${blockW.toFixed(1)}" height="${blockH.toFixed(1)}" rx="3" fill="var(${colorVar}, #D2432A)" opacity="0.88"/>`;
  }

  return `
    <svg class="song-card-svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="var(--paper-deep, #E9DFCB)" rx="6"/>
      ${gridLinesSvg}
      ${blocksSvg}
    </svg>
  `.trim();
}
