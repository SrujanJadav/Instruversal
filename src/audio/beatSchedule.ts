import { Stroke } from '../state';
import { DRUM_LANES, DrumSoundId, yToDrumSound } from './drums';

export interface BeatHitEvent {
  soundId: DrumSoundId;
  laneIndex: number;
  timeSeconds: number;
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

    // Classification 1: Tap / Short stroke
    if (pts.length === 1 || (spanX < 0.025 && spanY < 0.05)) {
      const p = pts[0];
      const stepIndex = Math.max(0, Math.min(total16thSteps - 1, Math.round(p.x * total16thSteps)));
      const baseTime = stepIndex * stepDuration;
      const soundId = yToDrumSound(p.y);
      const laneIndex = Math.max(0, Math.min(7, Math.floor(p.y * 8)));

      rawHits.push({
        soundId,
        laneIndex,
        timeSeconds: baseTime,
        velocity: baseVelocity,
        strokeId: stroke.id,
        trackId: stroke.trackId,
        normX: stepIndex / total16thSteps,
        normY: (laneIndex + 0.5) / 8,
      });
      continue;
    }

    // Classification 2: Vertical or diagonal stroke crossing multiple lanes (Drum roll / fill)
    if (spanY >= 0.18 && spanY > spanX * 1.5) {
      // Sort points by X or time order so roll advances with playhead
      const sorted = [...pts].sort((a, b) => a.x - b.x);
      const crossedLanes = new Set<number>();
      const laneHits: { lane: number; x: number; y: number }[] = [];

      for (const pt of sorted) {
        const lane = Math.max(0, Math.min(7, Math.floor(pt.y * 8)));
        if (!crossedLanes.has(lane)) {
          crossedLanes.add(lane);
          laneHits.push({ lane, x: pt.x, y: pt.y });
        }
      }

      const count = laneHits.length;
      for (let i = 0; i < count; i++) {
        const hit = laneHits[i];
        const stepProgress = minX + (i / Math.max(1, count - 1)) * Math.max(0.015, spanX);
        const timeSec = stepProgress * loopDuration;
        const soundId = DRUM_LANES[hit.lane].id;

        rawHits.push({
          soundId,
          laneIndex: hit.lane,
          timeSeconds: timeSec,
          velocity: Math.max(0.45, baseVelocity - i * 0.03),
          strokeId: stroke.id,
          trackId: stroke.trackId,
          normX: stepProgress,
          normY: (hit.lane + 0.5) / 8,
        });
      }
      continue;
    }

    // Classification 3: Horizontal line in a lane (repeating hits at selected Rate)
    // Rate step spacing in 16th increments
    let rateInterval16ths = 1;
    if (rate === '1/4') rateInterval16ths = 4;
    else if (rate === '1/8') rateInterval16ths = 2;
    else if (rate === '1/8T') rateInterval16ths = 4 / 3;
    else if (rate === '1/16') rateInterval16ths = 1;
    else if (rate === '1/32') rateInterval16ths = 0.5;

    const startStep = Math.floor(minX * total16thSteps);
    const endStep = Math.ceil(maxX * total16thSteps);
    const midY = (minY + maxY) / 2;
    const laneIndex = Math.max(0, Math.min(7, Math.floor(midY * 8)));
    const soundId = DRUM_LANES[laneIndex].id;

    let hitCounter = 0;
    for (let s = startStep; s <= endStep; s += rateInterval16ths) {
      if (s < 0 || s >= total16thSteps) continue;
      const timeSec = s * stepDuration;
      // Accent every 4th hit slightly louder
      const isAccented = hitCounter % 4 === 0;
      const vel = Math.min(1.0, isAccented ? baseVelocity + 0.12 : baseVelocity);

      rawHits.push({
        soundId,
        laneIndex,
        timeSeconds: timeSec,
        velocity: vel,
        strokeId: stroke.id,
        trackId: stroke.trackId,
        normX: s / total16thSteps,
        normY: (laneIndex + 0.5) / 8,
      });
      hitCounter++;
    }
  }

  // Apply swing & humanize timing jitter and velocity variation
  const finalHits: BeatHitEvent[] = [];
  const swingFraction = Math.max(0, Math.min(0.6, swing / 100));
  const humanFraction = Math.max(0, Math.min(1.0, humanize / 100));

  for (const hit of rawHits) {
    let t = hit.timeSeconds;

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
      timeSeconds: t,
      velocity: finalVel,
    });
  }

  // Sort chronologically
  finalHits.sort((a, b) => a.timeSeconds - b.timeSeconds);
  return finalHits;
}
