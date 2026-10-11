import { Stroke, BeatFlowStyle } from '../state';

export interface BeatFlowBreakpoint {
  timeSeconds: number;
  normX: number;
  normY: number;
  freqOrY: number;
  slideSeconds: number;
  width: number;
}

export interface BeatFlowRollHit {
  timeSeconds: number;
  normX: number;
  normY: number;
  velocity: number;
  width: number;
}

export interface BeatFlowStrokeEvent {
  strokeId: string;
  trackId: string;
  style: BeatFlowStyle;
  startTime: number;
  endTime: number;
  initialFreqOrY: number;
  initialVelocity: number;
  initialWidth: number;
  startX: number;
  startY: number;
  breakpoints: BeatFlowBreakpoint[];
  rollHits: BeatFlowRollHit[];
}

/**
 * Frequency mapping for Glide: Sub/bass range across 3 octaves.
 * From C1 (32.703 Hz) at bottom (normY = 1.0) to C4 (261.626 Hz) at top (normY = 0.0).
 */
export function normYToGlideFreq(normY: number): number {
  const clampedY = Math.max(0, Math.min(1, normY));
  // 3 octaves = 2^3 = 8
  return 32.703 * Math.pow(8, 1 - clampedY);
}

/**
 * Filter cutoff mapping for Sweep: 400 Hz (bottom) to 10,000 Hz (top).
 */
export function normYToSweepCutoff(normY: number): number {
  const clampedY = Math.max(0, Math.min(1, normY));
  return 400 * Math.pow(10000 / 400, 1 - clampedY);
}

/**
 * Pure function: converts beat strokes into continuous flow playback events
 * for Glide, Roll, and Sweep styles.
 * Retriggering (for Roll) is scheduled ahead of time with exact timestamps,
 * capped to protect phone CPU.
 */
export function generateBeatFlowEventsFromStrokes(
  strokes: Stroke[],
  bars: number,
  bpm: number,
  style: BeatFlowStyle,
  glidePercent: number = 25
): BeatFlowStrokeEvent[] {
  if (strokes.length === 0) return [];

  const loopDuration = bars * 4 * (60 / bpm);
  const glideFraction = Math.max(0, Math.min(1, glidePercent / 100));
  const result: BeatFlowStrokeEvent[] = [];

  for (const stroke of strokes) {
    const rawPts = stroke.points;
    if (rawPts.length === 0) continue;

    // Sort by X so playback always follows playhead left to right
    const sorted = [...rawPts].sort((a, b) => a.x - b.x);

    const xMin = sorted[0].x;
    const xMax = sorted[sorted.length - 1].x;

    const baseVelocity = Math.min(0.95, Math.max(0.45, 0.55 + (stroke.width / 4) * 0.25));

    // Piecewise linear interpolation of y at any targetX
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

    const isNearVertical = (xMax - xMin) < 0.03;
    const minSpanSec = 0.12; // 120ms minimum span

    let startTime: number;
    let endTime: number;
    let startX: number;
    let startY: number;

    if (isNearVertical) {
      startX = (xMin + xMax) / 2;
      startTime = Math.min(startX * loopDuration, Math.max(0, loopDuration - minSpanSec));
      endTime = Math.min(loopDuration, startTime + minSpanSec);
      startY = sorted[0].y;
    } else {
      startX = xMin;
      startTime = xMin * loopDuration;
      endTime = Math.min(loopDuration, Math.max(startTime + 0.08, xMax * loopDuration));
      startY = interpY(xMin);
    }

    const duration = endTime - startTime;
    if (duration <= 0.001) continue;

    const breakpoints: BeatFlowBreakpoint[] = [];
    const rollHits: BeatFlowRollHit[] = [];

    let initialFreqOrY: number;
    if (style === 'glide') {
      initialFreqOrY = normYToGlideFreq(startY);
    } else if (style === 'sweep') {
      initialFreqOrY = startY;
    } else {
      // Roll
      initialFreqOrY = startY;
    }

    if (style === 'roll') {
      // Retriggering drum voice: rate follows vertical position / slope from 1/8 note to 1/64 note
      // Hard cap: maximum 30 hits per second (minimum interval 0.033s)
      const beatSec = 60 / bpm;
      const slowestIntervalSec = 0.5 * beatSec; // 1/8 note
      const fastestIntervalSec = 0.0625 * beatSec; // 1/64 note
      const minSafeIntervalSec = 0.033; // ~30 hits/s max cap for phone CPU safety

      let curTime = startTime;
      let hitCount = 0;
      const maxHitsPerStroke = 200;

      while (curTime < endTime && hitCount < maxHitsPerStroke) {
        const progress = Math.max(0, Math.min(1, (curTime - startTime) / duration));
        const curX = isNearVertical ? startX : startX + progress * (xMax - startX);
        const curY = isNearVertical
          ? sorted[0].y + progress * (sorted[sorted.length - 1].y - sorted[0].y)
          : interpY(curX);

        // Height factor: 0 at bottom, 1 at top
        const heightFactor = Math.max(0, Math.min(1, 1 - curY));

        // Smoothly ramp interval from 1/8 note to 1/64 note
        const rawInterval = slowestIntervalSec * Math.pow(fastestIntervalSec / slowestIntervalSec, heightFactor);
        const intervalSec = Math.max(minSafeIntervalSec, rawInterval);

        // Velocity swell along stroke
        const swell = Math.sin(Math.PI * progress);
        const hitVel = Math.min(1.0, Math.max(0.35, (baseVelocity * 0.8) + (swell * 0.2)));

        rollHits.push({
          timeSeconds: curTime,
          normX: curX,
          normY: curY,
          velocity: hitVel,
          width: stroke.width,
        });

        curTime += intervalSec;
        hitCount++;
      }
    } else {
      // Glide or Sweep: Sample continuous parameter changes
      const sampleSteps = isNearVertical ? 12 : Math.min(48, Math.max(8, Math.round((xMax - xMin) * 80)));
      const stepDuration = duration / sampleSteps;

      for (let s = 1; s <= sampleSteps; s++) {
        const progress = s / sampleSteps;
        const curTime = startTime + progress * duration;
        const curX = isNearVertical ? startX : startX + progress * (xMax - startX);
        const curY = isNearVertical
          ? sorted[0].y + progress * (sorted[sorted.length - 1].y - sorted[0].y)
          : interpY(curX);

        let freqOrY: number;
        if (style === 'glide') {
          freqOrY = normYToGlideFreq(curY);
        } else {
          freqOrY = curY;
        }

        const slideSeconds = 0.008 + glideFraction * Math.max(0, stepDuration - 0.008);

        breakpoints.push({
          timeSeconds: curTime,
          normX: curX,
          normY: curY,
          freqOrY,
          slideSeconds,
          width: stroke.width,
        });
      }
    }

    result.push({
      strokeId: stroke.id,
      trackId: stroke.trackId,
      style,
      startTime,
      endTime,
      initialFreqOrY,
      initialVelocity: baseVelocity,
      initialWidth: stroke.width,
      startX,
      startY,
      breakpoints,
      rollHits,
    });
  }

  return result;
}
