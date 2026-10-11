import * as Tone from 'tone';
import { CONFIG } from '../config';
import { state, events } from '../state';

export class TransportController {
  private bpm: number = CONFIG.defaultBpm;
  private bars: number = CONFIG.defaultBars;

  constructor() {
    this.setupTransport();
  }

  private setupTransport() {
    Tone.getTransport().bpm.value = this.bpm;
    Tone.getTransport().timeSignature = 4;
    Tone.getTransport().loop = true;
    Tone.getTransport().loopStart = 0;
    Tone.getTransport().loopEnd = `${this.bars}m`;
  }

  public setBpm(newBpm: number) {
    const clamped = Math.max(CONFIG.minBpm, Math.min(CONFIG.maxBpm, newBpm));
    this.bpm = clamped;
    state.bpm = clamped;
    Tone.getTransport().bpm.rampTo(clamped, 0.05);
    events.emit('bpm:change', clamped);
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setBars(newBars: number) {
    this.bars = Math.max(1, Math.min(8, newBars));
    state.bars = this.bars;
    Tone.getTransport().loopEnd = `${this.bars}m`;
  }

  public getBars(): number {
    return this.bars;
  }

  public isPlaying(): boolean {
    return Tone.getTransport().state === 'started';
  }

  public async play() {
    if (Tone.context.state !== 'running') {
      await Tone.start();
      state.audioStarted = true;
      events.emit('audio:started', undefined);
    }
    Tone.getTransport().start();
    state.isPlaying = true;
    events.emit('transport:play', undefined);
  }

  public pause() {
    Tone.getTransport().pause();
    state.isPlaying = false;
    events.emit('transport:pause', undefined);
  }

  public stop() {
    Tone.getTransport().stop();
    state.isPlaying = false;
    events.emit('transport:pause', undefined);
  }

  public toggle(): Promise<void> | void {
    if (this.isPlaying()) {
      this.pause();
    } else {
      return this.play();
    }
  }

  /**
   * Returns current loop progress in range [0, 1) strictly based on Tone.Transport.
   */
  public getProgress(): number {
    if (!this.isPlaying()) {
      return 0;
    }
    // Progress calculation from Tone.Transport loop
    const progress = Tone.getTransport().progress;
    return typeof progress === 'number' && !isNaN(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  }
}

let sharedTransport: TransportController | null = null;

export function getTransport(): TransportController {
  if (!sharedTransport) {
    sharedTransport = new TransportController();
  }
  return sharedTransport;
}
