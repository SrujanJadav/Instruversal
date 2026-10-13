import { Song, SongMasterSettings, MasteringPreset } from './types';

export interface PresetParams {
  id: MasteringPreset;
  name: string;
  description: string;
  eq: {
    lowDb: number;
    midDb: number;
    highDb: number;
  };
  compressor: {
    on: boolean;
    thresholdDb: number;
    ratio: number;
    attackMs: number;
    releaseMs: number;
    makeupDb: number;
  };
}

export const MASTERING_PRESETS: Record<Exclude<MasteringPreset, 'custom'>, PresetParams> = {
  clean: {
    id: 'clean',
    name: 'Clean',
    description: 'Flat EQ with transparent, light glue compression.',
    eq: { lowDb: 0, midDb: 0, highDb: 0 },
    compressor: {
      on: true,
      thresholdDb: -18,
      ratio: 2.5,
      attackMs: 30,
      releaseMs: 100,
      makeupDb: 0,
    },
  },
  warm: {
    id: 'warm',
    name: 'Warm',
    description: 'Gentle low shelf boost with smoothed high frequencies.',
    eq: { lowDb: 2, midDb: 0, highDb: -1.5 },
    compressor: {
      on: true,
      thresholdDb: -20,
      ratio: 2.0,
      attackMs: 40,
      releaseMs: 150,
      makeupDb: 1.0,
    },
  },
  bright: {
    id: 'bright',
    name: 'Bright',
    description: 'Crisp presence and high-end air with fast glue.',
    eq: { lowDb: 0, midDb: 0.5, highDb: 2.0 },
    compressor: {
      on: true,
      thresholdDb: -16,
      ratio: 2.0,
      attackMs: 20,
      releaseMs: 80,
      makeupDb: 0.5,
    },
  },
  loud: {
    id: 'loud',
    name: 'Loud',
    description: 'Stronger compression ratio and punchy makeup gain.',
    eq: { lowDb: 1.0, midDb: 0, highDb: 1.0 },
    compressor: {
      on: true,
      thresholdDb: -24,
      ratio: 4.0,
      attackMs: 10,
      releaseMs: 80,
      makeupDb: 4.0,
    },
  },
  'lo-fi': {
    id: 'lo-fi',
    name: 'Lo-fi',
    description: 'Subtle high-and-low roll-off with saturated, soft glue.',
    eq: { lowDb: -2.0, midDb: 1.5, highDb: -4.0 },
    compressor: {
      on: true,
      thresholdDb: -15,
      ratio: 3.0,
      attackMs: 50,
      releaseMs: 200,
      makeupDb: 2.0,
    },
  },
};

/**
 * Checks if the current settings match any preset; otherwise returns 'custom'.
 */
export function detectPresetMatch(settings: SongMasterSettings): MasteringPreset {
  for (const presetKey of Object.keys(MASTERING_PRESETS) as Array<Exclude<MasteringPreset, 'custom'>>) {
    const p = MASTERING_PRESETS[presetKey];
    const eqMatch =
      Math.abs(settings.eq.lowDb - p.eq.lowDb) < 0.1 &&
      Math.abs(settings.eq.midDb - p.eq.midDb) < 0.1 &&
      Math.abs(settings.eq.highDb - p.eq.highDb) < 0.1;

    const compMatch =
      settings.compressor.on === p.compressor.on &&
      Math.abs(settings.compressor.thresholdDb - p.compressor.thresholdDb) < 0.1 &&
      Math.abs(settings.compressor.ratio - p.compressor.ratio) < 0.1 &&
      Math.abs(settings.compressor.attackMs - p.compressor.attackMs) < 1 &&
      Math.abs(settings.compressor.releaseMs - p.compressor.releaseMs) < 1 &&
      Math.abs(settings.compressor.makeupDb - p.compressor.makeupDb) < 0.1;

    if (eqMatch && compMatch) {
      return p.id;
    }
  }
  return 'custom';
}

/**
 * Auto-balance helper: sets sensible starting lane levels (beat lower, melody centered, pads wider),
 * and adjusts master gain if headroom is tight.
 */
export function autoBalanceSong(song: Song): { song: Song; explanation: string } {
  // Check asset properties across placements per lane
  const laneCategories = new Map<string, { hasBeat: boolean; hasMelody: boolean; count: number }>();

  for (const lane of song.lanes) {
    laneCategories.set(lane.id, { hasBeat: false, hasMelody: false, count: 0 });
  }

  for (const p of song.placements) {
    const cat = laneCategories.get(p.laneId);
    if (!cat) continue;
    cat.count++;

    const asset = song.assets[p.assetId];
    if (asset && asset.project && Array.isArray(asset.project.tracks)) {
      for (const t of asset.project.tracks) {
        if (t.trackType === 'beat') cat.hasBeat = true;
        else cat.hasMelody = true;
      }
    }
  }

  const updatedLanes = song.lanes.map((lane, idx) => {
    const cat = laneCategories.get(lane.id);
    let volumeDb = lane.volumeDb;
    let pan = lane.pan;

    if (cat) {
      if (cat.hasBeat && !cat.hasMelody) {
        // Pure drum lane: set to -2.0 dB
        volumeDb = -2.0;
        pan = 0; // Center drums
      } else if (cat.hasMelody && !cat.hasBeat) {
        // Melodic lane: stagger panning slightly if multiple
        volumeDb = 0;
        if (idx === 1) pan = -0.15;
        else if (idx === 2) pan = 0.15;
      } else if (cat.hasBeat && cat.hasMelody) {
        // Mixed: moderate level
        volumeDb = -1.0;
      }
    }

    return {
      ...lane,
      volumeDb,
      pan,
    };
  });

  // Ensure master has at least -1.5 dB headroom to avoid clip warning
  const masterGainDb = Math.min(song.master.gainDb, -1.5);

  const updatedSong: Song = {
    ...song,
    lanes: updatedLanes,
    master: {
      ...song.master,
      gainDb: masterGainDb,
    },
    updatedAt: Date.now(),
  };

  const explanation = `Balanced ${song.lanes.length} lanes (drums -2dB, melodies staged) and set master headroom to ${masterGainDb.toFixed(1)}dB.`;

  return { song: updatedSong, explanation };
}
