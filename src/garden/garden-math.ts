/**
 * garden-math.ts
 *
 * Mathematical models, spring physics, and procedural curve generators
 * for the Instruversal Rose & Vine Garden centered behind the wordmark.
 *
 * Clean-room implementation from first principles.
 */

export interface Vector2D {
  x: number;
  y: number;
}

export interface VineLeafModel {
  segmentIndex: number;
  tOnVine: number;
  side: -1 | 1;
  baseAngle: number;
  length: number;
  width: number;
  veinLength: number;
  spawnTimeMs: number;
}

export interface RosePetalModel {
  index: number;
  baseAngle: number;
  radiusX: number;
  radiusY: number;
  wobbleFreqA: number;
  wobbleFreqB: number;
  wobbleAmp: number;
  staggerMs: number;
}

export interface RoseFlowerModel {
  vineId: number;
  tipIndex: number;
  isBud: boolean;
  radius: number;
  spiralTurns: number;
  spiralLength: number;
  spawnTimeMs: number;
  petals: RosePetalModel[];
  hasEdgeDetail: boolean;
  offsetFromParent?: Vector2D;
}

export interface VineStemModel {
  id: number;
  side: 'left' | 'right';
  basePoint: Vector2D;
  targetLength: number;
  angle: number;
  curvature: number;
  waveCount: number;
  waveAmplitude: number;
  totalGrowthDurationMs: number;
  segments: Vector2D[];
  thorns: { segmentIndex: number; side: -1 | 1; length: number }[];
  leaves: VineLeafModel[];
  hasCurlEnd: boolean;
  curlAngle: number;
  rose: RoseFlowerModel | null;
  secondaryBud: RoseFlowerModel | null;
  branch: {
    startSegment: number;
    angleOffset: number;
    length: number;
    segments: Vector2D[];
    leaves: VineLeafModel[];
    rose: RoseFlowerModel | null;
  } | null;
}

export interface WordmarkGardenModel {
  wordmarkWidth: number;
  wordmarkHeight: number;
  letterUnitSize: number;
  vines: VineStemModel[];
}

/**
 * Deterministic pseudo-random generator (Mulberry32).
 */
export function createRng(seed: number = 77): () => number {
  let s = (seed ^ 0x6d2b79f5) >>> 0;
  return function (): number {
    s = (s + 0x9e3779b9) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(val: number, min: number, max: number): number {
  if (val < min) return min;
  if (val > max) return max;
  return val;
}

export function easeOutCubic(t: number): number {
  const c = clamp(t, 0, 1);
  const inv = 1 - c;
  return 1 - inv * inv * inv;
}

/**
 * Analytical damped spring value evaluation for smooth organic unfurling.
 * Solves underdamped harmonic oscillator: x(t) = 1 - e^(-gamma * t) * (cos(omega_d * t) + (gamma / omega_d) * sin(omega_d * t))
 */
export function evaluateSpring(
  elapsedSec: number,
  stiffness: number = 8.0,
  damping: number = 14.0
): number {
  if (elapsedSec <= 0) return 0;
  const mass = 1.0;
  const gamma = damping / (2 * mass);
  const omega0Sq = stiffness / mass;
  const omegaDSq = omega0Sq - gamma * gamma;

  if (omegaDSq > 0) {
    const omegaD = Math.sqrt(omegaDSq);
    const envelope = Math.exp(-gamma * elapsedSec);
    const osc = Math.cos(omegaD * elapsedSec) + (gamma / omegaD) * Math.sin(omegaD * elapsedSec);
    return clamp(1.0 - envelope * osc, 0, 1.25);
  } else {
    // Critically damped / overdamped fallback
    return clamp(1.0 - Math.exp(-gamma * elapsedSec) * (1.0 + gamma * elapsedSec), 0, 1.0);
  }
}

/**
 * Generates the procedural backbone segments for a single vine stem.
 */
export function generateVineCurve(
  origin: Vector2D,
  directionAngle: number,
  length: number,
  waveAmplitude: number,
  waveCount: number,
  bendAngle: number,
  segmentCount: number = 40
): Vector2D[] {
  const points: Vector2D[] = [origin];
  const stepDist = length / segmentCount;

  let currentX = origin.x;
  let currentY = origin.y;
  let currentAngle = directionAngle;

  for (let i = 1; i <= segmentCount; i++) {
    const progress = i / segmentCount;
    // Bending curve
    const bendProgress = progress * bendAngle;
    // Sinusoidal wave oscillation along the spine
    const waveOffset = Math.sin(progress * waveCount * Math.PI * 2) * waveAmplitude;
    const effectiveAngle = currentAngle + bendProgress + waveOffset * 0.45;

    currentX += Math.cos(effectiveAngle) * stepDist;
    currentY += Math.sin(effectiveAngle) * stepDist;

    points.push({ x: currentX, y: currentY });
  }

  return points;
}

/**
 * Computes wind sway deflection offset at a point along the vine.
 */
export function computeGardenWindSway(
  timeSec: number,
  stemBaseX: number,
  heightFrac: number
): number {
  const h = clamp(heightFrac, 0, 1);
  if (h === 0) return 0;
  const hSq = h * h;
  // Frequency ~1.6 cycles per second (wobble)
  const oscA = Math.sin(timeSec * (1.6 * Math.PI * 2) + stemBaseX * 0.02) * 2.5;
  const oscB = Math.sin(timeSec * (0.8 * Math.PI * 2) + stemBaseX * 0.01 + 1.1) * 1.5;
  return hSq * (oscA + oscB);
}

/**
 * Computes traveling gust deflection moving from left to right every 12-20s.
 */
export function computeGardenGust(
  timeSec: number,
  gardenWidth: number,
  pointX: number,
  heightFrac: number,
  letterUnitSize: number
): { offsetX: number; angleRot: number } {
  const gustPeriod = 15.0;
  const sweepDuration = 2.8;
  const cycleTime = ((timeSec % gustPeriod) + gustPeriod) % gustPeriod;

  if (cycleTime > sweepDuration) {
    return { offsetX: 0, angleRot: 0 };
  }

  const sweepProgress = cycleTime / sweepDuration;
  const gustFrontX = -100 + sweepProgress * (gardenWidth + 200);

  // Traveling pulse: strong on front edge, decaying behind
  const dist = pointX - gustFrontX;
  let factor = 0;
  if (dist <= 0 && dist > -300) {
    // Decaying tail
    factor = Math.exp((dist / 140) * 1.5);
  } else if (dist > 0 && dist < 80) {
    // Sharp front edge
    factor = 1.0 - dist / 80;
  }

  const hSq = Math.pow(clamp(heightFrac, 0, 1), 2);
  const maxDisplacement = letterUnitSize * 0.14;
  const displacement = factor * maxDisplacement * hSq;

  return {
    offsetX: displacement,
    angleRot: factor * 0.18 * hSq,
  };
}

/**
 * Computes pointer proximity pull with smoothstep falloff over 300px.
 */
export function computePointerLean(
  point: Vector2D,
  pointerPos: Vector2D | null,
  heightFrac: number
): { dx: number; dy: number } {
  if (!pointerPos) return { dx: 0, dy: 0 };

  const dx = pointerPos.x - point.x;
  const dy = pointerPos.y - point.y;
  const dist = Math.hypot(dx, dy);
  const maxRadius = 320;

  if (dist >= maxRadius || dist <= 1) return { dx: 0, dy: 0 };

  // Smoothstep falloff: 3*t^2 - 2*t^3
  const t = 1.0 - dist / maxRadius;
  const strength = t * t * (3.0 - 2.0 * t);
  const hFrac = clamp(heightFrac, 0, 1);

  const pullMagnitude = strength * 8.0 * hFrac;
  const normX = dx / dist;
  const normY = dy / dist;

  return {
    dx: normX * pullMagnitude,
    dy: normY * pullMagnitude,
  };
}

/**
 * Hand-drawn boil jitter offset updated every 120ms.
 */
export function computeBoilOffset(
  elementId: number,
  timeSec: number,
  letterUnitSize: number
): { bx: number; by: number } {
  const boilFrame = Math.floor(timeSec / 0.12);
  const seed = (elementId * 7919 + boilFrame * 1013) & 0xffff;
  const rng = createRng(seed);

  const maxJitter = letterUnitSize * 0.012;
  const bx = (rng() - 0.5) * 2 * maxJitter;
  const by = (rng() - 0.5) * 2 * maxJitter;

  return { bx, by };
}

/**
 * Builds full procedural garden model centered behind wordmark dimensions.
 */
export function generateWordmarkGarden(
  wordmarkWidth: number,
  wordmarkHeight: number,
  seed: number = 33
): WordmarkGardenModel {
  const rng = createRng(seed);

  // Approximate capital letter height for relative botanical sizing
  const letterUnitSize = wordmarkHeight * 0.72;

  // Stems start on the left and right flanks of the name bounds
  const vineCount = 8;
  const vines: VineStemModel[] = [];

  const leftBases: Vector2D[] = [
    { x: wordmarkWidth * 0.08, y: wordmarkHeight * 0.85 },
    { x: wordmarkWidth * 0.12, y: wordmarkHeight * 0.72 },
    { x: wordmarkWidth * 0.18, y: wordmarkHeight * 0.92 },
    { x: wordmarkWidth * 0.25, y: wordmarkHeight * 0.8 },
  ];

  const rightBases: Vector2D[] = [
    { x: wordmarkWidth * 0.92, y: wordmarkHeight * 0.82 },
    { x: wordmarkWidth * 0.86, y: wordmarkHeight * 0.74 },
    { x: wordmarkWidth * 0.8, y: wordmarkHeight * 0.9 },
    { x: wordmarkWidth * 0.72, y: wordmarkHeight * 0.78 },
  ];

  for (let i = 0; i < vineCount; i++) {
    const isLeft = i < 4;
    const baseList = isLeft ? leftBases : rightBases;
    const base = baseList[i % 4];

    // Direction curves upwards and arches inward across the wordmark letters
    const dir = isLeft
      ? -Math.PI * (0.35 + rng() * 0.28)
      : -Math.PI * (0.65 - rng() * 0.28);

    const length = letterUnitSize * (1.1 + rng() * 0.65);
    const waveAmp = 0.35 + rng() * 0.45;
    const waveCount = 1.0 + rng() * 1.5;
    const bend = (isLeft ? 0.35 : -0.35) + (rng() - 0.5) * 0.3;

    const segments = generateVineCurve(base, dir, length, waveAmp, waveCount, bend, 40);

    // Growth time: max(320ms, length * 620ms) scaled to total 2.5s timeline
    const growthDurationMs = Math.max(800, length * 8.5);

    // Thorns: 0-2 per vine
    const thorns: { segmentIndex: number; side: -1 | 1; length: number }[] = [];
    const thornCount = Math.floor(rng() * 2.2);
    for (let th = 0; th < thornCount; th++) {
      thorns.push({
        segmentIndex: 10 + Math.floor(rng() * 22),
        side: rng() > 0.5 ? 1 : -1,
        length: letterUnitSize * (0.05 + rng() * 0.04),
      });
    }

    // Leaves along vine
    const leaves: VineLeafModel[] = [];
    const leafPairCount = 4 + Math.floor(rng() * 3);
    for (let lf = 0; lf < leafPairCount; lf++) {
      const segIndex = 8 + Math.floor((lf / leafPairCount) * 26) + Math.floor(rng() * 3);
      leaves.push({
        segmentIndex: Math.min(36, segIndex),
        tOnVine: segIndex / 40,
        side: lf % 2 === 0 ? 1 : -1,
        baseAngle: (lf % 2 === 0 ? 0.8 : -0.8) + (rng() - 0.5) * 0.3,
        length: letterUnitSize * (0.16 + rng() * 0.15),
        width: letterUnitSize * (0.07 + rng() * 0.05),
        veinLength: letterUnitSize * 0.14,
        spawnTimeMs: (segIndex / 40) * 1600,
      });
    }

    // Blooming rose at vine tip (1 in 2 vines receives a primary rose to match the artwork density)
    const hasRose = i % 2 === 0 || i === 5 || i === 7;
    let rose: RoseFlowerModel | null = null;
    let secondaryBud: RoseFlowerModel | null = null;

    if (hasRose) {
      const roseRadius = letterUnitSize * (0.16 + rng() * 0.12);
      const petals: RosePetalModel[] = [];
      // 6 petals: top, 2 upper sides, 2 lower sides, bottom
      const petalAngles = [
        -Math.PI / 2,
        -Math.PI * 0.8,
        -Math.PI * 0.2,
        Math.PI * 0.8,
        Math.PI * 0.2,
        Math.PI / 2,
      ];

      for (let p = 0; p < 6; p++) {
        petals.push({
          index: p,
          baseAngle: petalAngles[p] + (rng() - 0.5) * 0.2,
          radiusX: roseRadius * (0.75 + rng() * 0.2),
          radiusY: roseRadius * (0.65 + rng() * 0.25),
          wobbleFreqA: 3,
          wobbleFreqB: 5,
          wobbleAmp: roseRadius * 0.08,
          staggerMs: p * 85,
        });
      }

      rose = {
        vineId: i,
        tipIndex: 39,
        isBud: false,
        radius: roseRadius,
        spiralTurns: 1.6 + rng() * 0.8,
        spiralLength: roseRadius * 0.85,
        spawnTimeMs: 1400 + i * 200,
        petals,
        hasEdgeDetail: roseRadius > 14,
      };

      // Optional smaller bud nearby (1 in 3 roses gets a secondary bud)
      if (rng() > 0.45) {
        const budRadius = roseRadius * 0.58;
        const budAngle = dir + (rng() - 0.5) * 0.9;
        const budPetals: RosePetalModel[] = [];
        for (let bp = 0; bp < 5; bp++) {
          budPetals.push({
            index: bp,
            baseAngle: (bp / 5) * Math.PI * 2,
            radiusX: budRadius * 0.8,
            radiusY: budRadius * 0.7,
            wobbleFreqA: 3,
            wobbleFreqB: 5,
            wobbleAmp: budRadius * 0.06,
            staggerMs: bp * 70,
          });
        }

        secondaryBud = {
          vineId: i,
          tipIndex: 39,
          isBud: true,
          radius: budRadius,
          spiralTurns: 1.2,
          spiralLength: budRadius * 0.6,
          spawnTimeMs: rose.spawnTimeMs + 280,
          petals: budPetals,
          hasEdgeDetail: false,
          offsetFromParent: {
            x: Math.cos(budAngle) * (roseRadius * 1.4),
            y: Math.sin(budAngle) * (roseRadius * 1.4),
          },
        };
      }
    }

    // Branching: ~30% of vines spawn side branch
    let branch: VineStemModel['branch'] = null;
    if (rng() > 0.65) {
      const branchStart = 16 + Math.floor(rng() * 12);
      const branchAngleOffset = (rng() > 0.5 ? 0.85 : -0.85) + (rng() - 0.5) * 0.2;
      const branchLen = length * (0.4 + rng() * 0.15);
      const branchOrigin = segments[branchStart];

      const branchSegments = generateVineCurve(
        branchOrigin,
        dir + branchAngleOffset,
        branchLen,
        waveAmp * 0.8,
        1.2,
        bend * 0.5,
        24
      );

      const branchLeaves: VineLeafModel[] = [
        {
          segmentIndex: 12,
          tOnVine: 0.5,
          side: 1,
          baseAngle: 0.85,
          length: letterUnitSize * 0.18,
          width: letterUnitSize * 0.08,
          veinLength: letterUnitSize * 0.14,
          spawnTimeMs: 1200,
        },
      ];

      branch = {
        startSegment: branchStart,
        angleOffset: branchAngleOffset,
        length: branchLen,
        segments: branchSegments,
        leaves: branchLeaves,
        rose: null,
      };
    }

    vines.push({
      id: i,
      side: isLeft ? 'left' : 'right',
      basePoint: base,
      targetLength: length,
      angle: dir,
      curvature: bend,
      waveCount,
      waveAmplitude: waveAmp,
      totalGrowthDurationMs: growthDurationMs,
      segments,
      thorns,
      leaves,
      hasCurlEnd: rng() > 0.45,
      curlAngle: (rng() > 0.5 ? 1.6 : -1.6),
      rose,
      secondaryBud,
      branch,
    });
  }

  return {
    wordmarkWidth,
    wordmarkHeight,
    letterUnitSize,
    vines,
  };
}
