import { Stroke } from '../state';
import { DRUM_LANES, DrumSoundId, yToDrumSound } from './drums';

export interface BeatHitEvent {
  time: number; // Scheduled Tone.Part transport time in seconds
  timeSeconds?: number;
  soundId: DrumSoundId;
  laneIndex: number;
  velocity: number;
  strokeId: string;
  trackId: string;
  normX: number;
  normY: number;
}

export type BeatRate = '1/4' | '1/8' | '1/8T' | '1/16' | '1/32';

export interface BeatScheduleOptions {
  bpm: number;
  bars: number;
  rate?: BeatRate;
  swing?: number; // 0 to 60 (%)
  humanize?: number; // 0 to 100 (%)
}

/**
 * Converts strokes drawn on a beat track into scheduled drum hit events.
 */
export function generateBeatEventsFromStrokes(
  strokes: Stroke[],
  options: BeatScheduleOptions
): BeatHitEvent[] {
  if (strokes.length === 0) return [];

  const { bpm, bars, rate = '1/16', swing = 0, humanize = 15 } = options;
  const loopDuration = bars * 4 * (60 / bpm);
  const total16thSteps = bars * 16;
  const stepDuration = 60 / (bpm * 4); // duration of one 16th note in seconds

  const rawHits: BeatHitEvent[] = [];

  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length === 0) continue;

    const baseVelocity = Math.min(0.95, Math.max(0.5, 0.65 + (stroke.width / 4) * 0.25));

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

    const spanX = maxX - minX;
    const spanY = maxY - minY;

    // Classification 1: Single point or very short tap
    if (pts.length === 1 || (spanX < 0.03 && spanY < 0.08)) {
      const p = pts[0];
      const stepIndex = Math.max(0, Math.min(total16thSteps - 1, Math.round(p.x * total16thSteps)));
      const baseTime = stepIndex * stepDuration;
      const soundId = yToDrumSound(p.y);
      const laneIndex = Math.max(0, Math.min(7, Math.floor(p.y * 8)));

      rawHits.push({
        time: baseTime,
        timeSeconds: baseTime,
        soundId,
        laneIndex,
        velocity: baseVelocity,
        strokeId: stroke.id,
        trackId: stroke.trackId,
        normX: stepIndex / total16thSteps,
        normY: (laneIndex + 0.5) / 8,
      });
      continue;
    }

    // Classification 2: Horizontal line in a single lane (spanY < 0.14)
    if (spanY < 0.14 && spanX >= 0.03) {
      let rateInterval16ths = 1;
      if (rate === '1/4') rateInterval16ths = 4;
      else if (rate === '1/8') rateInterval16ths = 2;
      else if (rate === '1/8T') rateInterval16ths = 4 / 3;
      else if (rate === '1/16') rateInterval16ths = 1;
      else if (rate === '1/32') rateInterval16ths = 0.5;

      const startStep = Math.max(0, Math.floor(minX * total16thSteps));
      const endStep = Math.min(total16thSteps - 1, Math.ceil(maxX * total16thSteps));
      const midY = (minY + maxY) / 2;
      const laneIndex = Math.max(0, Math.min(7, Math.floor(midY * 8)));
      const soundId = DRUM_LANES[laneIndex].id;

      let hitCounter = 0;
      for (let s = startStep; s <= endStep; s += rateInterval16ths) {
        if (s < 0 || s >= total16thSteps) continue;
        const timeSec = s * stepDuration;
        const isAccented = hitCounter % 4 === 0;
        const vel = Math.min(1.0, isAccented ? baseVelocity + 0.12 : baseVelocity);

        rawHits.push({
          time: timeSec,
          timeSeconds: timeSec,
          soundId,
          laneIndex,
          velocity: vel,
          strokeId: stroke.id,
          trackId: stroke.trackId,
          normX: s / total16thSteps,
          normY: (laneIndex + 0.5) / 8,
        });
        hitCounter++;
      }
      continue;
    }

    // Classification 3: Vertical stroke across lanes (near vertical: spanX < 0.04)
    const isNearVertical = spanX < 0.04;
    if (isNearVertical) {
      const crossedLanes = new Set<number>();
      const orderedLanes: number[] = [];
      for (const p of pts) {
        const lane = Math.max(0, Math.min(7, Math.floor(p.y * 8)));
        if (!crossedLanes.has(lane)) {
          crossedLanes.add(lane);
          orderedLanes.push(lane);
        }
      }
      const midX = (minX + maxX) / 2;
      const baseStep = Math.max(0, Math.min(total16thSteps - 1, Math.round(midX * total16thSteps)));
      const count = orderedLanes.length;
      for (let i = 0; i < count; i++) {
        const lane = orderedLanes[i];
        const staggerSec = i * (stepDuration * 0.5); // 32nd note stagger
        const timeSec = Math.min(loopDuration - 0.01, baseStep * stepDuration + staggerSec);
        rawHits.push({
          time: timeSec,
          timeSeconds: timeSec,
          soundId: DRUM_LANES[lane].id,
          laneIndex: lane,
          velocity: Math.max(0.45, baseVelocity - i * 0.03),
          strokeId: stroke.id,
          trackId: stroke.trackId,
          normX: midX,
          normY: (lane + 0.5) / 8,
        });
      }
      continue;
    }

    // Classification 4: Multi-lane diagonal, zigzag, or scribble stroke
    // Discretize into 16th-note steps across its X span. At each step, trigger crossed lanes!
    const startStep = Math.max(0, Math.floor(minX * total16thSteps));
    const endStep = Math.min(total16thSteps - 1, Math.ceil(maxX * total16thSteps));
    let hitCounter = 0;

    for (let s = startStep; s <= endStep; s++) {
      const stepX = (s + 0.5) / total16thSteps;
      if (stepX < minX || stepX > maxX) continue;

      const hitsAtStep: number[] = [];
      for (let k = 0; k < pts.length - 1; k++) {
        const p1 = pts[k];
        const p2 = pts[k + 1];
        const segMinX = Math.min(p1.x, p2.x);
        const segMaxX = Math.max(p1.x, p2.x);

        if (stepX >= segMinX && stepX <= segMaxX) {
          const dx = p2.x - p1.x;
          const t = Math.abs(dx) > 0.0001 ? (stepX - p1.x) / dx : 0.5;
          const y = p1.y + t * (p2.y - p1.y);
          const lane = Math.max(0, Math.min(7, Math.floor(y * 8)));
          if (!hitsAtStep.includes(lane)) {
            hitsAtStep.push(lane);
          }
        }
      }

      if (hitsAtStep.length === 0) {
        let closest = pts[0];
        let closestDist = Infinity;
        for (const p of pts) {
          const d = Math.abs(p.x - stepX);
          if (d < closestDist) {
            closestDist = d;
            closest = p;
          }
        }
        hitsAtStep.push(Math.max(0, Math.min(7, Math.floor(closest.y * 8))));
      }

      const timeSec = s * stepDuration;
      for (const lane of hitsAtStep) {
        const isAccented = hitCounter % 4 === 0;
        const vel = Math.min(1.0, isAccented ? baseVelocity + 0.1 : baseVelocity);
        rawHits.push({
          time: timeSec,
          timeSeconds: timeSec,
          soundId: DRUM_LANES[lane].id,
          laneIndex: lane,
          velocity: vel,
          strokeId: stroke.id,
          trackId: stroke.trackId,
          normX: stepX,
          normY: (lane + 0.5) / 8,
        });
        hitCounter++;
      }
    }
  }

  // Apply swing & humanize timing jitter and velocity variation
  const finalHits: BeatHitEvent[] = [];
  const swingFraction = Math.max(0, Math.min(0.6, swing / 100));
  const humanFraction = Math.max(0, Math.min(1.0, humanize / 100));

  for (const hit of rawHits) {
    let t = hit.time;

    // Swing applied to off-beat 16th notes
    const stepInBar = Math.round(t / stepDuration) % 4;
    if (stepInBar === 1 || stepInBar === 3) {
      t += swingFraction * (stepDuration * 0.35);
    }

    // Humanize timing jitter: up to 8ms
    const timeJitter = (Math.random() * 2 - 1) * (0.008 * humanFraction);
    t = Math.max(0, Math.min(loopDuration - 0.005, t + timeJitter));

    // Humanize velocity jitter: up to 10%
    const velJitter = (Math.random() * 2 - 1) * (0.1 * humanFraction);
    const finalVel = Math.max(0.3, Math.min(1.0, hit.velocity + velJitter));

    finalHits.push({
      ...hit,
      time: t,
      timeSeconds: t,
      velocity: finalVel,
    });
  }

  // Sort chronologically
  finalHits.sort((a, b) => a.time - b.time);
  return finalHits;
}
