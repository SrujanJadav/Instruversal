import * as Tone from 'tone';
import { InstrumentInstance, INSTRUMENTS_MAP } from './instruments';
import { DrumKitInstance, DrumKitId, DrumSoundId } from './drums';
import { BeatRate } from './beatSchedule';
import { TrackType } from '../state';

export interface TrackConfig {
  id: string;
  name: string;
  colorVar: string;
  colorHex: string;
  trackType?: TrackType;
  instrumentId: string;
  kitId?: DrumKitId;
  beatRate?: BeatRate;
  swing?: number; // 0 to 60 (%)
  humanize?: number; // 0 to 100 (%)
  muted: boolean;
  solo: boolean;
  volume: number; // 0 to 1
}

export function shouldTrackPlay(muted: boolean, solo: boolean, hasAnySolo: boolean): boolean {
  if (hasAnySolo) {
    return solo;
  }
  return !muted;
}

export class Track {
  public id: string;
  public name: string;
  public colorVar: string;
  public colorHex: string;
  public trackType: TrackType;
  public instrumentId: string;
  public kitId: DrumKitId;
  public beatRate: BeatRate;
  public swing: number;
  public humanize: number;
  public muted: boolean;
  public solo: boolean;
  public volume: number;

  public channel: Tone.Gain;
  private instrument: InstrumentInstance | null = null;
  private drumKit: DrumKitInstance | null = null;

  constructor(config: TrackConfig, masterInput: Tone.ToneAudioNode) {
    this.id = config.id;
    this.name = config.name;
    this.colorVar = config.colorVar;
    this.colorHex = config.colorHex;
    this.trackType = config.trackType || 'melodic';
    this.instrumentId = config.instrumentId;
    this.kitId = config.kitId || '808';
    this.beatRate = config.beatRate || '1/16';
    this.swing = config.swing !== undefined ? config.swing : 0;
    this.humanize = config.humanize !== undefined ? config.humanize : 15;
    this.muted = config.muted;
    this.solo = config.solo;
    this.volume = config.volume;

    this.channel = new Tone.Gain(this.calcGainValue());
    this.channel.connect(masterInput);

    if (this.trackType === 'beat') {
      this.initDrumKit();
    } else {
      this.setInstrument(this.instrumentId);
    }
  }

  private calcGainValue(): number {
    return Math.max(0, Math.min(1, this.volume));
  }

  private initDrumKit() {
    if (this.drumKit) {
      this.drumKit.dispose();
      this.drumKit = null;
    }
    this.drumKit = new DrumKitInstance(this.kitId);
    this.drumKit.output.connect(this.channel);
  }

  public setTrackType(type: TrackType) {
    if (this.trackType === type) return;
    this.trackType = type;

    if (type === 'beat') {
      if (this.instrument) {
        this.instrument.dispose();
        this.instrument = null;
      }
      this.initDrumKit();
    } else {
      if (this.drumKit) {
        this.drumKit.dispose();
        this.drumKit = null;
      }
      this.setInstrument(this.instrumentId);
    }
  }

  public setKit(kitId: DrumKitId) {
    this.kitId = kitId;
    if (this.drumKit) {
      this.drumKit.setKit(kitId);
    } else {
      this.initDrumKit();
    }
  }

  public setInstrument(instrumentId: string) {
    const meta = INSTRUMENTS_MAP[instrumentId];
    if (!meta) {
      console.warn(`Instrument ${instrumentId} not found, falling back to pluck`);
      return;
    }

    if (this.instrument) {
      this.instrument.dispose();
      this.instrument = null;
    }

    this.instrumentId = instrumentId;
    this.instrument = meta.create();
    this.instrument.output.connect(this.channel);
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.channel.gain.rampTo(this.calcGainValue(), 0.05);
  }

  public setMute(muted: boolean) {
    this.muted = muted;
  }

  public setSolo(solo: boolean) {
    this.solo = solo;
  }

  public shouldPlay(hasAnySolo: boolean): boolean {
    return shouldTrackPlay(this.muted, this.solo, hasAnySolo);
  }

  public triggerNote(
    midi: number,
    duration: Tone.Unit.Time | number = '16n',
    time?: Tone.Unit.Time | number,
    velocity: number = 0.75
  ) {
    if (this.trackType === 'beat') return;
    if (!this.instrument) return;
    this.instrument.triggerNote(midi, duration, time, velocity);
  }

  public triggerDrum(soundId: DrumSoundId, time?: number, velocity: number = 0.8) {
    if (this.trackType !== 'beat') return;
    if (!this.drumKit) return;
    this.drumKit.trigger(soundId, time, velocity);
  }

  public audition() {
    const now = Tone.now();
    if (this.trackType === 'beat') {
      if (!this.drumKit) return;
      // Quick drum groove audition: kick on 0, hat on 0.08, snare on 0.16, hat on 0.24
      this.drumKit.trigger('kick', now, 0.85);
      this.drumKit.trigger('closed-hat', now + 0.08, 0.65);
      this.drumKit.trigger('snare', now + 0.16, 0.8);
      this.drumKit.trigger('closed-hat', now + 0.24, 0.65);
    } else {
      if (!this.instrument) return;
      // Short 3-note melodic motif
      const notes = [60, 64, 67]; // C4, E4, G4
      notes.forEach((note, idx) => {
        this.instrument?.triggerNote(note, '16n', now + idx * 0.08, 0.75);
      });
    }
  }

  public dispose() {
    if (this.instrument) {
      this.instrument.dispose();
      this.instrument = null;
    }
    if (this.drumKit) {
      this.drumKit.dispose();
      this.drumKit = null;
    }
    this.channel.dispose();
  }
}

export class MasterAudioChain {
  public masterGain: Tone.Gain;
  public reverb: Tone.Reverb;
  public limiter: Tone.Limiter;

  constructor() {
    this.masterGain = new Tone.Gain(0.9);
    this.reverb = new Tone.Reverb({
      decay: 1.5,
      wet: 0.12,
      preDelay: 0.01,
    });
    this.limiter = new Tone.Limiter(-0.5);

    // Chain: Master Gain -> Reverb -> Limiter -> Destination
    this.masterGain.connect(this.reverb);
    this.reverb.connect(this.limiter);
    this.limiter.toDestination();
  }

  public dispose() {
    this.masterGain.dispose();
    this.reverb.dispose();
    this.limiter.dispose();
  }
}

export const DEFAULT_TRACK_CONFIGS: TrackConfig[] = [
  {
    id: 'track-1',
    name: 'Vermilion',
    colorVar: '--vermilion',
    colorHex: '#D2432A',
    trackType: 'melodic',
    instrumentId: 'pluck',
    muted: false,
    solo: false,
    volume: 0.85,
  },
  {
    id: 'track-2',
    name: 'Indigo',
    colorVar: '--indigo',
    colorHex: '#2E3F8F',
    trackType: 'melodic',
    instrumentId: 'bell',
    muted: false,
    solo: false,
    volume: 0.8,
  },
  {
    id: 'track-3',
    name: 'Ochre',
    colorVar: '--ochre',
    colorHex: '#D49A2A',
    trackType: 'melodic',
    instrumentId: 'marimba',
    muted: false,
    solo: false,
    volume: 0.85,
  },
  {
    id: 'track-4',
    name: 'Sage',
    colorVar: '--sage',
    colorHex: '#3F7A63',
    trackType: 'melodic',
    instrumentId: 'soft-pad',
    muted: false,
    solo: false,
    volume: 0.85,
  },
  {
    id: 'track-5',
    name: 'Plum',
    colorVar: '--plum',
    colorHex: '#7A3A66',
    trackType: 'melodic',
    instrumentId: 'warm-keys',
    muted: false,
    solo: false,
    volume: 0.85,
  },
  {
    id: 'track-6',
    name: 'Slate',
    colorVar: '--slate',
    colorHex: '#4A5560',
    trackType: 'melodic',
    instrumentId: 'kalimba',
    muted: false,
    solo: false,
    volume: 0.85,
  },
];

import { MasterEffectsRack, getMasterEffectsRack } from './effects';

export class TrackManager {
  public effectsRack: MasterEffectsRack;
  public tracks: Map<string, Track> = new Map();

  constructor() {
    this.effectsRack = getMasterEffectsRack();
    for (const config of DEFAULT_TRACK_CONFIGS) {
      const track = new Track(config, this.effectsRack.masterGain);
      this.tracks.set(track.id, track);
    }
  }

  public getTrack(id: string): Track | undefined {
    return this.tracks.get(id);
  }

  public getAllTracks(): Track[] {
    return Array.from(this.tracks.values());
  }

  public hasAnySolo(): boolean {
    return Array.from(this.tracks.values()).some((t) => t.solo);
  }

  public triggerNoteOnTrack(
    trackId: string,
    midi: number,
    duration: Tone.Unit.Time | number = '16n',
    time?: Tone.Unit.Time | number,
    velocity: number = 0.75
  ) {
    const track = this.tracks.get(trackId);
    if (!track) return;
    if (track.shouldPlay(this.hasAnySolo())) {
      track.triggerNote(midi, duration, time, velocity);
    }
  }

  public triggerDrumOnTrack(
    trackId: string,
    soundId: DrumSoundId,
    time?: number,
    velocity: number = 0.8
  ) {
    const track = this.tracks.get(trackId);
    if (!track) return;
    if (track.shouldPlay(this.hasAnySolo())) {
      track.triggerDrum(soundId, time, velocity);
    }
  }

  public dispose() {
    for (const track of this.tracks.values()) {
      track.dispose();
    }
    this.tracks.clear();
    this.effectsRack.dispose();
  }
}

let sharedTrackManager: TrackManager | null = null;

export function getTrackManager(): TrackManager {
  if (!sharedTrackManager) {
    sharedTrackManager = new TrackManager();
  }
  return sharedTrackManager;
}

/**
 * Sidechain ducking on pad and strings when kick hits
 */
export function triggerKickDucking(duckingPercent: number) {
  if (duckingPercent <= 0) return;
  const tm = getTrackManager();
  const padTracks = tm
    .getAllTracks()
    .filter(
      (t) =>
        t.trackType === 'melodic' &&
        (t.instrumentId === 'soft-pad' ||
          t.instrumentId === 'strings' ||
          t.instrumentId === 'choir-pad')
    );

  const duckFactor = 1 - (duckingPercent / 100) * 0.4; // 0 to 40% reduction
  const now = Tone.now();

  for (const track of padTracks) {
    const normalGain = track.volume;
    track.channel.gain.cancelScheduledValues(now);
    track.channel.gain.setValueAtTime(normalGain * duckFactor, now);
    track.channel.gain.rampTo(normalGain, 0.12, now + 0.04);
  }
}

export function auditionInstrument(instrumentId: string) {
  const meta = INSTRUMENTS_MAP[instrumentId];
  if (!meta) return;
  const tm = getTrackManager();
  const inst = meta.create();
  inst.output.connect(tm.effectsRack.masterGain);
  const now = Tone.now();
  const notes = [60, 64, 67];
  notes.forEach((note, idx) => {
    inst.triggerNote(note, '16n', now + idx * 0.08, 0.75);
  });
  window.setTimeout(() => {
    inst.dispose();
  }, 1200);
}

export function auditionKit(kitId: DrumKitId) {
  const tm = getTrackManager();
  const drumKit = new DrumKitInstance(kitId);
  drumKit.output.connect(tm.effectsRack.masterGain);
  const now = Tone.now();

  drumKit.trigger('kick', now, 0.85);
  drumKit.trigger('closed-hat', now + 0.08, 0.65);
  drumKit.trigger('snare', now + 0.16, 0.8);
  drumKit.trigger('closed-hat', now + 0.24, 0.65);

  window.setTimeout(() => {
    drumKit.dispose();
  }, 1200);
}
