import * as Tone from 'tone';
import { SustainedVoice, createSustainedVoice } from './sustainedVoices';
import { state, POLYPHONY_VOICE_COUNTS } from '../state';
import { yToMidi } from './scales';


interface PoolItem {
  voice: SustainedVoice;
  trackId: string;
  instrumentId: string;
  strokeId: string | null;
  lastUsedTime: number;
  inUse: boolean;
}

export class FlowVoicePool {
  private maxSimultaneousVoices: number = POLYPHONY_VOICE_COUNTS[state.polyphony] || 8;
  private pool: PoolItem[] = [];

  public setCap(cap: number): void {
    this.maxSimultaneousVoices = cap;
    this.pruneUnused(cap);
  }

  public getCap(): number {
    return this.maxSimultaneousVoices;
  }

  /**
   * Acquire a monophonic sustained voice for a stroke.
   * If total in-use voices reaches the cap, the oldest voice is stolen with a smooth fade.
   */
  public acquireVoice(
    strokeId: string,
    trackId: string,
    instrumentId: string,
    destination: Tone.ToneAudioNode
  ): SustainedVoice {
    const now = performance.now();

    // 1. Check if already assigned to this stroke
    const existing = this.pool.find((item) => item.strokeId === strokeId && item.inUse);
    if (existing) {
      existing.lastUsedTime = now;
      return existing.voice;
    }

    // 2. Check if an idle voice for the same track & instrument exists
    const idleSameType = this.pool.find(
      (item) => !item.inUse && item.trackId === trackId && item.instrumentId === instrumentId
    );
    if (idleSameType) {
      idleSameType.inUse = true;
      idleSameType.strokeId = strokeId;
      idleSameType.lastUsedTime = now;
      return idleSameType.voice;
    }

    // 3. Check if we have room under the dynamic voice limit
    const inUseCount = this.pool.filter((item) => item.inUse).length;
    if (inUseCount < this.maxSimultaneousVoices) {
      const newVoice = createSustainedVoice(instrumentId, destination);
      const item: PoolItem = {
        voice: newVoice,
        trackId,
        instrumentId,
        strokeId,
        lastUsedTime: now,
        inUse: true,
      };
      this.pool.push(item);
      return newVoice;
    }

    // 4. Cap reached: steal the oldest voice with a short fade (never a click)
    let oldestIndex = -1;
    let oldestTime = Infinity;
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].lastUsedTime < oldestTime) {
        oldestTime = this.pool[i].lastUsedTime;
        oldestIndex = i;
      }
    }

    if (oldestIndex !== -1) {
      const stolen = this.pool[oldestIndex];
      stolen.voice.fadeAndRelease(0.02);

      // If same instrument and track, we can recycle the voice node
      if (stolen.trackId === trackId && stolen.instrumentId === instrumentId) {
        stolen.strokeId = strokeId;
        stolen.lastUsedTime = now;
        stolen.inUse = true;
        return stolen.voice;
      }

      // Otherwise dispose stolen voice and replace in slot
      stolen.voice.dispose();
      const newVoice = createSustainedVoice(instrumentId, destination);
      this.pool[oldestIndex] = {
        voice: newVoice,
        trackId,
        instrumentId,
        strokeId,
        lastUsedTime: now,
        inUse: true,
      };
      return newVoice;
    }

    // Fallback if no item found
    const fallback = createSustainedVoice(instrumentId, destination);
    return fallback;
  }

  public markStrokeEnded(strokeId: string) {
    for (const item of this.pool) {
      if (item.strokeId === strokeId) {
        item.inUse = false;
        item.strokeId = null;
      }
    }
  }

  /**
   * Release voice belonging to a specific stroke that was cut or removed with a smooth 30ms fade.
   */
  public releaseStrokeVoice(strokeId: string, fadeSeconds: number = 0.03) {
    for (const item of this.pool) {
      if (item.strokeId === strokeId && item.inUse) {
        item.voice.fadeAndRelease(fadeSeconds);
        item.inUse = false;
        item.strokeId = null;
      }
    }
  }

  /**
   * Release any currently sounding voices belonging to strokes that no longer exist.
   */
  public releaseStrokesNotIn(activeStrokeIds: Set<string>, fadeSeconds: number = 0.03) {
    for (const item of this.pool) {
      if (item.strokeId && !activeStrokeIds.has(item.strokeId) && item.inUse) {
        item.voice.fadeAndRelease(fadeSeconds);
        item.inUse = false;
        item.strokeId = null;
      }
    }
  }

  /**
   * Release all currently sounding voices with a short fade to prevent any clicks or hanging notes.
   */
  public releaseAll(fadeSeconds: number = 0.03) {
    for (const item of this.pool) {
      item.voice.fadeAndRelease(fadeSeconds);
      item.inUse = false;
      item.strokeId = null;
    }
  }

  /**
   * Smoothly retunes active voices for a track over glideSeconds (default 45ms) without retriggering.
   */
  public retuneActiveTrackVoices(
    trackId: string,
    newScaleNotes: number[],
    glideSeconds: number = 0.045
  ) {
    const now = Tone.now();
    for (const item of this.pool) {
      if (item.inUse && item.trackId === trackId && item.strokeId) {
        const stroke = state.strokes.find((s) => s.id === item.strokeId);
        if (stroke && stroke.points.length > 0) {
          const midY = stroke.points[Math.floor(stroke.points.length / 2)].y;
          const newMidi = yToMidi(midY, newScaleNotes);
          const newFreq = 440 * Math.pow(2, (newMidi - 69) / 12);
          item.voice.setNote(newFreq, now, glideSeconds);
        }
      }
    }
  }


  public pruneUnused(keepMax: number = 8) {
    const active = this.pool.filter((i) => i.inUse);
    const idle = this.pool.filter((i) => !i.inUse);

    while (active.length + idle.length > keepMax && idle.length > 0) {
      const discarded = idle.pop();
      if (discarded) {
        discarded.voice.dispose();
      }
    }
    this.pool = [...active, ...idle];
  }

  public dispose() {
    for (const item of this.pool) {
      try {
        item.voice.dispose();
      } catch {}
    }
    this.pool = [];
  }
}

let sharedPool: FlowVoicePool | null = null;

export function getFlowVoicePool(): FlowVoicePool {
  if (!sharedPool) {
    sharedPool = new FlowVoicePool();
  }
  return sharedPool;
}
