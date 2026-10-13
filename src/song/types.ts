import { ProjectData, SyncStatus } from '../library/types';
import { FxConfig, DEFAULT_FX_CONFIG } from '../state';

export interface SongAsset {
  name: string;
  project: ProjectData;
  sourceCreationId?: string;
  sourceUpdatedAt?: number | string;
}

export interface SongLane {
  id: string; // e.g. 'lane-1'
  name: string;
  volumeDb: number; // -60 to +6 dB (clamped, default 0)
  pan: number; // -1 to +1 (clamped, default 0)
  mute: boolean;
  solo: boolean;
  sendReverb: number; // 0 to 1 (clamped, default 0)
  sendDelay: number; // 0 to 1 (clamped, default 0)
}

export interface SongPlacement {
  id: string;
  assetId: string;
  laneId: string;
  startBar: number; // 0-indexed bar (0 to 127)
  lengthBars: number; // 1 to 128 bars
  offsetBars: number; // phase offset in asset loop (0 to 7)
  gainDb: number; // -36 to +6 dB (default 0)
  transpose: number; // -24 to +24 semitones (melodic only, default 0)
  fadeInBars: number; // 0 to 4 bars
  fadeOutBars: number; // 0 to 4 bars
  mute: boolean;
  mutedColors?: string[]; // optional array of pigment IDs
}

export interface SongMarker {
  id: string;
  bar: number; // 0 to 127
  label: string; // 1 to 24 chars
}

export type MasteringPreset = 'clean' | 'warm' | 'bright' | 'loud' | 'lo-fi' | 'custom';

export interface SongMasterSettings {
  gainDb: number; // -60 to +6 dB (default 0)
  eq: {
    lowDb: number; // -12 to +12 dB
    midDb: number; // -12 to +12 dB
    highDb: number; // -12 to +12 dB
  };
  compressor: {
    on: boolean;
    thresholdDb: number; // -40 to 0 dB
    ratio: number; // 1 to 20
    attackMs: number; // 1 to 100 ms
    releaseMs: number; // 20 to 1000 ms
    makeupDb: number; // 0 to 20 dB
  };
  effects: FxConfig;
  preset: MasteringPreset;
}

export interface Song {
  schemaVersion: number; // 1
  id: string;
  title: string; // 1 to 80 chars
  bpm: number; // 50 to 180
  beatsPerBar: number; // 4
  totalBars: number; // derived, 1 to 128
  assets: Record<string, SongAsset>; // max 12 unique assets
  lanes: SongLane[]; // 1 to 6 lanes
  placements: SongPlacement[]; // max 200 placements
  markers: SongMarker[]; // max 40 markers
  master: SongMasterSettings;
  loopRegion: { startBar: number; endBar: number } | null;
  createdAt: number;
  updatedAt: number;
  syncStatus?: SyncStatus;
  isPublic?: boolean;
  publicSlug?: string | null;
}

export interface SongPreviewBlock {
  laneIndex: number;
  startBar: number;
  lengthBars: number;
  color: string;
}

export interface SongPreview {
  bpm: number;
  totalBars: number;
  lanesCount: number;
  blocks: SongPreviewBlock[];
}

export const SONG_LIMITS = {
  MAX_LANES: 6,
  MIN_LANES: 1,
  MAX_ASSETS: 12,
  MAX_PLACEMENTS: 200,
  MAX_MARKERS: 40,
  MAX_TOTAL_BARS: 128,
  MIN_TOTAL_BARS: 1,
  MIN_BPM: 50,
  MAX_BPM: 180,
  DEFAULT_BPM: 90,
  MAX_TITLE_LENGTH: 80,
  MAX_SERIALIZED_BYTES: 3000000, // 3 MB
  MAX_PREVIEW_BYTES: 20480, // 20 KB
  MAX_LOCAL_SONGS: 30,
  MAX_CLOUD_SONGS: 20,
} as const;

export const DEFAULT_MASTER_SETTINGS: SongMasterSettings = {
  gainDb: 0,
  eq: { lowDb: 0, midDb: 0, highDb: 0 },
  compressor: {
    on: false,
    thresholdDb: -16,
    ratio: 3,
    attackMs: 20,
    releaseMs: 250,
    makeupDb: 2,
  },
  effects: { ...DEFAULT_FX_CONFIG },
  preset: 'clean',
};
