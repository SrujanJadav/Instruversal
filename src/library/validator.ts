import { ProjectData, Creation } from './types';
import { INSTRUMENTS_MAP } from '../audio/instruments';
import { SCALES, ScaleName } from '../audio/scales';
import { DRUM_KITS, DrumKitId } from '../audio/drums';
import { SerializedTrack } from '../audio/projectState';
import { Stroke, FxConfig, DEFAULT_FX_CONFIG } from '../state';

export interface ValidationResult<T> {
  isValid: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

const VALID_SCALES = new Set(Object.keys(SCALES));
const VALID_BEAT_RATES = new Set(['1/4', '1/8', '1/16', '1/32', '1/8t', '1/16t']);
const VALID_BEAT_FLOW_STYLES = new Set(['glide', 'roll', 'sweep']);
const VALID_BEAT_ROLL_VOICES = new Set(['snare', 'hat', 'tom']);
const VALID_BEAT_SWEEP_CHARS = new Set(['shaker', 'hat']);

export function sanitizeTitle(rawTitle: unknown, defaultTitle = 'Untitled sketch'): string {
  if (typeof rawTitle !== 'string') return defaultTitle;
  const trimmed = rawTitle.trim();
  if (!trimmed) return defaultTitle;
  return trimmed.slice(0, 80);
}

function clamp(val: unknown, min: number, max: number, defaultVal: number): number {
  if (typeof val !== 'number' || isNaN(val)) return defaultVal;
  return Math.max(min, Math.min(max, val));
}

export function validateProject(raw: unknown): ValidationResult<ProjectData> {
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { isValid: false, error: 'Project data must be a valid object.' };
  }

  const p = raw as Record<string, any>;

  // Check version
  const version = p.version === 1 ? 1 : 1;

  // BPM: 50 to 180
  const bpm = clamp(p.bpm, 50, 180, 90);
  if (p.bpm !== undefined && (p.bpm < 50 || p.bpm > 180)) {
    warnings.push(`BPM was clamped to ${bpm}.`);
  }

  // Bars: 1 to 8
  const bars = Math.round(clamp(p.bars, 1, 8, 2));

  // Root note: 0 to 11
  let rootNote = 0;
  if (typeof p.rootNote === 'number') {
    rootNote = ((Math.round(p.rootNote) % 12) + 12) % 12;
  }

  // Scale: valid scale name
  let scaleName: ScaleName = 'major pentatonic';
  if (typeof p.scaleName === 'string' && VALID_SCALES.has(p.scaleName)) {
    scaleName = p.scaleName as ScaleName;
  } else if (p.scaleName) {
    warnings.push(`Scale "${p.scaleName}" is unknown. Reverted to Major Pentatonic.`);
  }

  // Playback mode: 'flow' or 'notes'
  const playbackMode = p.playbackMode === 'notes' ? 'notes' : 'flow';

  // Glide: 0 to 100
  const glide = clamp(p.glide, 0, 100, 30);

  // Tracks
  const tracks: SerializedTrack[] = [];
  if (Array.isArray(p.tracks)) {
    for (const t of p.tracks) {
      if (!t || typeof t !== 'object') continue;
      const tId = typeof t.id === 'string' ? t.id : `track-${tracks.length + 1}`;
      const tName = typeof t.name === 'string' ? t.name.slice(0, 30) : 'Track';
      const tType = t.trackType === 'beat' ? 'beat' : 'melodic';

      // Instrument safety check: fallback to safe default 'pluck' if missing
      let instrumentId = typeof t.instrumentId === 'string' ? t.instrumentId : 'pluck';
      if (!INSTRUMENTS_MAP[instrumentId]) {
        warnings.push(`Instrument "${instrumentId}" on ${tName} not found. Reverted to Pluck.`);
        instrumentId = 'pluck';
      }

      // Drum kit safety check
      const rawKit = t.kitId as string;
      const kitId: DrumKitId = (rawKit && rawKit in DRUM_KITS) ? (rawKit as DrumKitId) : '808';

      const beatRate = VALID_BEAT_RATES.has(t.beatRate) ? t.beatRate : '1/16';
      const beatMode = t.beatMode === 'flow' ? 'flow' : 'hits';
      const beatFlowStyle = VALID_BEAT_FLOW_STYLES.has(t.beatFlowStyle) ? t.beatFlowStyle : 'glide';
      const beatRollVoice = VALID_BEAT_ROLL_VOICES.has(t.beatRollVoice) ? t.beatRollVoice : 'snare';
      const beatSweepCharacter = VALID_BEAT_SWEEP_CHARS.has(t.beatSweepCharacter) ? t.beatSweepCharacter : 'shaker';

      tracks.push({
        id: tId,
        name: tName,
        trackType: tType,
        instrumentId,
        kitId,
        volume: clamp(t.volume, 0, 1, 0.8),
        muted: Boolean(t.muted),
        solo: Boolean(t.solo),
        beatRate,
        swing: clamp(t.swing, 0, 60, 0),
        humanize: clamp(t.humanize, 0, 100, 0),
        beatMode,
        beatFlowStyle,
        beatRollVoice,
        beatSweepCharacter,
      });
    }
  }

  // Strokes: cap at 500 strokes, cap at 2000 points per stroke
  const strokes: Stroke[] = [];
  if (Array.isArray(p.strokes)) {
    const rawStrokes = p.strokes.slice(0, 500);
    if (p.strokes.length > 500) {
      warnings.push(`Stroke limit exceeded (capped to 500).`);
    }

    for (let i = 0; i < rawStrokes.length; i++) {
      const s = rawStrokes[i];
      if (!s || typeof s !== 'object') continue;
      const strokeId = typeof s.id === 'string' ? s.id : `stroke-${i}`;
      const trackId = typeof s.trackId === 'string' ? s.trackId : 'track-1';
      const width = clamp(s.width, 1, 30, 3);

      const points: { x: number; y: number; t: number }[] = [];
      if (Array.isArray(s.points)) {
        const rawPoints = s.points.slice(0, 2000);
        for (const pt of rawPoints) {
          if (!pt || typeof pt !== 'object') continue;
          points.push({
            x: clamp(pt.x, 0, 1, 0),
            y: clamp(pt.y, 0, 1, 0),
            t: typeof pt.t === 'number' && pt.t >= 0 ? pt.t : 0,
          });
        }
      }

      strokes.push({
        id: strokeId,
        trackId,
        width,
        points,
      });
    }
  }

  // FX config (optional)
  let fx: FxConfig | undefined = undefined;
  if (p.fx && typeof p.fx === 'object') {
    const rawFx = p.fx as Record<string, any>;
    fx = {
      reverb: {
        amount: clamp(rawFx.reverb?.amount, 0, 100, DEFAULT_FX_CONFIG.reverb.amount),
        size: clamp(rawFx.reverb?.size, 0.5, 10, DEFAULT_FX_CONFIG.reverb.size),
        bypassed: Boolean(rawFx.reverb?.bypassed),
      },
      delay: {
        amount: clamp(rawFx.delay?.amount, 0, 100, DEFAULT_FX_CONFIG.delay.amount),
        time: typeof rawFx.delay?.time === 'string' ? rawFx.delay.time : DEFAULT_FX_CONFIG.delay.time,
        bypassed: Boolean(rawFx.delay?.bypassed),
      },
      chorus: {
        amount: clamp(rawFx.chorus?.amount, 0, 100, DEFAULT_FX_CONFIG.chorus.amount),
        depth: clamp(rawFx.chorus?.depth, 0, 1, DEFAULT_FX_CONFIG.chorus.depth),
        bypassed: Boolean(rawFx.chorus?.bypassed),
      },
      phaser: {
        amount: clamp(rawFx.phaser?.amount, 0, 100, DEFAULT_FX_CONFIG.phaser.amount),
        speed: clamp(rawFx.phaser?.speed, 0, 1, DEFAULT_FX_CONFIG.phaser.speed),
        bypassed: Boolean(rawFx.phaser?.bypassed),
      },
      tremolo: {
        amount: clamp(rawFx.tremolo?.amount, 0, 100, DEFAULT_FX_CONFIG.tremolo.amount),
        rate: typeof rawFx.tremolo?.rate === 'string' ? rawFx.tremolo.rate : DEFAULT_FX_CONFIG.tremolo.rate,
        bypassed: Boolean(rawFx.tremolo?.bypassed),
      },
      autoFilter: {
        amount: clamp(rawFx.autoFilter?.amount, 0, 100, DEFAULT_FX_CONFIG.autoFilter.amount),
        speed: typeof rawFx.autoFilter?.speed === 'string' ? rawFx.autoFilter.speed : DEFAULT_FX_CONFIG.autoFilter.speed,
        bypassed: Boolean(rawFx.autoFilter?.bypassed),
      },
      drive: {
        amount: clamp(rawFx.drive?.amount, 0, 100, DEFAULT_FX_CONFIG.drive.amount),
        tone: clamp(rawFx.drive?.tone, 500, 10000, DEFAULT_FX_CONFIG.drive.tone),
        bypassed: Boolean(rawFx.drive?.bypassed),
      },
    };
  }

  const sanitized: ProjectData = {
    version,
    bpm,
    bars,
    rootNote,
    scaleName,
    playbackMode,
    glide,
    tracks,
    strokes,
    fx,
  };

  return {
    isValid: true,
    data: sanitized,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function validateCreation(raw: unknown): ValidationResult<Creation> {
  if (!raw || typeof raw !== 'object') {
    return { isValid: false, error: 'Creation data is not a valid object.' };
  }

  const c = raw as Record<string, any>;
  if (!c.id || typeof c.id !== 'string') {
    return { isValid: false, error: 'Creation is missing an ID.' };
  }

  const title = sanitizeTitle(c.title);
  const now = Date.now();
  const createdAt = typeof c.createdAt === 'number' ? c.createdAt : now;
  const updatedAt = typeof c.updatedAt === 'number' ? c.updatedAt : createdAt;
  const schemaVersion = typeof c.schemaVersion === 'number' ? c.schemaVersion : 1;

  const projRes = validateProject(c.project);
  if (!projRes.isValid || !projRes.data) {
    return {
      isValid: false,
      error: projRes.error || 'Project data within creation failed validation.',
    };
  }

  return {
    isValid: true,
    data: {
      id: c.id,
      title,
      createdAt,
      updatedAt,
      schemaVersion,
      project: projRes.data,
    },
    warnings: projRes.warnings,
  };
}
