import * as Tone from 'tone';
import { state } from '../state';
import { SCALES, ScaleName } from './scales';
import { INSTRUMENTS_MAP, InstrumentInstance } from './instruments';
import { getTrackManager, Track } from './tracks';
import { getMasterEffectsRack } from './effects';

const AUDITION_STORAGE_KEY = 'instruversal:audition';

export function getAuditionEnabled(): boolean {
  try {
    const val = localStorage.getItem(AUDITION_STORAGE_KEY);
    if (val !== null) {
      return val === 'true';
    }
  } catch {}
  return true; // Default ON
}

export function setAuditionEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUDITION_STORAGE_KEY, String(enabled));
  } catch {}
}

/**
 * Computes comfortable middle octave root note (nearest to MIDI 60 within C3 to C6).
 * So B plays as B3 (59) not B5 (83), C plays as C4 (60).
 */
export function getComfortableRootMidi(rootIndex: number): number {
  const normRoot = ((rootIndex % 12) + 12) % 12;
  const candidates = [normRoot + 48, normRoot + 60, normRoot + 72];
  let best = candidates[0];
  let bestDist = Math.abs(best - 60);

  for (let i = 1; i < candidates.length; i++) {
    const dist = Math.abs(candidates[i] - 60);
    if (dist < bestDist) {
      best = candidates[i];
      bestDist = dist;
    }
  }

  return best;
}

export type PreviewHighlightCallback = (step: number | 'chord' | null) => void;

export class PreviewEngine {
  private previewVoice: InstrumentInstance | null = null;
  private currentInstrumentId: string | null = null;
  private previewGain: Tone.Gain | null = null;
  private lastTriggerTime: number = 0;
  private onHighlight: PreviewHighlightCallback | null = null;

  constructor() {
    // Lazy initialisation of audio nodes
  }

  private ensureAudioContext(): void {
    if (Tone.context.state !== 'running') {
      Tone.context.resume().catch(() => {});
    }
  }

  private getVoice(instrumentId: string): InstrumentInstance {
    this.ensureAudioContext();

    if (!this.previewGain) {
      this.previewGain = new Tone.Gain(0.75);
      this.previewGain.connect(getMasterEffectsRack().input);
    }

    if (!this.previewVoice || this.currentInstrumentId !== instrumentId) {
      if (this.previewVoice) {
        this.previewVoice.dispose();
      }

      const meta = INSTRUMENTS_MAP[instrumentId] || INSTRUMENTS_MAP['tape-keys'] || INSTRUMENTS_MAP['pluck'];
      this.previewVoice = meta.create();
      this.currentInstrumentId = meta.id;
      this.previewVoice.output.connect(this.previewGain);
    }

    return this.previewVoice;
  }

  public cancelPreview(): void {
    const now = Tone.now();
    if (this.previewGain) {
      this.previewGain.gain.cancelScheduledValues(now);
      this.previewGain.gain.setValueAtTime(this.previewGain.gain.value, now);
      this.previewGain.gain.linearRampToValueAtTime(0.0001, now + 0.03);
    }

    if (this.onHighlight) {
      this.onHighlight(null);
    }
  }

  public previewRoot(
    rootIndex: number,
    track?: Track,
    onHighlight?: PreviewHighlightCallback
  ): void {
    const nowMs = performance.now();
    if (nowMs - this.lastTriggerTime < 60) return; // 60ms debounce
    this.lastTriggerTime = nowMs;

    this.onHighlight = onHighlight || null;
    this.cancelPreview();

    const tm = getTrackManager();
    const selTrack = track || tm.getTrack(state.selectedTrackId);
    const isBeat = selTrack?.trackType === 'beat';
    const instrumentId = isBeat ? 'tape-keys' : selTrack?.instrumentId || 'pluck';

    const voice = this.getVoice(instrumentId);
    const baseVol = selTrack?.volume !== undefined ? selTrack.volume : 0.8;
    // Lower slightly by ~15% if loop is playing so both are audible
    const targetVol = state.isPlaying ? baseVol * 0.85 : baseVol;

    const startTime = Tone.now() + 0.035;
    this.previewGain?.gain.setValueAtTime(targetVol, startTime);

    const rootMidi = getComfortableRootMidi(rootIndex);
    const fifthMidi = rootMidi + 7;

    // 1. Root note at startTime, held 720ms
    voice.triggerNote(rootMidi, 0.72, startTime, 0.8);

    // 2. Perfect fifth note at startTime + 120ms, held 600ms (both release together)
    voice.triggerNote(fifthMidi, 0.6, startTime + 0.12, 0.75);

    if (onHighlight) {
      Tone.getDraw().schedule(() => onHighlight(0), startTime);
      Tone.getDraw().schedule(() => onHighlight('chord'), startTime + 0.12);
      Tone.getDraw().schedule(() => onHighlight(null), startTime + 0.72);
    }
  }

  public previewScale(
    rootIndex: number,
    scaleName: ScaleName,
    track?: Track,
    onHighlight?: PreviewHighlightCallback
  ): void {
    const nowMs = performance.now();
    if (nowMs - this.lastTriggerTime < 60) return; // 60ms debounce
    this.lastTriggerTime = nowMs;

    this.onHighlight = onHighlight || null;
    this.cancelPreview();

    const tm = getTrackManager();
    const selTrack = track || tm.getTrack(state.selectedTrackId);
    const isBeat = selTrack?.trackType === 'beat';
    const instrumentId = isBeat ? 'tape-keys' : selTrack?.instrumentId || 'pluck';

    const voice = this.getVoice(instrumentId);
    const baseVol = selTrack?.volume !== undefined ? selTrack.volume : 0.8;
    const targetVol = state.isPlaying ? baseVol * 0.85 : baseVol;

    const startTime = Tone.now() + 0.035;
    this.previewGain?.gain.setValueAtTime(targetVol, startTime);

    const rootMidi = getComfortableRootMidi(rootIndex);
    const intervals = SCALES[scaleName] || SCALES['major pentatonic'];

    // Ascending scale run: one octave from root, ~140ms per note, ending on octave
    const runNotes = intervals.map((semi) => rootMidi + semi);
    runNotes.push(rootMidi + 12); // Octave

    const stepSpacingSec = 0.14;
    const noteDurationSec = 0.12;

    for (let i = 0; i < runNotes.length; i++) {
      const stepTime = startTime + i * stepSpacingSec;
      const vel = 0.65 + (i / runNotes.length) * 0.2;
      voice.triggerNote(runNotes[i], noteDurationSec, stepTime, vel);

      if (onHighlight) {
        Tone.getDraw().schedule(() => onHighlight(i), stepTime);
      }
    }

    // Tonic triad chord at end: root, third, fifth held for 700ms
    const chordTime = startTime + runNotes.length * stepSpacingSec;
    const isMinorType = scaleName.includes('minor') || scaleName === 'dorian';
    const thirdInterval = isMinorType ? 3 : 4;

    const triadNotes = [rootMidi, rootMidi + thirdInterval, rootMidi + 7];

    for (const note of triadNotes) {
      voice.triggerNote(note, 0.7, chordTime, 0.78);
    }

    if (onHighlight) {
      Tone.getDraw().schedule(() => onHighlight('chord'), chordTime);
      Tone.getDraw().schedule(() => onHighlight(null), chordTime + 0.7);
    }
  }

  public dispose(): void {
    this.cancelPreview();
    if (this.previewVoice) {
      this.previewVoice.dispose();
      this.previewVoice = null;
    }
    if (this.previewGain) {
      this.previewGain.dispose();
      this.previewGain = null;
    }
  }
}

let sharedPreviewEngine: PreviewEngine | null = null;
export function getPreviewEngine(): PreviewEngine {
  if (!sharedPreviewEngine) {
    sharedPreviewEngine = new PreviewEngine();
  }
  return sharedPreviewEngine;
}
