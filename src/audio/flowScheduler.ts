import { Stroke } from '../state';
import { yToMidi } from './scales';
import { getStrokeBranches, interpolateBranchY } from './branches';

export interface FlowBreakpoint {
  timeSeconds: number;
  midi: number;
  freq: number;
  slideSeconds: number;
  normX: number;
  normY: number;
}

export interface FlowStrokeEvent {
  strokeId: string;
  branchId?: string;
  trackId: string;
  startTime: number;
  endTime: number;
  initialMidi: number;
  initialFreq: number;
  velocity: number;
  startX: number;
  startY: number;
  priority?: number;
  breakpoints: FlowBreakpoint[];
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Pure function: converts vector strokes into continuous flow playback events
 * using branch-based multi-intersection splitting.
 * Each branch plays as an independent voice over its active X range.
 */
export function generateFlowEventsFromStrokes(
  strokes: Stroke[],
  bars: number,
  bpm: number,
  scaleNotes: number[],
  glidePercent: number = 25
): FlowStrokeEvent[] {
  if (strokes.length === 0 || scaleNotes.length === 0) {
    return [];
  }

  const loopDuration = bars * 4 * (60 / bpm);
  const glideFraction = Math.max(0, Math.min(1, glidePercent / 100));
  const result: FlowStrokeEvent[] = [];

  for (const stroke of strokes) {
    const rawPts = stroke.points;
    if (rawPts.length === 0) continue;

    const branches = getStrokeBranches(stroke);
    if (branches.length === 0) continue;

    for (let bIdx = 0; bIdx < branches.length; bIdx++) {
      const branch = branches[bIdx];
      const strokeEventId = branches.length === 1 ? stroke.id : branch.id;
      const baseVelocity = Math.min(0.95, Math.max(0.45, 0.55 + (branch.width / 4) * 0.25));
      const branchVar = bIdx % 2 === 0 ? 0 : -0.03;
      const velocity = Math.min(0.95, Math.max(0.45, baseVelocity + branchVar));

      let startTime: number;
      let endTime: number;
      const rawBreakpoints: { time: number; midi: number; x: number; y: number }[] = [];
      let initialMidi: number;
      let startX: number;
      let startY: number;

      if (branch.isSweep) {
        // Vertical or near-vertical sweep branch
        const minSweepDuration = 0.12; // 120ms minimum duration
        startX = (branch.xStart + branch.xEnd) / 2;
        startTime = Math.min(startX * loopDuration, Math.max(0, loopDuration - minSweepDuration));
        endTime = Math.min(loopDuration, startTime + minSweepDuration);

        startY = branch.yStart;
        const endY = branch.yEnd;
        initialMidi = yToMidi(startY, scaleNotes);

        let currentMidi = initialMidi;
        const sweepSteps = 8;
        for (let s = 1; s <= sweepSteps; s++) {
          const progress = s / sweepSteps;
          const curY = startY + progress * (endY - startY);
          const curMidi = yToMidi(curY, scaleNotes);
          const curTime = startTime + progress * (endTime - startTime);

          if (curMidi !== currentMidi) {
            currentMidi = curMidi;
            rawBreakpoints.push({
              time: curTime,
              midi: curMidi,
              x: startX,
              y: curY,
            });
          }
        }
      } else {
        // Monotonic branch along X
        startTime = branch.xStart * loopDuration;
        endTime = Math.min(loopDuration, Math.max(startTime + 0.08, branch.xEnd * loopDuration));
        startX = branch.xStart;
        startY = interpolateBranchY(branch, branch.xStart);
        initialMidi = yToMidi(startY, scaleNotes);

        const totalSteps = 128;
        let currentMidi = initialMidi;

        for (let s = 0; s <= totalSteps; s++) {
          const sampleX = s / totalSteps;
          if (sampleX <= branch.xStart || sampleX >= branch.xEnd) continue;

          const curY = interpolateBranchY(branch, sampleX);
          const curMidi = yToMidi(curY, scaleNotes);
          const curTime = sampleX * loopDuration;

          if (curMidi !== currentMidi) {
            currentMidi = curMidi;
            rawBreakpoints.push({
              time: curTime,
              midi: curMidi,
              x: sampleX,
              y: curY,
            });
          }
        }

        const endMidi = yToMidi(interpolateBranchY(branch, branch.xEnd), scaleNotes);
        if (endMidi !== currentMidi) {
          rawBreakpoints.push({
            time: endTime,
            midi: endMidi,
            x: branch.xEnd,
            y: interpolateBranchY(branch, branch.xEnd),
          });
        }
      }

      // Convert raw breakpoints into FlowBreakpoint with glide slideSeconds
      const breakpoints: FlowBreakpoint[] = rawBreakpoints.map((rb, idx) => {
        const nextTime = idx < rawBreakpoints.length - 1 ? rawBreakpoints[idx + 1].time : endTime;
        const noteDuration = Math.max(0.01, nextTime - rb.time);
        const maxGlideSec = noteDuration * 0.9;
        const slideSeconds = Math.max(
          0.008,
          Math.min(maxGlideSec, 0.008 + glideFraction * (maxGlideSec - 0.008))
        );

        return {
          timeSeconds: rb.time,
          midi: rb.midi,
          freq: midiToFrequency(rb.midi),
          slideSeconds,
          normX: rb.x,
          normY: rb.y,
        };
      });

      result.push({
        strokeId: strokeEventId,
        branchId: branch.id,
        trackId: stroke.trackId,
        startTime,
        endTime,
        initialMidi,
        initialFreq: midiToFrequency(initialMidi),
        velocity,
        startX,
        startY,
        priority: branch.priority,
        breakpoints,
      });
    }
  }

  return result;
}

/**
 * Ahead-of-time greedy interval allocation for flow events.
 * Caps simultaneous active voices to maxVoices (e.g. 4, 8, 12).
 * When voices exceed cap, drops the lowest-priority (shortest / thinnest) events.
 */
export function thinFlowEvents(
  events: FlowStrokeEvent[],
  maxVoices: number
): { kept: FlowStrokeEvent[]; isThinned: boolean } {
  if (events.length <= maxVoices) {
    return { kept: events, isThinned: false };
  }

  // Calculate priority score for each event: branch priority or duration + velocity
  const scored = events.map((ev) => {
    const duration = Math.max(0.01, ev.endTime - ev.startTime);
    const score = ev.priority !== undefined ? ev.priority : duration * 10 + ev.velocity * 2;
    return { ev, score };
  });

  // Sort descending: highest priority first
  scored.sort((a, b) => b.score - a.score);

  // Channels hold array of non-overlapping time intervals [start, end]
  const channels: { start: number; end: number }[][] = Array.from({ length: maxVoices }, () => []);
  const kept: FlowStrokeEvent[] = [];
  let isThinned = false;

  for (const { ev } of scored) {
    let assigned = false;
    for (let c = 0; c < maxVoices; c++) {
      const channel = channels[c];
      // Check for overlap with any existing interval in this channel
      const overlaps = channel.some(
        (iv) => Math.max(iv.start, ev.startTime) < Math.min(iv.end, ev.endTime)
      );
      if (!overlaps) {
        channel.push({ start: ev.startTime, end: ev.endTime });
        kept.push(ev);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      isThinned = true;
    }
  }

  // Preserve original chronological order of kept events
  kept.sort((a, b) => a.startTime - b.startTime);

  return { kept, isThinned };
}
