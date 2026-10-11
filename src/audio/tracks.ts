import * as Tone from 'tone';
import { InstrumentInstance, INSTRUMENTS_MAP } from './instruments';

export interface TrackConfig {
  id: string;
  name: string;
  colorVar: string;
  colorHex: string;
  instrumentId: string;
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
  public instrumentId: string;
  public muted: boolean;
  public solo: boolean;
  public volume: number;

  public channel: Tone.Gain;
  private instrument: InstrumentInstance | null = null;

  constructor(config: TrackConfig, masterInput: Tone.ToneAudioNode) {
    this.id = config.id;
    this.name = config.name;
    this.colorVar = config.colorVar;
    this.colorHex = config.colorHex;
    this.instrumentId = config.instrumentId;
    this.muted = config.muted;
    this.solo = config.solo;
    this.volume = config.volume;

    this.channel = new Tone.Gain(this.calcGainValue());
    this.channel.connect(masterInput);

    this.setInstrument(this.instrumentId);
  }

  private calcGainValue(): number {
    return Math.max(0, Math.min(1, this.volume));
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
    if (!this.instrument) return;
    this.instrument.triggerNote(midi, duration, time, velocity);
  }

  public audition() {
    if (!this.instrument) return;
    const now = Tone.now();
    // Short 3-note melodic motif
    const notes = [60, 64, 67]; // C4, E4, G4
    notes.forEach((note, idx) => {
      this.instrument?.triggerNote(note, '16n', now + idx * 0.08, 0.75);
    });
  }

  public dispose() {
    if (this.instrument) {
      this.instrument.dispose();
      this.instrument = null;
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
    instrumentId: 'kalimba',
    muted: false,
    solo: false,
    volume: 0.85,
  },
];

export class TrackManager {
  public masterChain: MasterAudioChain;
  public tracks: Map<string, Track> = new Map();

  constructor() {
    this.masterChain = new MasterAudioChain();
    for (const config of DEFAULT_TRACK_CONFIGS) {
      const track = new Track(config, this.masterChain.masterGain);
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

  public dispose() {
    for (const track of this.tracks.values()) {
      track.dispose();
    }
    this.tracks.clear();
    this.masterChain.dispose();
  }
}

let sharedTrackManager: TrackManager | null = null;

export function getTrackManager(): TrackManager {
  if (!sharedTrackManager) {
    sharedTrackManager = new TrackManager();
  }
  return sharedTrackManager;
}
