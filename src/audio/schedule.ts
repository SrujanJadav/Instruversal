import * as Tone from 'tone';
import { Stroke, state, events } from '../state';
import { buildScaleNotes, yToMidi } from './scales';
import { getTrackManager } from './tracks';

export interface NoteEvent {
  time: string | number;
  timeSeconds?: number;
  midi: number;
  duration: Tone.Unit.Time;
  velocity: number;
  trackId: string;
  strokeId: string;
  normX: number;
  normY: number;
}

/**
 * Pure function: converts a collection of strokes into pre-scheduled note events
 * across a 16th-note discretized loop grid.
 */
export function generateEventsFromStrokes(
  strokes: Stroke[],
  bars: number,
  scaleNotes: number[]
): NoteEvent[] {
  if (strokes.length === 0 || scaleNotes.length === 0) {
    return [];
  }

  const totalSteps = bars * 16; // 16 sixteenth-notes per bar (4/4 time)
  const rawEvents: NoteEvent[] = [];

  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length === 0) continue;

    const baseVelocity = Math.min(0.95, Math.max(0.45, 0.55 + (stroke.width / 4) * 0.25));

    // Case 1: Single point tap
    if (pts.length === 1) {
      const p = pts[0];
      const stepIndex = Math.max(0, Math.min(totalSteps - 1, Math.floor(p.x * totalSteps)));
      const bar = Math.floor(stepIndex / 16);
      const beat = Math.floor((stepIndex % 16) / 4);
      const sixteenth = stepIndex % 4;
      const timeStr = `${bar}:${beat}:${sixteenth}`;

      const midi = yToMidi(p.y, scaleNotes);
      rawEvents.push({
        time: timeStr,
        midi,
        duration: '16n',
        velocity: baseVelocity,
        trackId: stroke.trackId,
        strokeId: stroke.id,
        normX: p.x,
        normY: p.y,
      });
      continue;
    }

    // Case 2: Multi-point stroke
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const isNearVertical = (maxX - minX) < 0.03 && (maxY - minY) > 0.06;

    if (isNearVertical) {
      // Near-vertical strokes: strum up to 4 notes staggered by 25ms
      const midX = (minX + maxX) / 2;
      const stepIndex = Math.max(0, Math.min(totalSteps - 1, Math.floor(midX * totalSteps)));

      const strumCount = Math.min(4, Math.max(2, Math.round((maxY - minY) * 12)));
      for (let j = 0; j < strumCount; j++) {
        const sampleY = minY + (j / (strumCount - 1)) * (maxY - minY);
        const midi = yToMidi(sampleY, scaleNotes);
        const staggerOffset = j * 0.025; // 25ms stagger

        // Compute step time in seconds for offset addition
        const stepTimeInSeconds = (stepIndex * (60 / (90 * 4)));
        const finalTime = stepTimeInSeconds + staggerOffset;

        rawEvents.push({
          time: finalTime,
          timeSeconds: finalTime,
          midi,
          duration: '16n',
          velocity: Math.max(0.4, baseVelocity - j * 0.04),
          trackId: stroke.trackId,
          strokeId: stroke.id,
          normX: midX,
          normY: sampleY,
        });
      }
    } else {
      // Normal stroke: check intersection with each grid step
      for (let s = 0; s < totalSteps; s++) {
        const stepX = (s + 0.5) / totalSteps;
        if (stepX < minX || stepX > maxX) continue;

        // Find segments that cross stepX
        for (let k = 0; k < pts.length - 1; k++) {
          const p1 = pts[k];
          const p2 = pts[k + 1];
          const segMinX = Math.min(p1.x, p2.x);
          const segMaxX = Math.max(p1.x, p2.x);

          if (stepX >= segMinX && stepX <= segMaxX) {
            const dx = p2.x - p1.x;
            const t = Math.abs(dx) > 0.0001 ? (stepX - p1.x) / dx : 0.5;
            const interpY = Math.max(0, Math.min(1, p1.y + t * (p2.y - p1.y)));
            const midi = yToMidi(interpY, scaleNotes);

            const bar = Math.floor(s / 16);
            const beat = Math.floor((s % 16) / 4);
            const sixteenth = s % 4;
            const timeStr = `${bar}:${beat}:${sixteenth}`;

            rawEvents.push({
              time: timeStr,
              midi,
              duration: '16n',
              velocity: baseVelocity,
              trackId: stroke.trackId,
              strokeId: stroke.id,
              normX: stepX,
              normY: interpY,
            });
            break; // One note per stroke per step
          }
        }
      }
    }
  }

  // De-duplicate identical pitches on same track at the same step
  const finalEvents: NoteEvent[] = [];
  const seenKey = new Set<string>();

  for (const ev of rawEvents) {
    const key = `${ev.trackId}-${typeof ev.time === 'number' ? ev.time.toFixed(3) : ev.time}-${ev.midi}`;
    if (!seenKey.has(key)) {
      seenKey.add(key);
      finalEvents.push(ev);
    }
  }

  return finalEvents;
}

import { generateFlowEventsFromStrokes } from './flowScheduler';
import { getFlowVoicePool } from './voicePool';
import { generateBeatEventsFromStrokes, BeatHitEvent } from './beatSchedule';
import { triggerKickDucking } from './tracks';

interface FlowPartEvent {
  type: 'attack' | 'breakpoint' | 'release' | 'loopWrap';
  time: number;
  strokeId: string;
  trackId: string;
  freq?: number;
  midi?: number;
  slideSeconds?: number;
  velocity?: number;
  normX?: number;
  normY?: number;
}

export class LoopScheduler {
  private melodicPart: Tone.Part | null = null;
  private beatPart: Tone.Part | null = null;
  private rebuildTimer: number | null = null;
  private unsubs: (() => void)[] = [];

  constructor() {
    this.setupListeners();
    this.rebuild();
  }

  private setupListeners() {
    this.unsubs.push(
      events.on('stroke:added', () => this.debouncedRebuild()),
      events.on('strokes:updated', () => {
        getFlowVoicePool().releaseAll(0.02);
        this.debouncedRebuild();
      }),
      events.on('scale:change', () => {
        getFlowVoicePool().releaseAll(0.02);
        this.debouncedRebuild();
      }),
      events.on('bpm:change', () => this.debouncedRebuild()),
      events.on('playback-mode:change', () => {
        getFlowVoicePool().releaseAll(0.02);
        this.debouncedRebuild();
      }),
      events.on('glide:change', () => this.debouncedRebuild()),
      events.on('track:type-change', () => this.debouncedRebuild()),
      events.on('track:beat-param-change', () => this.debouncedRebuild()),
      events.on('transport:pause', () => {
        getFlowVoicePool().releaseAll(0.02);
      })
    );
  }

  public debouncedRebuild() {
    if (this.rebuildTimer !== null) {
      window.clearTimeout(this.rebuildTimer);
    }
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuild();
    }, 40);
  }

  public rebuild() {
    const oldMelodicPart = this.melodicPart;
    const oldBeatPart = this.beatPart;
    const trackManager = getTrackManager();

    if (state.strokes.length === 0) {
      if (oldMelodicPart) {
        oldMelodicPart.dispose();
        this.melodicPart = null;
      }
      if (oldBeatPart) {
        oldBeatPart.dispose();
        this.beatPart = null;
      }
      getFlowVoicePool().releaseAll(0.02);
      return;
    }

    // Partition strokes into melodic vs beat
    const melodicStrokes: Stroke[] = [];
    const beatStrokes: Stroke[] = [];

    for (const stroke of state.strokes) {
      const tr = trackManager.getTrack(stroke.trackId);
      if (tr && tr.trackType === 'beat') {
        beatStrokes.push(stroke);
      } else {
        melodicStrokes.push(stroke);
      }
    }

    // 1. Rebuild Beat Part
    if (beatStrokes.length === 0) {
      if (oldBeatPart) {
        oldBeatPart.dispose();
        this.beatPart = null;
      }
    } else {
      const selectedTr = trackManager.getTrack(state.selectedTrackId);
      const beatHits = generateBeatEventsFromStrokes(beatStrokes, {
        bpm: state.bpm,
        bars: state.bars,
        rate: selectedTr?.beatRate || '1/16',
        swing: selectedTr?.swing || 0,
        humanize: selectedTr?.humanize !== undefined ? selectedTr.humanize : 15,
      });

      if (beatHits.length === 0) {
        if (oldBeatPart) {
          oldBeatPart.dispose();
          this.beatPart = null;
        }
      } else {
        const newBeatPart = new Tone.Part((time, hit: BeatHitEvent) => {
          const track = trackManager.getTrack(hit.trackId);
          if (!track || !track.shouldPlay(trackManager.hasAnySolo())) return;

          track.triggerDrum(hit.soundId, time, hit.velocity);

          // Sidechain kick ducking
          if (hit.soundId === 'kick' && state.kickDucking > 0) {
            triggerKickDucking(state.kickDucking);
          }

          // Visual pulse at hit coordinates via Tone.Draw (no ripples for beats)
          Tone.getDraw().schedule(() => {
            events.emit('note:hit', {
              strokeId: hit.strokeId,
              trackId: hit.trackId,
              midi: hit.laneIndex,
              x: hit.normX,
              y: hit.normY,
              isBeat: true,
            });
          }, time);
        }, beatHits as unknown as any[]);

        newBeatPart.loop = true;
        newBeatPart.loopStart = 0;
        newBeatPart.loopEnd = `${state.bars}m`;
        newBeatPart.start(0);

        this.beatPart = newBeatPart;
        if (oldBeatPart) {
          oldBeatPart.dispose();
        }
      }
    }

    // 2. Rebuild Melodic Part
    if (melodicStrokes.length === 0) {
      if (oldMelodicPart) {
        oldMelodicPart.dispose();
        this.melodicPart = null;
      }
      getFlowVoicePool().releaseAll(0.02);
      return;
    }

    const scaleNotes = buildScaleNotes(state.rootNote, state.scaleName, 3, 6);
    const voicePool = getFlowVoicePool();

    if (state.playbackMode === 'flow') {
      const flowEvents = generateFlowEventsFromStrokes(
        melodicStrokes,
        state.bars,
        state.bpm,
        scaleNotes,
        state.glide
      );

      if (flowEvents.length === 0) {
        if (oldMelodicPart) {
          oldMelodicPart.dispose();
          this.melodicPart = null;
        }
        return;
      }

      const loopDuration = state.bars * 4 * (60 / state.bpm);
      const partEvents: FlowPartEvent[] = [];

      for (const ev of flowEvents) {
        // 1. Single attack at stroke start
        partEvents.push({
          type: 'attack',
          time: ev.startTime,
          strokeId: ev.strokeId,
          trackId: ev.trackId,
          freq: ev.initialFreq,
          midi: ev.initialMidi,
          velocity: ev.velocity,
          normX: ev.startX,
          normY: ev.startY,
        });

        // 2. Pitch changes without retriggering
        for (const bp of ev.breakpoints) {
          partEvents.push({
            type: 'breakpoint',
            time: bp.timeSeconds,
            strokeId: ev.strokeId,
            trackId: ev.trackId,
            freq: bp.freq,
            midi: bp.midi,
            slideSeconds: bp.slideSeconds,
            normX: bp.normX,
            normY: bp.normY,
          });
        }

        // 3. Single release at stroke end
        partEvents.push({
          type: 'release',
          time: ev.endTime,
          strokeId: ev.strokeId,
          trackId: ev.trackId,
        });
      }

      // Loop wrap safety: ensure all voices released at loop end
      partEvents.push({
        type: 'loopWrap',
        time: Math.max(0, loopDuration - 0.005),
        strokeId: '',
        trackId: '',
      });

      const newPart = new Tone.Part((time, item: FlowPartEvent) => {
        if (item.type === 'loopWrap') {
          voicePool.releaseAll(0.01);
          return;
        }

        const track = trackManager.getTrack(item.trackId);
        if (!track || !track.shouldPlay(trackManager.hasAnySolo())) {
          if (item.type === 'release') {
            voicePool.markStrokeEnded(item.strokeId);
          }
          return;
        }

        if (item.type === 'attack') {
          const voice = voicePool.acquireVoice(
            item.strokeId,
            item.trackId,
            track.instrumentId,
            track.channel
          );
          voice.triggerAttack(item.freq!, time, item.velocity ?? 0.8);

          // Flow mode: spawn ONE ripple at stroke start
          Tone.getDraw().schedule(() => {
            events.emit('note:hit', {
              strokeId: item.strokeId,
              trackId: item.trackId,
              midi: item.midi!,
              x: item.normX!,
              y: item.normY!,
              isBeat: false,
            });
          }, time);
        } else if (item.type === 'breakpoint') {
          const voice = voicePool.acquireVoice(
            item.strokeId,
            item.trackId,
            track.instrumentId,
            track.channel
          );
          voice.setNote(item.freq!, time, item.slideSeconds);
        } else if (item.type === 'release') {
          const voice = voicePool.acquireVoice(
            item.strokeId,
            item.trackId,
            track.instrumentId,
            track.channel
          );
          voice.triggerRelease(time);
          voicePool.markStrokeEnded(item.strokeId);
        }
      }, partEvents as unknown as any[]);

      newPart.loop = true;
      newPart.loopStart = 0;
      newPart.loopEnd = `${state.bars}m`;
      newPart.start(0);

      this.melodicPart = newPart;
      if (oldMelodicPart) {
        oldMelodicPart.dispose();
      }
    } else {
      // Notes mode: stepped 16th-note grid
      const noteEvents = generateEventsFromStrokes(melodicStrokes, state.bars, scaleNotes);
      if (noteEvents.length === 0) {
        if (oldMelodicPart) {
          oldMelodicPart.dispose();
          this.melodicPart = null;
        }
        return;
      }

      const newPart = new Tone.Part((time, note: NoteEvent) => {
        trackManager.triggerNoteOnTrack(
          note.trackId,
          note.midi,
          note.duration,
          time,
          note.velocity
        );

        Tone.getDraw().schedule(() => {
          events.emit('note:hit', {
            strokeId: note.strokeId,
            trackId: note.trackId,
            midi: note.midi,
            x: note.normX,
            y: note.normY,
            isBeat: false,
          });
        }, time);
      }, noteEvents as unknown as any[]);

      newPart.loop = true;
      newPart.loopStart = 0;
      newPart.loopEnd = `${state.bars}m`;
      newPart.start(0);

      this.melodicPart = newPart;
      if (oldMelodicPart) {
        oldMelodicPart.dispose();
      }
    }
  }

  public dispose() {
    if (this.rebuildTimer !== null) {
      window.clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];
    if (this.melodicPart) {
      this.melodicPart.dispose();
      this.melodicPart = null;
    }
    if (this.beatPart) {
      this.beatPart.dispose();
      this.beatPart = null;
    }
    getFlowVoicePool().releaseAll(0.01);
  }
}

let sharedScheduler: LoopScheduler | null = null;

export function getLoopScheduler(): LoopScheduler {
  if (!sharedScheduler) {
    sharedScheduler = new LoopScheduler();
  }
  return sharedScheduler;
}

