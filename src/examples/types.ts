import { ScaleName } from '../audio/scales';
import { DrumSoundId } from '../audio/drums';

export interface ExampleNote {
  midi: number;
  startBeat: number;
  durBeats: number;
  velocity?: number;
}

export interface ExampleHit {
  drum: DrumSoundId;
  startBeat: number;
  velocity?: number;
}

export interface ExampleTrack {
  colorId: string; // e.g. 'track-1' | 'vermilion' | '1'
  instrumentId: string;
  mode: 'flow' | 'notes' | 'beat';
  root?: number;
  scale?: ScaleName;
  notes?: ExampleNote[];
  hits?: ExampleHit[];
}

export interface ExampleSong {
  id: string;
  title: string;
  credit: string;
  licenseNote: string;
  bpm: number;
  bars: 1 | 2 | 4 | 8;
  root: number; // 0..11
  scale: ScaleName;
  playbackMode?: 'flow' | 'notes';
  keyMode?: 'per-color' | 'one-for-all';
  tracks: ExampleTrack[];
}
