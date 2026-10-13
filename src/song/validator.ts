import {
  Song,
  SongLane,
  SongPlacement,
  SongMarker,
  SongMasterSettings,
  SongAsset,
  SONG_LIMITS,
  MasteringPreset,
} from './types';
import { validateProject, ValidationResult, sanitizeTitle } from '../library/validator';
import { DEFAULT_FX_CONFIG, FxConfig } from '../state';

function clamp(val: unknown, min: number, max: number, defaultVal: number): number {
  if (typeof val !== 'number' || isNaN(val)) return defaultVal;
  return Math.max(min, Math.min(max, val));
}

function clampInt(val: unknown, min: number, max: number, defaultVal: number): number {
  if (typeof val !== 'number' || isNaN(val)) return defaultVal;
  return Math.max(min, Math.min(max, Math.round(val)));
}

const VALID_PRESETS = new Set<MasteringPreset>([
  'clean',
  'warm',
  'bright',
  'loud',
  'lo-fi',
  'custom',
]);

export function migrateSong(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  const migrated = { ...raw };
  if (!migrated.schemaVersion || migrated.schemaVersion < 1) {
    migrated.schemaVersion = 1;
  }
  return migrated;
}

export function validateSong(raw: unknown): ValidationResult<Song> {
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, error: 'Song data must be a valid object.' };
  }

  // Check serialized size limit (max 3 MB)
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return { isValid: false, error: 'Song data could not be serialized to JSON.' };
  }

  const byteLength = new TextEncoder().encode(serialized).length;
  if (byteLength > SONG_LIMITS.MAX_SERIALIZED_BYTES) {
    return {
      isValid: false,
      error: `Song size (${byteLength} bytes) exceeds maximum allowed size of ${SONG_LIMITS.MAX_SERIALIZED_BYTES} bytes (3 MB).`,
    };
  }

  const s = migrateSong(raw);

  const schemaVersion = 1;
  const id = typeof s.id === 'string' && s.id.trim() ? s.id.trim() : 'song-' + Date.now();
  const title = sanitizeTitle(s.title, 'Untitled song');

  const bpm = clampInt(s.bpm, SONG_LIMITS.MIN_BPM, SONG_LIMITS.MAX_BPM, SONG_LIMITS.DEFAULT_BPM);
  const beatsPerBar = 4;

  // Validate assets (max 12)
  const validAssets: Record<string, SongAsset> = {};
  if (s.assets && typeof s.assets === 'object' && !Array.isArray(s.assets)) {
    const assetKeys = Object.keys(s.assets).slice(0, SONG_LIMITS.MAX_ASSETS);
    for (const key of assetKeys) {
      const a = s.assets[key];
      if (!a || typeof a !== 'object') continue;
      const projValidation = validateProject(a.project);
      if (!projValidation.isValid || !projValidation.data) {
        warnings.push(`Asset "${key}" contains invalid project data and was skipped.`);
        continue;
      }
      validAssets[key] = {
        name: typeof a.name === 'string' ? a.name.slice(0, 50) : 'Sketch',
        project: projValidation.data,
        sourceCreationId: typeof a.sourceCreationId === 'string' ? a.sourceCreationId : undefined,
        sourceUpdatedAt:
          typeof a.sourceUpdatedAt === 'number' || typeof a.sourceUpdatedAt === 'string'
            ? a.sourceUpdatedAt
            : undefined,
      };
    }
  }

  // Validate lanes (1 to 6)
  let rawLanes = Array.isArray(s.lanes) ? s.lanes : [];
  if (rawLanes.length === 0) {
    rawLanes = [
      {
        id: 'lane-1',
        name: 'Lane 1',
        volumeDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        sendReverb: 0,
        sendDelay: 0,
      },
    ];
  }
  const lanes: SongLane[] = [];
  const laneIds = new Set<string>();

  for (let i = 0; i < Math.min(rawLanes.length, SONG_LIMITS.MAX_LANES); i++) {
    const l = rawLanes[i];
    if (!l || typeof l !== 'object') continue;
    let lId = typeof l.id === 'string' && l.id.trim() ? l.id.trim() : `lane-${i + 1}`;
    if (laneIds.has(lId)) lId = `lane-${i + 1}-${Math.random().toString(36).substring(2, 6)}`;
    laneIds.add(lId);

    lanes.push({
      id: lId,
      name: typeof l.name === 'string' ? l.name.trim().slice(0, 30) || `Lane ${i + 1}` : `Lane ${i + 1}`,
      volumeDb: clamp(l.volumeDb, -60, 6, 0),
      pan: clamp(l.pan, -1, 1, 0),
      mute: Boolean(l.mute),
      solo: Boolean(l.solo),
      sendReverb: clamp(l.sendReverb, 0, 1, 0),
      sendDelay: clamp(l.sendDelay, 0, 1, 0),
    });
  }

  if (lanes.length === 0) {
    lanes.push({
      id: 'lane-1',
      name: 'Lane 1',
      volumeDb: 0,
      pan: 0,
      mute: false,
      solo: false,
      sendReverb: 0,
      sendDelay: 0,
    });
    laneIds.add('lane-1');
  }

  // Validate placements (max 200)
  const placements: SongPlacement[] = [];
  if (Array.isArray(s.placements)) {
    for (let i = 0; i < Math.min(s.placements.length, SONG_LIMITS.MAX_PLACEMENTS); i++) {
      const p = s.placements[i];
      if (!p || typeof p !== 'object') continue;

      const assetId = typeof p.assetId === 'string' ? p.assetId : '';
      if (!validAssets[assetId]) {
        warnings.push(`Placement references missing asset "${assetId}" and was dropped.`);
        continue;
      }

      let laneId = typeof p.laneId === 'string' ? p.laneId : '';
      if (!laneIds.has(laneId)) {
        laneId = lanes[0].id;
      }

      const startBar = clampInt(p.startBar, 0, SONG_LIMITS.MAX_TOTAL_BARS - 1, 0);
      const lengthBars = clampInt(p.lengthBars, 1, SONG_LIMITS.MAX_TOTAL_BARS, 2);
      const offsetBars = clampInt(p.offsetBars, 0, SONG_LIMITS.MAX_TOTAL_BARS - 1, 0);
      const gainDb = clamp(p.gainDb, -36, 6, 0);
      const transpose = clampInt(p.transpose, -24, 24, 0);
      const fadeInBars = clampInt(p.fadeInBars, 0, 4, 0);
      const fadeOutBars = clampInt(p.fadeOutBars, 0, 4, 0);
      const mute = Boolean(p.mute);

      let mutedColors: string[] | undefined = undefined;
      if (Array.isArray(p.mutedColors)) {
        mutedColors = p.mutedColors.filter((c: unknown) => typeof c === 'string' && c.length <= 20);
      }

      const pId = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `p-${Date.now()}-${i}`;

      placements.push({
        id: pId,
        assetId,
        laneId,
        startBar,
        lengthBars,
        offsetBars,
        gainDb,
        transpose,
        fadeInBars,
        fadeOutBars,
        mute,
        mutedColors,
      });
    }
  }

  // Validate markers (max 40)
  const markers: SongMarker[] = [];
  if (Array.isArray(s.markers)) {
    for (let i = 0; i < Math.min(s.markers.length, SONG_LIMITS.MAX_MARKERS); i++) {
      const m = s.markers[i];
      if (!m || typeof m !== 'object') continue;
      const mId = typeof m.id === 'string' && m.id.trim() ? m.id.trim() : `m-${i + 1}`;
      const bar = clampInt(m.bar, 0, SONG_LIMITS.MAX_TOTAL_BARS - 1, 0);
      const label = typeof m.label === 'string' ? m.label.trim().slice(0, 24) || 'Marker' : 'Marker';
      markers.push({ id: mId, bar, label });
    }
  }

  // Derive totalBars
  let derivedTotal = 4;
  for (const pl of placements) {
    const end = pl.startBar + pl.lengthBars;
    if (end > derivedTotal) derivedTotal = end;
  }
  for (const mk of markers) {
    if (mk.bar + 1 > derivedTotal) derivedTotal = mk.bar + 1;
  }
  const totalBars = clampInt(derivedTotal, SONG_LIMITS.MIN_TOTAL_BARS, SONG_LIMITS.MAX_TOTAL_BARS, 4);

  // Validate master settings
  const rawMaster = s.master && typeof s.master === 'object' ? s.master : {};
  const masterGainDb = clamp(rawMaster.gainDb, -60, 6, 0);

  const rawEq = rawMaster.eq && typeof rawMaster.eq === 'object' ? rawMaster.eq : {};
  const eq = {
    lowDb: clamp(rawEq.lowDb, -12, 12, 0),
    midDb: clamp(rawEq.midDb, -12, 12, 0),
    highDb: clamp(rawEq.highDb, -12, 12, 0),
  };

  const rawComp = rawMaster.compressor && typeof rawMaster.compressor === 'object' ? rawMaster.compressor : {};
  const compressor = {
    on: Boolean(rawComp.on),
    thresholdDb: clamp(rawComp.thresholdDb, -40, 0, -16),
    ratio: clamp(rawComp.ratio, 1, 20, 3),
    attackMs: clamp(rawComp.attackMs, 1, 100, 20),
    releaseMs: clamp(rawComp.releaseMs, 20, 1000, 250),
    makeupDb: clamp(rawComp.makeupDb, 0, 20, 2),
  };

  // Validate master effects rack
  let effects: FxConfig = { ...DEFAULT_FX_CONFIG };
  if (rawMaster.effects && typeof rawMaster.effects === 'object') {
    const fx = rawMaster.effects;
    effects = {
      reverb: {
        amount: clamp(fx.reverb?.amount, 0, 100, DEFAULT_FX_CONFIG.reverb.amount),
        size: clamp(fx.reverb?.size, 0.5, 10, DEFAULT_FX_CONFIG.reverb.size),
        bypassed: Boolean(fx.reverb?.bypassed),
      },
      delay: {
        amount: clamp(fx.delay?.amount, 0, 100, DEFAULT_FX_CONFIG.delay.amount),
        time: typeof fx.delay?.time === 'string' ? fx.delay.time : DEFAULT_FX_CONFIG.delay.time,
        bypassed: Boolean(fx.delay?.bypassed ?? true),
      },
      chorus: {
        amount: clamp(fx.chorus?.amount, 0, 100, DEFAULT_FX_CONFIG.chorus.amount),
        depth: clamp(fx.chorus?.depth, 0, 1, DEFAULT_FX_CONFIG.chorus.depth),
        bypassed: Boolean(fx.chorus?.bypassed ?? true),
      },
      phaser: {
        amount: clamp(fx.phaser?.amount, 0, 100, DEFAULT_FX_CONFIG.phaser.amount),
        speed: clamp(fx.phaser?.speed, 0.1, 10, DEFAULT_FX_CONFIG.phaser.speed),
        bypassed: Boolean(fx.phaser?.bypassed ?? true),
      },
      tremolo: {
        amount: clamp(fx.tremolo?.amount, 0, 100, DEFAULT_FX_CONFIG.tremolo.amount),
        rate: typeof fx.tremolo?.rate === 'string' ? fx.tremolo.rate : DEFAULT_FX_CONFIG.tremolo.rate,
        bypassed: Boolean(fx.tremolo?.bypassed ?? true),
      },
      autoFilter: {
        amount: clamp(fx.autoFilter?.amount, 0, 100, DEFAULT_FX_CONFIG.autoFilter.amount),
        speed: typeof fx.autoFilter?.speed === 'string' ? fx.autoFilter.speed : DEFAULT_FX_CONFIG.autoFilter.speed,
        bypassed: Boolean(fx.autoFilter?.bypassed ?? true),
      },
      drive: {
        amount: clamp(fx.drive?.amount, 0, 100, DEFAULT_FX_CONFIG.drive.amount),
        tone: clamp(fx.drive?.tone, 200, 12000, DEFAULT_FX_CONFIG.drive.tone),
        bypassed: Boolean(fx.drive?.bypassed ?? true),
      },
    };
  }

  const preset: MasteringPreset = VALID_PRESETS.has(rawMaster.preset)
    ? rawMaster.preset
    : 'clean';

  const master: SongMasterSettings = {
    gainDb: masterGainDb,
    eq,
    compressor,
    effects,
    preset,
  };

  // Loop region
  let loopRegion: { startBar: number; endBar: number } | null = null;
  if (s.loopRegion && typeof s.loopRegion === 'object') {
    const start = clampInt(s.loopRegion.startBar, 0, totalBars - 1, 0);
    const end = clampInt(s.loopRegion.endBar, start + 1, totalBars, Math.min(start + 4, totalBars));
    if (end > start) {
      loopRegion = { startBar: start, endBar: end };
    }
  }

  const now = Date.now();
  const createdAt = typeof s.createdAt === 'number' && !isNaN(s.createdAt) ? s.createdAt : now;
  const updatedAt = typeof s.updatedAt === 'number' && !isNaN(s.updatedAt) ? s.updatedAt : now;

  const validSong: Song = {
    schemaVersion,
    id,
    title,
    bpm,
    beatsPerBar,
    totalBars,
    assets: validAssets,
    lanes,
    placements,
    markers,
    master,
    loopRegion,
    createdAt,
    updatedAt,
    syncStatus: s.syncStatus,
    isPublic: Boolean(s.isPublic),
    publicSlug: typeof s.publicSlug === 'string' ? s.publicSlug : null,
  };

  return {
    isValid: true,
    data: validSong,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
