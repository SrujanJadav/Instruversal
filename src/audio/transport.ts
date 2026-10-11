import * as Tone from 'tone';
import { CONFIG } from '../config';
import { state, events, saveSyncOffset } from '../state';
import { getTotalAudioLatencySeconds } from './context';

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
    // Small scheduled offset so first notes are not clipped on initial play
    Tone.getTransport().start('+0.05');
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
   * Returns current loop progress in range [0, 1) compensated for audio latency.
   * The visual playhead is drawn at (Transport.seconds - audioLatency) so the line
   * crosses the stroke exactly when the sound is heard.
   */
  public getProgress(): number {
    if (!this.isPlaying()) {
      return 0;
    }

    // Compute total loop duration in seconds from current BPM
    const loopDuration = this.bars * 4 * (60 / Tone.getTransport().bpm.value);
    if (loopDuration <= 0) return 0;

    // Latency compensation:
    // audioLatency = baseLatency + outputLatency + lookAhead + userSyncOffset
    const hardwareLatency = getTotalAudioLatencySeconds();
    const userOffset = state.syncOffsetMs / 1000;
    const audioLatency = hardwareLatency + userOffset;

    // Current transport time in seconds (raw)
    const transportSec = Tone.getTransport().seconds;

    // Shift playhead back by audioLatency so visual matches what you hear
    let compensatedSec = transportSec - audioLatency;

    // Wrap around correctly for negative values and values > loopDuration
    compensatedSec = ((compensatedSec % loopDuration) + loopDuration) % loopDuration;

    const progress = compensatedSec / loopDuration;
    return Math.max(0, Math.min(1, progress));
  }

  /**
   * Sync offset management (user calibration)
   */
  public setSyncOffset(ms: number) {
    const clamped = Math.max(-200, Math.min(400, ms));
    state.syncOffsetMs = clamped;
    saveSyncOffset(clamped);
    events.emit('sync:change', clamped);
  }

  public getSyncOffset(): number {
    return state.syncOffsetMs;
  }
}

let sharedTransport: TransportController | null = null;

export function getTransport(): TransportController {
  if (!sharedTransport) {
    sharedTransport = new TransportController();
  }
  return sharedTransport;
}
