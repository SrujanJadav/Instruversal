import { Stroke } from '../state';
import { yToMidi } from './scales';

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
  trackId: string;
  startTime: number;
  endTime: number;
  initialMidi: number;
  initialFreq: number;
  velocity: number;
  startX: number;
  startY: number;
  breakpoints: FlowBreakpoint[];
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Pure function: converts vector strokes into continuous flow playback events.
 * Breakpoints are generated only where quantized scale notes change.
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

    // For right-to-left strokes, sort points by X so playback follows playhead left-to-right
    const sorted = [...rawPts].sort((a, b) => a.x - b.x);

    const xMin = sorted[0].x;
    const xMax = sorted[sorted.length - 1].x;

    let yMin = Infinity;
    let yMax = -Infinity;
    for (const p of sorted) {
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }

    const baseVelocity = Math.min(0.95, Math.max(0.45, 0.55 + (stroke.width / 4) * 0.25));

    // Piecewise linear interpolation for y at any targetX
    const interpY = (targetX: number): number => {
      if (sorted.length === 1 || targetX <= sorted[0].x) return sorted[0].y;
      if (targetX >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;

      for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        if (targetX >= p1.x && targetX <= p2.x) {
          const dx = p2.x - p1.x;
          if (Math.abs(dx) < 0.000001) return p1.y;
          const frac = (targetX - p1.x) / dx;
          return p1.y + frac * (p2.y - p1.y);
        }
      }
      return sorted[0].y;
    };

    const isNearVertical = (xMax - xMin) < 0.03 && (yMax - yMin) > 0.06;
    const minSweepDuration = 0.12; // 120ms minimum duration

    let startTime: number;
    let endTime: number;
    const rawBreakpoints: { time: number; midi: number; x: number; y: number }[] = [];
    let initialMidi: number;
    let startX: number;
    let startY: number;

    if (isNearVertical) {
      // Near-vertical strokes: glissando sweep across y-range over minimum 120ms
      startX = (xMin + xMax) / 2;
      startTime = Math.min(startX * loopDuration, Math.max(0, loopDuration - minSweepDuration));
      endTime = Math.min(loopDuration, startTime + minSweepDuration);

      startY = sorted[0].y;
      const endY = sorted[sorted.length - 1].y;
      initialMidi = yToMidi(startY, scaleNotes);

      // Sample along the vertical sweep (up to 8 steps across the 120ms window)
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
      // Standard stroke: compute time span from x-range
      startTime = xMin * loopDuration;
      endTime = Math.min(loopDuration, Math.max(startTime + 0.08, xMax * loopDuration));
      startX = xMin;
      startY = interpY(xMin);
      initialMidi = yToMidi(startY, scaleNotes);

      // Sample every ~1/64 of the loop (64 steps across 0..1)
      const totalSteps = 64;
      let currentMidi = initialMidi;

      // Include points between xMin and xMax
      for (let s = 0; s <= totalSteps; s++) {
        const sampleX = s / totalSteps;
        if (sampleX <= xMin || sampleX >= xMax) continue;

        const curY = interpY(sampleX);
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

      // Check end point if different
      const endMidi = yToMidi(interpY(xMax), scaleNotes);
      if (endMidi !== currentMidi) {
        rawBreakpoints.push({
          time: endTime,
          midi: endMidi,
          x: xMax,
          y: interpY(xMax),
        });
      }
    }

    // Build finalized breakpoints with calculated glide slide durations
    const breakpoints: FlowBreakpoint[] = [];
    for (let i = 0; i < rawBreakpoints.length; i++) {
      const bp = rawBreakpoints[i];
      const nextTime = i < rawBreakpoints.length - 1 ? rawBreakpoints[i + 1].time : endTime;
      const gap = Math.max(0.008, nextTime - bp.time);

      // Glide mapping:
      // At 0%: 8ms hop between notes
      // At 100%: smooth slide over whole gap
      const slideSeconds = 0.008 + glideFraction * Math.max(0, gap - 0.008);

      breakpoints.push({
        timeSeconds: bp.time,
        midi: bp.midi,
        freq: midiToFrequency(bp.midi),
        slideSeconds,
        normX: bp.x,
        normY: bp.y,
      });
    }

    result.push({
      strokeId: stroke.id,
      trackId: stroke.trackId,
      startTime,
      endTime,
      initialMidi,
      initialFreq: midiToFrequency(initialMidi),
      velocity: baseVelocity,
      startX,
      startY,
      breakpoints,
    });
  }

  return result;
}
