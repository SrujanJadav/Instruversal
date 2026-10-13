import * as Tone from 'tone';
import { Song, SongPlacement } from './types';
import {
  buildSongSchedule,
  CompiledSongSchedule,
  ScheduledSongEvent,
} from './scheduler';
import { INSTRUMENTS_MAP, InstrumentInstance } from '../audio/instruments';
import { DrumKitInstance, DrumKitId } from '../audio/drums';
import { getFlowVoicePool } from '../audio/voicePool';
import { getBeatFlowVoicePool } from '../audio/beatFlowVoices';
import { getTotalAudioLatencySeconds } from '../audio/context';
import { state, events, POLYPHONY_VOICE_COUNTS } from '../state';
import { SongMasterChain, MasterMeterLevel } from './masterChain';

export interface SongPlaybackEngineCallbacks {
  onPlayheadTick?: (bar: number, beat: number, totalSeconds: number, currentBarFloat?: number) => void;
  onClipSounding?: (placementId: string) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
}

interface CachedInstrument {
  instance: InstrumentInstance | DrumKitInstance;
  type: 'melodic' | 'drum';
  lastUsed: number;
}

interface LaneAudioNode {
  channel: Tone.Channel;
  reverbSend: Tone.Gain;
  delaySend: Tone.Gain;
  meter: Tone.Meter;
}

export class SongPlaybackEngine {
  private song: Song;
  private callbacks: SongPlaybackEngineCallbacks;
  private schedule: CompiledSongSchedule;

  // Master Chain (Bus -> Effects -> EQ -> Comp -> MasterGain -> Limiter -> Meter)
  public masterChain: SongMasterChain;

  // Lane audio nodes (Tone.Channel, Reverb Send, Delay Send, Meter)
  private laneAudioNodes: Map<string, LaneAudioNode> = new Map();

  // Lazy instrument cache (capped at 12 active instances)
  private instrumentCache: Map<string, CachedInstrument> = new Map();

  // Active windowed Tone.Parts (key: placement.id)
  private activeParts: Map<string, Tone.Part> = new Map();

  private windowCheckTimer: number | null = null;
  private animFrameId: number | null = null;
  private rebuildTimer: number | null = null;
  private isDisposed: boolean = false;

  constructor(song: Song, callbacks: SongPlaybackEngineCallbacks = {}) {
    this.song = song;
    this.callbacks = callbacks;
    this.schedule = buildSongSchedule(song);

    try {
      this.masterChain = new SongMasterChain(this.song.master);
    } catch {
      this.masterChain = {} as any;
    }
    this.initLanes();
    this.setupTransportSettings();
    this.updatePolyphonyCap();
  }

  private initLanes() {
    try {
      for (const lane of this.song.lanes) {
        if (!this.laneAudioNodes.has(lane.id)) {
          const channel = new Tone.Channel({
            volume: lane.volumeDb ?? 0,
            pan: lane.pan ?? 0,
            mute: lane.mute ?? false,
            solo: lane.solo ?? false,
          });

          const reverbSend = new Tone.Gain(lane.sendReverb ?? 0);
          const delaySend = new Tone.Gain(lane.sendDelay ?? 0);
          const meter = new Tone.Meter({ smoothing: 0.8 });

          channel.connect(this.masterChain.songBus);

          channel.connect(reverbSend);
          reverbSend.connect(this.masterChain.reverbSend);

          channel.connect(delaySend);
          delaySend.connect(this.masterChain.delaySend);

          channel.connect(meter);

          this.laneAudioNodes.set(lane.id, {
            channel,
            reverbSend,
            delaySend,
            meter,
          });
        }
      }
    } catch {
      // Non-audio test environment fallback
    }
  }

  public getLaneChannel(laneId: string): Tone.ToneAudioNode {
    const node = this.laneAudioNodes.get(laneId);
    return node ? node.channel : Tone.getDestination();
  }

  public getLaneMeterLevel(laneId: string): number {
    const node = this.laneAudioNodes.get(laneId);
    if (!node) return -90;
    try {
      const val = node.meter.getValue();
      const db = Array.isArray(val) ? Math.max(...val) : val;
      return isNaN(db) || db < -90 ? -90 : db;
    } catch {
      return -90;
    }
  }

  public getMasterMeterLevel(): MasterMeterLevel {
    return this.masterChain.getMeterLevel();
  }

  public getMasterOutputNode(): Tone.ToneAudioNode {
    return this.masterChain.getMasterOutputNode();
  }

  private setupTransportSettings() {
    try {
      const t = Tone.getTransport();
      if (t) {
        if (t.bpm && typeof t.bpm === 'object' && 'value' in t.bpm) {
          t.bpm.value = this.song.bpm || 90;
        } else {
          (t as any).bpm = this.song.bpm || 90;
        }
        t.timeSignature = 4;

        if (this.song.loopRegion) {
          t.loop = true;
          t.loopStart = `${this.song.loopRegion.startBar}m`;
          t.loopEnd = `${this.song.loopRegion.endBar}m`;
        } else {
          t.loop = true;
          t.loopStart = 0;
          t.loopEnd = `${this.song.totalBars || 16}m`;
        }
      }
    } catch {}
  }

  private updatePolyphonyCap() {
    const isLight =
      typeof document !== 'undefined'
        ? document.documentElement.getAttribute('data-theme') === 'light'
        : false;
    const cap = isLight ? 4 : POLYPHONY_VOICE_COUNTS[state.polyphony] || 8;
    try {
      getFlowVoicePool().setCap(cap);
    } catch {}
  }

  /**
   * Lazily acquires or creates an instrument instance for a specific lane.
   */
  private getOrCreateMelodicInstrument(laneId: string, instrumentId: string): InstrumentInstance | null {
    const key = `${laneId}:melodic:${instrumentId}`;
    const now = performance.now();
    const cached = this.instrumentCache.get(key);
    if (cached) {
      cached.lastUsed = now;
      return cached.instance as InstrumentInstance;
    }

    const meta = INSTRUMENTS_MAP[instrumentId] || INSTRUMENTS_MAP['pluck'];
    if (!meta) return null;

    this.pruneInstrumentCache();

    const laneChannel = this.getLaneChannel(laneId);
    const instance = meta.create();
    instance.output.connect(laneChannel);

    this.instrumentCache.set(key, {
      instance,
      type: 'melodic',
      lastUsed: now,
    });

    return instance;
  }

  /**
   * Lazily acquires or creates a drum kit instance for a specific lane.
   */
  private getOrCreateDrumKit(laneId: string, kitId: DrumKitId): DrumKitInstance {
    const key = `${laneId}:drum:${kitId}`;
    const now = performance.now();
    const cached = this.instrumentCache.get(key);
    if (cached) {
      cached.lastUsed = now;
      return cached.instance as DrumKitInstance;
    }

    this.pruneInstrumentCache();

    const laneChannel = this.getLaneChannel(laneId);
    const kit = new DrumKitInstance(kitId);
    kit.output.connect(laneChannel);

    this.instrumentCache.set(key, {
      instance: kit,
      type: 'drum',
      lastUsed: now,
    });

    return kit;
  }

  /**
   * Enforces hard resource limit: at most 12 live instrument instances.
   */
  private pruneInstrumentCache() {
    if (this.instrumentCache.size < 12) return;

    const entries = Array.from(this.instrumentCache.entries());
    entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    // Dispose oldest idle instruments
    const toRemove = entries.slice(0, entries.length - 10);
    for (const [k, item] of toRemove) {
      item.instance.dispose();
      this.instrumentCache.delete(k);
    }
  }

  /**
   * Mounts a Tone.Part for a single placement.
   */
  private mountPlacementPart(placement: SongPlacement) {
    if (this.activeParts.has(placement.id)) return;

    const events = this.schedule.eventsByPlacement.get(placement.id);
    if (!events || events.length === 0) return;

    const flowVoicePool = getFlowVoicePool();
    const beatFlowVoicePool = getBeatFlowVoicePool();
    const laneChannel = this.getLaneChannel(placement.laneId);

    try {
      const part = new Tone.Part((time, ev: any) => {
        const item = ev as ScheduledSongEvent;
        // 1. Discrete Note Event
        if (item.kind === 'note') {
          const inst = this.getOrCreateMelodicInstrument(item.laneId, item.instrumentId);
          if (inst) {
            inst.triggerNote(item.midi, item.durationNotation, time, item.velocity);
          }
        }
        // 2. Continuous Melodic Flow Event
        else if (item.kind === 'flow') {
          const voice = flowVoicePool.acquireVoice(
            item.strokeId,
            item.trackId,
            item.instrumentId,
            laneChannel
          );
          voice.triggerAttack(item.initialFreq, time, item.velocity);

          // Schedule slide breakpoints
          for (const bp of item.breakpoints) {
            voice.setNote(bp.freq, bp.timeSeconds, bp.slideSeconds);
          }

          // Release at stroke end with smooth fade
          voice.triggerRelease(item.endTimeSeconds);
        }
        // 3. Beat Hit Event
        else if (item.kind === 'beatHit') {
          const kit = this.getOrCreateDrumKit(item.laneId, item.kitId);
          kit.trigger(item.soundId, time, item.velocity);
        }
        // 4. Beat Flow Event
        else if (item.kind === 'beatFlow') {
          const tr = (this.song.assets[placement.assetId]?.project?.tracks || []).find((t: any) => t.id === item.trackId);
          const voice = beatFlowVoicePool.acquireVoice(
            item.strokeId,
            item.trackId,
            item.style,
            tr?.beatRollVoice || 'snare',
            tr?.beatSweepCharacter || 'shaker',
            laneChannel
          );

          voice.triggerAttack(item.initialFreqOrY, time, item.initialVelocity, item.initialWidth);

          if (item.rollHits) {
            for (const rh of item.rollHits) {
              voice.updateParam(rh.normY, rh.timeSeconds, 0.03, rh.width);
            }
          }
          if (item.breakpoints) {
            for (const bp of item.breakpoints) {
              voice.updateParam(bp.freqOrY, bp.timeSeconds, bp.slideSeconds, bp.width);
            }
          }

          voice.triggerRelease(item.endTimeSeconds);
        }

        // Visual sounding pulse
        Tone.getDraw().schedule(() => {
          this.callbacks.onClipSounding?.(item.placementId);
        }, time);
      }, events.map((ev) => [ev.kind === 'flow' || ev.kind === 'beatFlow' ? ev.startTimeSeconds : ev.timeSeconds, ev] as any));

      part.start(0);
      this.activeParts.set(placement.id, part);
    } catch {}
  }

  /**
   * Unmounts and disposes a Tone.Part for a placement.
   */
  private unmountPlacementPart(placementId: string) {
    const part = this.activeParts.get(placementId);
    if (part) {
      part.dispose();
      this.activeParts.delete(placementId);
    }
  }

  /**
   * Sliding lookahead window management (currentBar - 0.5 to currentBar + 4.0).
   */
  public updateWindow(currentBar: number) {
    if (this.isDisposed) return;

    const windowStart = currentBar - 0.5;
    const windowEnd = currentBar + 4.0;

    for (const placement of this.song.placements) {
      const pStart = placement.startBar;
      const pEnd = placement.startBar + placement.lengthBars;

      const isInWindow = pStart <= windowEnd && pEnd >= windowStart;

      if (isInWindow) {
        if (!this.activeParts.has(placement.id)) {
          this.mountPlacementPart(placement);
        }
      } else {
        if (this.activeParts.has(placement.id)) {
          this.unmountPlacementPart(placement.id);
        }
      }
    }
  }

  /**
   * Starts song playback. Single source of audio clock is Tone.Transport.
   */
  public async play(): Promise<void> {
    if (this.isDisposed) return;

    if (Tone.context.state !== 'running') {
      await Tone.start();
      state.audioStarted = true;
      events.emit('audio:started', undefined);
    }

    this.updatePolyphonyCap();
    const currentBar = this.getCurrentBar();
    this.updateWindow(currentBar);

    Tone.getTransport().start();
    this.startAnimationLoop();
    this.callbacks.onPlaybackStateChange?.(true);
  }

  /**
   * Pauses song playback with smooth 30ms voice releases to avoid clicks.
   */
  public pause(): void {
    if (this.isDisposed) return;

    Tone.getTransport().pause();
    this.releaseAllVoices(0.03);
    this.stopAnimationLoop();
    this.callbacks.onPlaybackStateChange?.(false);
  }

  /**
   * Stops song playback, releases all voices, returns to 0 (or loop start).
   */
  public stop(): void {
    if (this.isDisposed) return;

    Tone.getTransport().stop();
    this.releaseAllVoices(0.03);
    this.stopAnimationLoop();

    const resetBar = this.song.loopRegion ? this.song.loopRegion.startBar : 0;
    this.seek(resetBar);
    this.callbacks.onPlaybackStateChange?.(false);
  }

  /**
   * Seeks to a specific bar on the timeline with smooth voice release.
   */
  public seek(bar: number): void {
    if (this.isDisposed) return;

    this.releaseAllVoices(0.03);
    const secondsPerBar = 240 / (this.song.bpm || 90);
    const targetSeconds = bar * secondsPerBar;

    Tone.getTransport().seconds = targetSeconds;
    this.updateWindow(bar);

    const wholeBar = Math.floor(bar);
    const beat = Math.floor((bar - wholeBar) * 4) + 1;
    this.callbacks.onPlayheadTick?.(wholeBar + 1, beat, targetSeconds, bar);
  }

  /**
   * Smoothly releases all voices across melodic flow and beat pools.
   */
  private releaseAllVoices(fadeSec: number = 0.03) {
    getFlowVoicePool().releaseAll(fadeSec);
    getBeatFlowVoicePool().releaseAll(fadeSec);
  }

  /**
   * Returns current playhead bar position compensated for hardware and user sync latency.
   */
  public getCurrentBar(): number {
    const bpm = this.song.bpm || 90;
    const secondsPerBar = 240 / bpm;
    if (secondsPerBar <= 0) return 0;

    const hardwareLatency = getTotalAudioLatencySeconds();
    const userOffset = state.syncOffsetMs / 1000;
    const audioLatency = hardwareLatency + userOffset;

    const rawSec = Tone.getTransport().seconds;
    let compensatedSec = Math.max(0, rawSec - audioLatency);

    return compensatedSec / secondsPerBar;
  }

  public isPlaying(): boolean {
    return Tone.getTransport().state === 'started';
  }

  private startAnimationLoop() {
    this.stopAnimationLoop();

    const tick = () => {
      if (!this.isPlaying()) return;

      const currentBar = this.getCurrentBar();
      this.updateWindow(currentBar);

      const wholeBar = Math.floor(currentBar);
      const beat = Math.floor((currentBar - wholeBar) * 4) + 1;
      const totalSec = currentBar * (240 / (this.song.bpm || 90));

      this.callbacks.onPlayheadTick?.(wholeBar + 1, beat, totalSec, currentBar);

      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  private stopAnimationLoop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Debounced update after timeline edits (re-compiles without stopping Transport).
   */
  public updateSong(newSong: Song) {
    if (this.isDisposed) return;
    this.song = newSong;

    if (this.rebuildTimer !== null) {
      window.clearTimeout(this.rebuildTimer);
    }

    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuildSchedule();
    }, 150);
  }

  private rebuildSchedule() {
    if (this.isDisposed) return;

    this.setupTransportSettings();
    this.schedule = buildSongSchedule(this.song);

    // Update master chain
    this.masterChain.updateSettings(this.song.master);

    // Update lane audio nodes
    const anySolo = this.song.lanes.some((l) => l.solo);
    for (const lane of this.song.lanes) {
      const node = this.laneAudioNodes.get(lane.id);
      if (node) {
        node.channel.volume.rampTo(lane.volumeDb ?? 0, 0.05);
        node.channel.pan.rampTo(lane.pan ?? 0, 0.05);
        node.reverbSend.gain.rampTo(lane.sendReverb ?? 0, 0.05);
        node.delaySend.gain.rampTo(lane.sendDelay ?? 0, 0.05);

        const shouldMute = anySolo ? !lane.solo : lane.mute;
        node.channel.mute = shouldMute;
        node.channel.solo = lane.solo;
      }
    }

    // Refresh active parts
    const currentBar = this.getCurrentBar();
    for (const part of this.activeParts.values()) {
      part.dispose();
    }
    this.activeParts.clear();

    this.updateWindow(currentBar);
  }

  /**
   * Complete clean-up: restores Tone.Transport settings for editor mode,
   * releases all audio nodes and parts with zero leaks.
   */
  public dispose() {
    this.isDisposed = true;
    this.stop();

    if (this.rebuildTimer !== null) {
      window.clearTimeout(this.rebuildTimer);
    }
    if (this.windowCheckTimer !== null) {
      window.clearInterval(this.windowCheckTimer);
    }

    for (const part of this.activeParts.values()) {
      part.dispose();
    }
    this.activeParts.clear();

    for (const item of this.instrumentCache.values()) {
      item.instance.dispose();
    }
    this.instrumentCache.clear();

    this.masterChain.dispose();

    for (const node of this.laneAudioNodes.values()) {
      try {
        node.channel.dispose();
        node.reverbSend.dispose();
        node.delaySend.dispose();
        node.meter.dispose();
      } catch {}
    }
    this.laneAudioNodes.clear();

    // Restore Transport settings for single-drawing canvas editor
    try {
      const t = Tone.getTransport();
      t.loop = true;
      t.loopStart = 0;
      t.loopEnd = `${state.bars || 2}m`;
      t.bpm.value = state.bpm || 90;
    } catch {}
  }
}
