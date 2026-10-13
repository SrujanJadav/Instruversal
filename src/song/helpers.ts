import {
  Song,
  SongPlacement,
  SongLane,
  SongAsset,
  SONG_LIMITS,
  DEFAULT_MASTER_SETTINGS,
} from './types';
import { Creation } from '../library/types';

/**
 * Calculates total bars of a song based on all placements and markers.
 */
export function songLengthBars(song: Pick<Song, 'placements' | 'markers'>): number {
  let maxBar = 4;
  if (song.placements) {
    for (const p of song.placements) {
      const end = p.startBar + p.lengthBars;
      if (end > maxBar) maxBar = end;
    }
  }
  if (song.markers) {
    for (const m of song.markers) {
      if (m.bar + 1 > maxBar) maxBar = m.bar + 1;
    }
  }
  return Math.min(SONG_LIMITS.MAX_TOTAL_BARS, Math.max(SONG_LIMITS.MIN_TOTAL_BARS, maxBar));
}

/**
 * Checks whether a candidate placement overlaps with any existing placement on the same lane.
 */
export function hasPlacementOverlap(
  placements: SongPlacement[],
  candidate: Pick<SongPlacement, 'id' | 'laneId' | 'startBar' | 'lengthBars'>
): boolean {
  const cStart = candidate.startBar;
  const cEnd = candidate.startBar + candidate.lengthBars;

  for (const p of placements) {
    if (p.id === candidate.id) continue;
    if (p.laneId !== candidate.laneId) continue;

    const pStart = p.startBar;
    const pEnd = p.startBar + p.lengthBars;

    // Overlap condition: not (cEnd <= pStart || pEnd <= cStart)
    if (cStart < pEnd && cEnd > pStart) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the earliest startBar >= preferredStartBar on a given lane where lengthBars fits without overlapping.
 */
export function findFreeSlot(
  placements: SongPlacement[],
  laneId: string,
  preferredStartBar: number,
  lengthBars: number
): number {
  const lanePlacements = placements
    .filter((p) => p.laneId === laneId)
    .sort((a, b) => a.startBar - b.startBar);

  let candidate = Math.max(0, preferredStartBar);

  while (candidate + lengthBars <= SONG_LIMITS.MAX_TOTAL_BARS) {
    const collides = lanePlacements.some((p) => {
      const pStart = p.startBar;
      const pEnd = p.startBar + p.lengthBars;
      return candidate < pEnd && candidate + lengthBars > pStart;
    });

    if (!collides) {
      return candidate;
    }

    // Advance candidate past the next colliding block
    const collision = lanePlacements.find((p) => {
      const pStart = p.startBar;
      const pEnd = p.startBar + p.lengthBars;
      return candidate < pEnd && candidate + lengthBars > pStart;
    });

    if (collision) {
      candidate = collision.startBar + collision.lengthBars;
    } else {
      candidate++;
    }
  }

  // If no slot found after preferredStartBar, try searching from bar 0
  if (preferredStartBar > 0) {
    let earlyCandidate = 0;
    while (earlyCandidate + lengthBars <= preferredStartBar) {
      const collides = lanePlacements.some((p) => {
        const pStart = p.startBar;
        const pEnd = p.startBar + p.lengthBars;
        return earlyCandidate < pEnd && earlyCandidate + lengthBars > pStart;
      });
      if (!collides) return earlyCandidate;

      const collision = lanePlacements.find((p) => {
        const pStart = p.startBar;
        const pEnd = p.startBar + p.lengthBars;
        return earlyCandidate < pEnd && earlyCandidate + lengthBars > pStart;
      });
      if (collision) {
        earlyCandidate = collision.startBar + collision.lengthBars;
      } else {
        earlyCandidate++;
      }
    }
  }

  return candidate;
}

/**
 * Splits a placement into two adjacent placements at the specified bar.
 * Maintains musical phase `offsetBars`.
 */
export function splitPlacement(
  placement: SongPlacement,
  atBar: number,
  assetLoopLength: number = 4
): [SongPlacement, SongPlacement] {
  const start = placement.startBar;
  const end = placement.startBar + placement.lengthBars;

  if (atBar <= start || atBar >= end) {
    throw new Error(`Split bar ${atBar} must be strictly between startBar ${start} and endBar ${end}.`);
  }

  const leftLength = atBar - start;
  const rightLength = end - atBar;

  const left: SongPlacement = {
    ...placement,
    id: placement.id,
    startBar: start,
    lengthBars: leftLength,
    offsetBars: placement.offsetBars,
  };

  const delta = leftLength;
  const rightOffset = assetLoopLength > 0
    ? (placement.offsetBars + delta) % assetLoopLength
    : placement.offsetBars + delta;

  const right: SongPlacement = {
    ...placement,
    id: `placement-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    startBar: atBar,
    lengthBars: rightLength,
    offsetBars: rightOffset,
  };

  return [left, right];
}

/**
 * Trims a placement from the left, adjusting startBar, lengthBars, and offsetBars.
 */
export function trimPlacementLeft(
  placement: SongPlacement,
  newStartBar: number,
  assetLoopLength: number = 4
): SongPlacement {
  const maxStart = placement.startBar + placement.lengthBars - 1;
  const clampedStart = Math.max(0, Math.min(maxStart, newStartBar));
  const delta = clampedStart - placement.startBar;

  if (delta === 0) return { ...placement };

  const newOffset = assetLoopLength > 0
    ? (placement.offsetBars + delta) % assetLoopLength
    : placement.offsetBars + delta;

  return {
    ...placement,
    startBar: clampedStart,
    lengthBars: placement.lengthBars - delta,
    offsetBars: newOffset,
  };
}

/**
 * Trims a placement from the right, adjusting lengthBars.
 */
export function trimPlacementRight(
  placement: SongPlacement,
  newLengthBars: number
): SongPlacement {
  const clampedLength = Math.max(1, Math.min(SONG_LIMITS.MAX_TOTAL_BARS - placement.startBar, newLengthBars));
  return {
    ...placement,
    lengthBars: clampedLength,
  };
}

/**
 * Creates a brand new default Song from a saved Creation sketch.
 */
export function createSongFromCreation(creation: Creation): Song {
  const now = Date.now();
  const assetId = `asset-1`;
  const laneId = `lane-1`;
  const placementId = `placement-1`;
  const sketchBars = creation.project?.bars ?? 2;
  const bpm = creation.project?.bpm ?? 90;

  const asset: SongAsset = {
    name: creation.title || 'Sketch',
    project: JSON.parse(JSON.stringify(creation.project)),
    sourceCreationId: creation.id,
    sourceUpdatedAt: creation.updatedAt,
  };

  const lane: SongLane = {
    id: laneId,
    name: 'Lane 1',
    volumeDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    sendReverb: 0,
    sendDelay: 0,
  };

  const placement: SongPlacement = {
    id: placementId,
    assetId,
    laneId,
    startBar: 0,
    lengthBars: sketchBars,
    offsetBars: 0,
    gainDb: 0,
    transpose: 0,
    fadeInBars: 0,
    fadeOutBars: 0,
    mute: false,
  };

  return {
    schemaVersion: 1,
    id: `song-${now}-${Math.random().toString(36).substring(2, 6)}`,
    title: creation.title ? `${creation.title} Song` : 'Untitled song',
    bpm,
    beatsPerBar: 4,
    totalBars: Math.max(sketchBars, 4),
    assets: { [assetId]: asset },
    lanes: [lane],
    placements: [placement],
    markers: [{ id: 'marker-1', bar: 0, label: 'Intro' }],
    master: { ...DEFAULT_MASTER_SETTINGS },
    loopRegion: null,
    createdAt: now,
    updatedAt: now,
    isPublic: false,
    publicSlug: null,
  };
}

/**
 * Adds a creation as an asset in the song, deduplicating by sourceCreationId and sourceUpdatedAt.
 */
export function addAsset(
  song: Song,
  creation: Creation
): { song: Song; assetId: string } {
  // Check if asset already exists
  for (const [id, a] of Object.entries(song.assets)) {
    if (
      a.sourceCreationId === creation.id &&
      String(a.sourceUpdatedAt) === String(creation.updatedAt)
    ) {
      return { song, assetId: id };
    }
  }

  // Check asset limit
  const currentAssetCount = Object.keys(song.assets).length;
  if (currentAssetCount >= SONG_LIMITS.MAX_ASSETS) {
    throw new Error(`Song asset limit of ${SONG_LIMITS.MAX_ASSETS} reached.`);
  }

  const assetId = `asset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const updatedAssets = {
    ...song.assets,
    [assetId]: {
      name: creation.title || 'Sketch',
      project: JSON.parse(JSON.stringify(creation.project)),
      sourceCreationId: creation.id,
      sourceUpdatedAt: creation.updatedAt,
    },
  };

  return {
    song: {
      ...song,
      assets: updatedAssets,
      updatedAt: Date.now(),
    },
    assetId,
  };
}

/**
 * Removes any assets that are not referenced by any placement in the song.
 */
export function removeUnusedAssets(song: Song): Song {
  const usedAssetIds = new Set(song.placements.map((p) => p.assetId));
  const cleanedAssets: Record<string, SongAsset> = {};

  for (const [id, asset] of Object.entries(song.assets)) {
    if (usedAssetIds.has(id)) {
      cleanedAssets[id] = asset;
    }
  }

  return {
    ...song,
    assets: cleanedAssets,
    updatedAt: Date.now(),
  };
}
